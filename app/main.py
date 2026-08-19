from fastapi import FastAPI
from app.api.routes.patients import patients_router
from app.api.routes.appointment import appointments_router

app = FastAPI(
    title="Patient Management System",
    version="1.0.0"
)

app.include_router(patients_router, prefix="/api/v1/patients", tags=["patients"])
app.include_router(appointments_router,
    prefix="/api/v1/appointments",
    tags=["appointments"]
)

@app.get("/")
def read_root():
    return {"message" : "Patient Management System API" }
