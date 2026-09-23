from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.core.redis_client import redis_client


health_router = APIRouter(tags=["health"])


@health_router.get("/health")
def health():
    """Liveness probe. Returns 200 if the process is running."""
    return {"status": "ok"}


@health_router.get("/ready")
async def ready(db: Session = Depends(get_db)):
    """Readiness probe. Returns 200 only if DB and Redis are reachable."""
    checks = {}
    overall_ok = True

    # Database check
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "error"
        overall_ok = False

    # Redis check
    try:
        pong = await redis_client.ping()
        checks["redis"] = "ok" if pong else "error"
        if not pong:
            overall_ok = False
    except Exception:
        checks["redis"] = "error"
        overall_ok = False

    body = {
        "status": "ok" if overall_ok else "unavailable",
        "checks": checks,
    }

    return JSONResponse(
        status_code=status.HTTP_200_OK if overall_ok else status.HTTP_503_SERVICE_UNAVAILABLE,
        content=body,
    )