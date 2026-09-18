import time
from typing import Optional, Tuple
from fastapi import Request, HTTPException, status
from datetime import datetime, timezone

from app.core.redis_client import redis_client


class RateLimiter:
    """
    Sliding Window Rate Limiter using Redis
    Strategy: Sliding Window
    Storage: Redis
    Identifier: IP Address (for login)
    """
    
    def __init__(self):
        self.redis = redis_client
    
    async def get_client_ip(self, request: Request) -> str:
        """Extract client IP from request"""
        # Check for proxy headers first
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            # Get the first IP in the chain
            return forwarded.split(",")[0].strip()
        
        # Fallback to client host
        if request.client:
            return request.client.host
        
        return "unknown"
    
    async def _get_sliding_window_count(self, key: str, window: int) -> int:
        """
        Get count of requests in the sliding window.
        
        Uses Redis sorted set where:
        - Members: request timestamps
        - Score: request timestamps
        - I remove entries older than the window
        - Then count remaining entries
        """
        client = await self.redis.get_client()
        
        # Get current timestamp in milliseconds
        now = time.time() * 1000
        
        # Remove entries older than the window
        min_score = now - (window * 1000)
        await client.zremrangebyscore(key, 0, min_score)
        
        # Get count of entries in the window
        count = await client.zcard(key)
        
        return count
    
    async def _add_request_timestamp(self, key: str) -> None:
        """Add current timestamp to the sorted set"""
        client = await self.redis.get_client()
        
        now = time.time() * 1000
        await client.zadd(key, {str(now): now})
        
        # Set expiration on the key to clean up automatically
        # I'll use 2x the window to be safe
        # For login, window is 300 seconds (5 minutes)
        # So we'll expire in 600 seconds (10 minutes)
        # I'll handle this differently - we'll set expiry when creating
        # Actually, we'll set it after adding
    
    async def _set_key_expiry(self, key: str, window: int) -> None:
        """Set expiration on the Redis key to prevent memory leaks"""
        client = await self.redis.get_client()
        # Expire after 2x the window
        await client.expire(key, window * 2)
    
    async def check_limit(
        self, 
        request: Request, 
        limit: int, 
        window: int, 
        identifier: Optional[str] = None
    ) -> Tuple[bool, dict]:
        
        if identifier is None:
            # FIX: Added await
            identifier = await self.get_client_ip(request)
        
        key = f"rate_limit:login:{identifier}"
        client = await self.redis.get_client()
        now = int(time.time() * 1000)
        min_score = now - (window * 1000)
       
        async with client.pipeline(transaction=True) as pipe:
            pipe.zremrangebyscore(key, 0, min_score)
            pipe.zcard(key)
            pipe.zrangebyscore(key, 0, now, start=0, num=1, withscores=True)
            results = await pipe.execute()
        current_count = results[1]
        oldest_score = results[2]
        

        # Calculate remaining
        remaining = max(0, limit - current_count)
        
        
        if oldest_score:
            oldest_timestamp = oldest_score[0][1] / 1000
            reset_time = int(oldest_timestamp + window)
        else:
            reset_time = int(time.time() + window)
        
        # Check if within limit
        if current_count < limit:
            # Add this request timestamp
            async with client.pipeline(transaction=True) as pipe:
                pipe.zadd(key, {str(now): now})
                pipe.expire(key, window * 2)
                await pipe.execute()

            return True, {
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": str(remaining - 1),  # After this request
                "X-RateLimit-Reset": str(reset_time),
                "X-RateLimit-Window": str(window),
            }
        
        # Limit exceeded
        return False, {
            "X-RateLimit-Limit": str(limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": str(reset_time),
            "X-RateLimit-Window": str(window),
            "Retry-After": str(reset_time - int(time.time())),
        }


# Singleton instance
rate_limiter = RateLimiter()


# ============= DECORATOR FOR RATE LIMITING =============

def rate_limit(limit: int, window: int, key_prefix: str = "rate_limit"):
   
    def decorator(func):
        async def wrapper(*args, **kwargs):
            # Find the request object in args or kwargs
            request = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break
            if not request:
                for _, arg in kwargs.items():
                    if isinstance(arg, Request):
                        request = arg
                        break
            
            if not request:
                # No request found, allow the request (fallback)
                return await func(*args, **kwargs)
            
            # Check rate limit
            allowed, headers = await rate_limiter.check_limit(
                request=request,
                limit=limit,
                window=window,
                identifier=None  # Auto-detect IP
            )
            
            if not allowed:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail={
                        "error": "Too Many Requests",
                        "message": f"Rate limit exceeded. Please try again in {headers.get('Retry-After', window)} seconds.",
                        "retry_after": int(headers.get("Retry-After", 0)),
                        "limit": int(headers.get("X-RateLimit-Limit", 0)),
                        "remaining": 0,
                        "window": int(headers.get("X-RateLimit-Window", window)),
                        "reset_at": datetime.fromtimestamp(
                            int(headers.get("X-RateLimit-Reset", 0)), 
                            tz=timezone.utc
                        ).isoformat()
                    },
                    headers=headers
                )
            
            # Add rate limit headers to response
            # I can't easily modify response here, so we'll store in request state
            # and let the middleware or dependency add them
            request.state.rate_limit_headers = headers
            
            # Call the endpoint
            response = await func(*args, **kwargs)
            
            # Add headers to response if it has headers
            if hasattr(response, 'headers'):
                for key, value in headers.items():
                    response.headers[key] = value
            
            return response
        
        return wrapper
    return decorator


# ============= DEPENDENCY FOR RATE LIMITING =============

async def rate_limit_dependency(
    request: Request,
    limit: int = 5,
    window: int = 300,
    key_prefix: str = "login",
    skip_if_admin: bool = False
) -> dict:
    
    # FIX: Added await to the check_limit call
    allowed, headers = await rate_limiter.check_limit(
        request=request,
        limit=limit,
        window=window
    )
    
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "Too Many Requests",
                "message": f"Rate limit exceeded. Please try again in {headers.get('Retry-After', window)} seconds.",
                "retry_after": int(headers.get("Retry-After", 0)),
                "limit": int(headers.get("X-RateLimit-Limit", 0)),
                "remaining": 0,
                "window": int(headers.get("X-RateLimit-Window", window)),
                "reset_at": datetime.fromtimestamp(
                    int(headers.get("X-RateLimit-Reset", 0)), 
                    tz=timezone.utc
                ).isoformat()
            },
            headers=headers
        )
    return headers