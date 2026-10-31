import asyncio
import time
from typing import Optional
import redis.asyncio as redis
from app.core.config import settings


class RedisClient:

    _instance: Optional['RedisClient'] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._client = None
            cls._instance._connected = False
            cls._instance._last_failure_time = 0.0
            cls._instance._cooldown_seconds = 30.0
            cls._instance._lock: Optional[asyncio.Lock] = None
        return cls._instance

    def __init__(self):
        # Prevent re-initialization of singleton state on subsequent calls
        pass

    @property
    def lock(self) -> asyncio.Lock:
        """Lazily initialize asyncio.Lock on current event loop."""
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    async def connect(self, force: bool = False) -> None:
        """
        Connect to Redis with bounded timeouts, mutex lock, and circuit breaker cooldown.
        If in cooldown and force is False, raises ConnectionError immediately.
        """
        async with self.lock:
            # Check if another concurrent coroutine already connected while waiting for lock
            if self._connected and not force and self._client:
                return

            now = time.monotonic()
            if not force and (now - self._last_failure_time < self._cooldown_seconds):
                remaining = int(self._cooldown_seconds - (now - self._last_failure_time))
                raise redis.ConnectionError(
                    f"Redis client in circuit breaker cooldown ({remaining}s remaining)."
                )

            try:
                redis_url = getattr(settings, 'redis_url', 'redis://localhost:6379')

                # Clean up prior client instance if open
                if self._client:
                    try:
                        if hasattr(self._client, 'aclose'):
                            await self._client.aclose()
                        else:
                            await self._client.close()
                    except Exception:
                        pass
                    self._client = None

                self._client = redis.Redis.from_url(
                    redis_url,
                    decode_responses=True,
                    socket_connect_timeout=1.0,
                    socket_timeout=1.0,
                    retry_on_timeout=False
                )

                await self._client.ping()
                self._connected = True
                self._last_failure_time = 0.0
                print("Redis connected successfully")

            except (redis.ConnectionError, redis.TimeoutError, OSError) as e:
                self._connected = False
                self._last_failure_time = time.monotonic()
                if self._client:
                    try:
                        if hasattr(self._client, 'aclose'):
                            await self._client.aclose()
                        else:
                            await self._client.close()
                    except Exception:
                        pass
                    self._client = None
                print(f"Redis connection failed: {e}")
                raise redis.ConnectionError(str(e)) from e

    async def disconnect(self) -> None:
        """Close Redis connection"""
        async with self.lock:
            if self._client:
                try:
                    if hasattr(self._client, 'aclose'):
                        await self._client.aclose()
                    else:
                        await self._client.close()
                except Exception:
                    pass
            self._connected = False
            self._client = None
            self._lock = None
    
    async def get_client(self) -> redis.Redis:
        """Get Redis client instance"""
        if not self._connected:
            await self.connect()
        if not self._client:
            raise redis.ConnectionError("Redis client not available")
        return self._client
    
    async def ping(self) -> bool:
        """Check if Redis is available"""
        try:
            client = await self.get_client()
            return await client.ping()
        except Exception:
            return False
    
    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def is_in_cooldown(self) -> bool:
        return (time.monotonic() - self._last_failure_time) < self._cooldown_seconds

    def reset_circuit_breaker(self) -> None:
        """Manually clear circuit breaker cooldown (used in test isolation)"""
        self._last_failure_time = 0.0


# Singleton client
redis_client = RedisClient()
