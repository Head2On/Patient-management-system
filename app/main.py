from fastapi import FastAPI
from app.api.routes.patients import router
from app.api.routes.appointment import router

app = FastAPI(
    title="Patient Management System",
    version="1.0.0"
)

app.include_router(router, prefix="/api/v1", tags=["patients"])
app.include_router(router,
    prefix="/api/v1/appointments",
    tags=["appointments"]
)

@app.get("/")
def read_root():
    return {"message" : "Patient Management System API" }
