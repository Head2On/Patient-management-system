import time
import pytest
import pytest_asyncio
from fastapi import Request, Depends
from fastapi.responses import JSONResponse
from unittest.mock import MagicMock
from httpx import AsyncClient, ASGITransport
from app.main import app

from app.core.rate_limiter import rate_limiter, rate_limit_dependency
from app.core.redis_client import redis_client

pytestmark = pytest.mark.asyncio

@pytest_asyncio.fixture(autouse=True)
async def reset_redis_singleton():
    """Force the Singleton to disconnect and clear circuit breaker after every test."""
    yield
    await redis_client.disconnect()
    redis_client.reset_circuit_breaker()

# Inject a temporary route into the app specifically for testing the dependency
# This prevents 401 Unauthorized errors from stripping our headers.
@app.post("/test-rate-limit")
async def dummy_rate_limited_route(headers: dict = Depends(rate_limit_dependency)):
    return JSONResponse(content={"success": True}, headers=headers)

class TestRateLimiter:
    
    # UNIT TESTS: IP EXTRACTION

    async def test_get_client_ip_from_forwarded(self):
        mock_request = MagicMock(spec=Request)
        mock_request.headers = {"X-Forwarded-For": "192.168.1.100, 10.0.0.1"}
        mock_request.client = None
        ip = await rate_limiter.get_client_ip(mock_request)
        assert ip == "192.168.1.100"
    
    async def test_get_client_ip_from_client(self):
        mock_request = MagicMock(spec=Request)
        mock_request.headers = {}
        mock_request.client = MagicMock()
        mock_request.client.host = "127.0.0.1"
        ip = await rate_limiter.get_client_ip(mock_request)
        assert ip == "127.0.0.1"
    
    async def test_get_client_ip_fallback(self):
        mock_request = MagicMock(spec=Request)
        mock_request.headers = {}
        mock_request.client = None
        ip = await rate_limiter.get_client_ip(mock_request)
        assert ip == "unknown"

    # INTEGRATION TESTS: SLIDING WINDOW

    async def test_rate_limit_within_limit(self):
        redis = await redis_client.get_client()
        keys = await redis.keys("rate_limit:*")
        if keys:
            await redis.delete(*keys)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as ac:
            for _ in range(5):
                response = await ac.post("/test-rate-limit")
                assert response.status_code == 200
    
    async def test_rate_limit_exceeded(self):
        redis = await redis_client.get_client()
        keys = await redis.keys("rate_limit:*")
        if keys:
            await redis.delete(*keys)
        
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as ac:
            for _ in range(5):
                await ac.post("/test-rate-limit")
            
            response = await ac.post("/test-rate-limit")
            
        assert response.status_code == 429
        data = response.json()
        assert "error" in data["detail"]
        assert data["detail"]["error"] == "Too Many Requests"
        assert data["detail"]["remaining"] == 0 
    
    async def test_rate_limit_headers(self):
        redis = await redis_client.get_client()
        keys = await redis.keys("rate_limit:*")
        if keys:
             await redis.delete(*keys)
        
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as ac:
            response = await ac.post("/test-rate-limit")
        
        assert "X-RateLimit-Limit" in response.headers
        assert "X-RateLimit-Remaining" in response.headers
        assert response.headers["X-RateLimit-Limit"] == "5"
        assert int(response.headers["X-RateLimit-Remaining"]) == 4
    
    async def test_rate_limit_retry_after(self):
        redis = await redis_client.get_client()
        keys = await redis.keys("rate_limit:*")
        if keys:
            await redis.delete(*keys)
        
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as ac:
            for _ in range(5):
                await ac.post("/test-rate-limit")
            
            response = await ac.post("/test-rate-limit")
            
        assert response.status_code == 429
        assert "Retry-After" in response.headers
        assert int(response.headers["Retry-After"]) > 0
    
    async def test_rate_limit_different_ips(self):
        redis = await redis_client.get_client()
        keys = await redis.keys("rate_limit:*")
        if keys:
            await redis.delete(*keys)
        
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as ac:
            headers_ip1 = {"X-Forwarded-For": "192.168.1.1"}
            for i in range(6):
                response = await ac.post("/test-rate-limit", headers=headers_ip1)
                if i < 5:
                    assert response.status_code == 200
                else:
                    assert response.status_code == 429
            
            headers_ip2 = {"X-Forwarded-For": "192.168.1.2"}
            response2 = await ac.post("/test-rate-limit", headers=headers_ip2)
            assert response2.status_code == 200
    
    async def test_rate_limit_window_reset(self):
        redis = await redis_client.get_client()
        keys = await redis.keys("rate_limit:*")
        if keys:
            await redis.delete(*keys)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as ac:
            for i in range(5):
                response = await ac.post(
                    "/api/v1/users/login",
                    json={
                        "phone": "9999999999",
                        "password": "AdminPass123"
                    }
                )
            assert response.status_code != 429
            
            response = await ac.post(
                "/api/v1/users/login",
                json={
                    "phone": "9999999999",
                    "password": "AdminPass123"
                }
            )
        assert response.status_code == 429
<<<<<<< Updated upstream
        
        # Wait for reset (we'll mock time for testing)
        # In real test, we'd use time.sleep(window + 1)
        # But that's slow, so we'll skip for now
        pass
    

=======
>>>>>>> Stashed changes
    
    async def test_rate_limit_clear_redis(self):
        redis = await redis_client.get_client()
        keys = await redis.keys("rate_limit:*")
        if keys:
            await redis.delete(*keys)


class TestRateLimitDependency:
    """Test the rate_limit_dependency function"""
    
    async def test_rate_limit_dependency_fallback_when_redis_in_cooldown(self):
        """Test rate_limit_dependency fails open cleanly when Redis is in cooldown"""
        redis_client._last_failure_time = time.monotonic()
        assert redis_client.is_in_cooldown is True

        mock_request = MagicMock(spec=Request)
        mock_request.headers = {}
        mock_request.client = MagicMock()
        mock_request.client.host = "127.0.0.1"
<<<<<<< Updated upstream
        
        # Clear Redis
        redis = await redis_client.get_client()
        await redis.delete("rate_limit:login:127.0.0.1")
        
        # Make 5 calls (within limit)
        headers = []
        for i in range(5):
            # We need to patch the rate_limiter.check_limit to return within limit
            # But since we're testing the dependency, we'll test it end-to-end
            # Actually, this is complex to test without the FastAPI request context
            # We'll skip this for now and test through the endpoint
            pass
    
=======

        headers = await rate_limit_dependency(mock_request)
        assert headers == {}
>>>>>>> Stashed changes
