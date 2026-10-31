import time
import pytest_asyncio
import pytest
import asyncio
import redis.asyncio as redis
from unittest.mock import patch
from app.core.redis_client import redis_client

pytestmark = pytest.mark.asyncio

@pytest_asyncio.fixture(autouse=True)
async def reset_redis_singleton():
    """Force the Singleton to disconnect and reset circuit breaker after every test."""
    yield
    await redis_client.disconnect()
    redis_client.reset_circuit_breaker()

class TestRedisClient:
    
    async def test_redis_connection(self):
        """Test Redis connection and PING"""
        # Ensure connection
        await redis_client.connect(force=True)
        assert redis_client.is_connected is True
        
        # Test PING
        result = await redis_client.ping()
        assert result is True
    
    async def test_redis_set_get(self):
        """Test Redis set/get operations"""
        client = await redis_client.get_client()
        
        # Set a value
        await client.set("test_key", "test_value")
        
        # Get the value
        value = await client.get("test_key")
        assert value == "test_value"

        await client.delete("test_key")

    async def test_redis_delete(self):
        """Test Redis delete operation"""
        client = await redis_client.get_client()
        
        # Set and delete
        await client.set("test_delete", "value")
        assert await client.get("test_delete") == "value"
        
        await client.delete("test_delete")
        assert await client.get("test_delete") is None
    
    async def test_redis_expire(self):
        """Test Redis expiration"""
        client = await redis_client.get_client()
        
        await client.set("test_expire", "temp", ex=1)
        assert await client.get("test_expire") == "temp"
        
        # Wait for expiration
        await asyncio.sleep(1.5)
        
        assert await client.get("test_expire") is None
    
    async def test_redis_incr(self):
        """Test Redis increment operation"""
        client = await redis_client.get_client()
        
        # Clean up
        await client.delete("test_counter")
        
        # Increment multiple times
        for i in range(1, 6):
            value = await client.incr("test_counter")
            assert value == i
        
        # Reset
        await client.delete("test_counter")
    
    async def test_redis_connection_pool(self):
        """Test Redis connection pooling"""
        client1 = await redis_client.get_client()
        client2 = await redis_client.get_client()
        
        # Should be the same instance (singleton)
        assert client1 is client2
    
    async def test_redis_ping(self):
        """Test PING failure when not connected"""
        assert await redis_client.ping() is True
    
    async def test_redis_connection_close(self):
        """Test disconnecting Redis"""
        await redis_client.connect(force=True)
        assert redis_client.is_connected is True
        
        await redis_client.disconnect()
        assert redis_client.is_connected is False
        
        # Reconnect for other tests
        await redis_client.connect(force=True)

    async def test_circuit_breaker_activates_on_failure(self):
        """Test that failed connection trips circuit breaker cooldown"""
        with patch("app.core.redis_client.settings") as mock_settings:
            mock_settings.redis_url = "redis://localhost:59999"
            with pytest.raises(redis.ConnectionError):
                await redis_client.connect(force=True)

        assert redis_client.is_connected is False
        assert redis_client.is_in_cooldown is True

    async def test_circuit_breaker_fast_rejection_during_cooldown(self):
        """Test that get_client rejects immediately when in cooldown without socket delay"""
        redis_client._last_failure_time = time.monotonic()
        assert redis_client.is_in_cooldown is True

        start_time = time.monotonic()
        with pytest.raises(redis.ConnectionError) as exc_info:
            await redis_client.get_client()
        elapsed = time.monotonic() - start_time

        assert "circuit breaker cooldown" in str(exc_info.value)
        # Must fail instantly (sub-50ms) instead of waiting for socket timeout
        assert elapsed < 0.1

    async def test_circuit_breaker_reset(self):
        """Test resetting the circuit breaker cooldown"""
        redis_client._last_failure_time = time.monotonic()
        assert redis_client.is_in_cooldown is True

        redis_client.reset_circuit_breaker()
        assert redis_client.is_in_cooldown is False

    async def test_concurrent_connections_use_mutex_lock(self):
        """Test that concurrent connection attempts don't spawn multiple connections"""
        await redis_client.disconnect()
        # Launch 5 concurrent connection requests simultaneously
        clients = await asyncio.gather(*(redis_client.get_client() for _ in range(5)))
        # All callers get the same client instance
        assert len(clients) == 5
        assert all(c is clients[0] for c in clients)
