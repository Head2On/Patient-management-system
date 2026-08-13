# app/services/patient.py
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from app.models.patient import Patient
from app.schemas.patient import PatientCreate, PatientResponse,PatientUpdate

def register_patient(db: Session, patient_data: PatientCreate):

    result = db.execute(text("SELECT nextval('patients_id_seq')"))
    next_id = result.scalar()
    
    patient_number = f"PDC-{next_id:06d}"
    db_patient = Patient(
        id=next_id,
        patient_number=patient_number,
        name=patient_data.name,
        phone=patient_data.phone,
        dob=patient_data.dob,
        gender=patient_data.gender,
        address=patient_data.address,
        chief_complaint=patient_data.chief_complaint,
        aadhaar=patient_data.aadhaar
    )
    
    db.add(db_patient)
    
    db.commit()
    
    db.refresh(db_patient)
    
    return PatientResponse.model_validate(db_patient)

#view specific patient by there Id 
def get_patient_by_id(db: Session, patient_id: int):
    return db.query(Patient).filter(Patient.id == patient_id, Patient.is_active==True).first ()

# Viwe all patients
def get_all_patients(db: Session, offset: int = 0, limit: int = 10, search: Optional[str] = None):
    query =  db.query(Patient).filter(Patient.is_active == True)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Patient.patient_number.ilike(search_term)) |
            (Patient.name.ilike(search_term))|
            (Patient.phone.ilike(search_term))
        )
    return query.offset(offset).limit(limit).all()

# update patient
def updated_patient_by_number(db: Session, patient_number: str, patient_data: PatientUpdate):
    patient = db.query(Patient).filter(Patient.patient_number == patient_number, Patient.is_active==True).first()
    if not patient:
        return None
    update_data = patient_data.model_dump(exclude_unset=True)
    for key , value in update_data.items():
        setattr(patient, key, value)

    db.commit()
    db.refresh(patient)

    return patient

#delete patient by there Id
def soft_delete_patient(db: Session, patient_number:str):
    patient = db.query(Patient).filter(Patient.patient_number == patient_number, Patient.is_active==True).first()
    if not patient:
        return None
    patient.is_active = False
    db.commit()
    db.refresh(patient)
    return patient

