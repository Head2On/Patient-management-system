from pydantic import BaseModel,ConfigDict
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
    

    model_config = ConfigDict(from_attributes=True)