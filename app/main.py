from fastapi import FastAPI
from app.api.routes.patients import patients_router
from app.core.config import settings
from app.api.routes.appointment import appointments_router
from app.api.routes.provider import providers_router
from app.api.routes.user import users_router
from app.core.logging_config import setup_logging, get_logger

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

app.include_router(patients_router, prefix="/api/v1/patients", tags=["patients"])
app.include_router(appointments_router,prefix="/api/v1/appointments",tags=["appointments"])
app.include_router(providers_router,prefix="/api/v1/providers",tags=["providers"])
app.include_router(users_router,prefix="/api/v1/users",tags=["users"])

@app.get("/")
def read_root():
    return {"message" : "Patient Management System API" }
