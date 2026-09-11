import redis.asyncio as redis
from typing import Optional
from app.core.config import settings

class RedisClient:

    _instance: Optional['RedisClient'] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(). __new__(cls)
        return cls._instance

    def __init__(self):
        self._client: Optional[redis.Redis] = None
        self._connected = False

    async def connect(self) -> None:
        try:
            redis_url = getattr(settings, 'redis_url', 'redis://localhost:6379')

            self._client = redis.Redis.from_url(
                redis_url,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True
            )

            await self._client.ping()
            self._connected = True
            print("Redis connected successfully")

        except redis.ConnectionError as e:
            self._connected = False
            print(f"Redis connection failed: {e}")
            raise

    async def disconnect(self) -> None:
        """Close Redis connection"""

        if self._client:
           await self._client.close()
        self._connected = False
        self._client = None
    
    async def get_client(self) -> redis.Redis:
        """Get Redis client instance"""

        if not self._connected:
            await self.connect()
        if not self._client:
            raise ConnectionError("Redis client not available")
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

#Singletone client
redis_client = RedisClient()