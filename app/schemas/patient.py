from pydantic import BaseModel,ConfigDict, Field
from typing import Optional
from datetime import date


class PatientCreate(BaseModel):
    name: str
    phone: str
    dob: date
    gender: str
    address: str
    chief_complaint: str
    aadhaar: Optional[str] = None 

class PatientResponse(BaseModel):
    patient_number: str
    name: str
    phone: str
    dob: date
    gender: str
    address: str
    chief_complaint: str
    is_active:bool
    

    model_config = ConfigDict(from_attributes=True)

class PatientUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    dob: Optional[date] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    chief_complaint: Optional[str] = None

class PatientDeleteResponse(BaseModel):
    message: str
    patient_number: str
    status: str

class PaginationParams(BaseModel):
    page: int = Field(1, ge=1) 
    limit: int = Field(10, ge=1, le=100) 