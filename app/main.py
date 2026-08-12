from fastapi import FastAPI
from app.api.routes.patients import router


app = FastAPI(
    title="Patient Management System",
    version="1.0.0"
)

app.include_router(router, prefix="/api/v1")

@app.get("/")
def read_root():
    return {"message" : "Patient Management System API" }
