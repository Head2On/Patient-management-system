import asyncio
import redis.asyncio as redis
from typing import Optional
from app.core.config import settings


class RedisClient:

    _instance: Optional['RedisClient'] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._clients = {}
        return cls._instance

    def _current_loop_key(self):
        try:
            return id(asyncio.get_running_loop())
        except RuntimeError:
            return None

    async def connect(self) -> None:
        loop_key = self._current_loop_key()
        redis_url = getattr(settings, 'redis_url', 'redis://localhost:6379')
        client = redis.Redis.from_url(
            redis_url,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
            retry_on_timeout=True,
        )
        await client.ping()
        self._clients[loop_key] = client
        print("Redis connected successfully")

    async def disconnect(self) -> None:
        loop_key = self._current_loop_key()
        client = self._clients.pop(loop_key, None)
        if client:
            await client.aclose()

    async def get_client(self) -> redis.Redis:
        loop_key = self._current_loop_key()
        client = self._clients.get(loop_key)
        if client is None:
            await self.connect()
            client = self._clients[loop_key]
        return client

    async def ping(self) -> bool:
        try:
            client = await self.get_client()
            return await client.ping()
        except Exception:
            return False

    @property
    def is_connected(self) -> bool:
        loop_key = self._current_loop_key()
        return loop_key in self._clients


redis_client = RedisClient()