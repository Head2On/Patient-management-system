from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.routes.patients import patients_router
from app.core.config import settings
from app.api.routes.appointment import appointments_router
from app.api.routes.provider import providers_router
from app.api.routes.user import users_router
from app.api.routes.healthy import health_router
from app.core.logging_config import setup_logging, get_logger

from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info(
        f"Starting {app.title} v{app.version} | Debug: {settings.debug}"
    )
    yield 
    logger.info(f"Shutting down {app.title}")


app = FastAPI(
    title="Patient Management System",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    
    if not settings.debug:
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(
        "Unhandled exception on %s %s",
        request.method,
        request.url.path,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )

app.include_router(health_router)
app.include_router(patients_router, prefix="/api/v1/patients", tags=["patients"])
app.include_router(appointments_router,prefix="/api/v1/appointments",tags=["appointments"])
app.include_router(providers_router,prefix="/api/v1/providers",tags=["providers"])
app.include_router(users_router,prefix="/api/v1/users",tags=["users"])

@app.get("/")
def read_root():
    return {"message" : "Patient Management System API" }
