from app.schemas.patient import *
from datetime import date, datetime, timezone

data = { 
    "name": "John Doe",
    "phone": "9876543210",
    "dob": date(1990, 1, 15),
    "gender": "Male",
    "address": "123 Main St",
    "chief_complaint": "Fever",
    "aadhaar": "1234-5678-9012"
}
patient = PatientCreate(**data)
print("PatientCreate:", patient)

response_data = {
    "patient_number": "P001",
    "name": "John Doe",
    "phone": "9876543210",
    "dob": date(1990, 1, 15),
    "gender": "Male",
    "address": "123 Main St",
    "chief_complaint": "Fever",
    "is_active":True  
}

response = PatientResponse(**response_data)
print("\n PatientResponse:", response)