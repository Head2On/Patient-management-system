# app/services/patient.py
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.models.patient import Patient
from app.schemas.patient import PatientCreate, PatientResponse

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