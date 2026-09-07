# app/services/patient.py
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from sqlalchemy.exc import IntegrityError
from app.models.patient import Patient
from app.schemas.patient import PatientCreate, PatientResponse,PatientUpdate
from app.models.user import User

def register_patient(db: Session, patient_data: PatientCreate, actor: Optional[User] = None):

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
        aadhaar=patient_data.aadhaar,
        created_by_id=actor.id if actor else None,
        updated_by_id=actor.id if actor else None
    )
    try: 
        db.add(db_patient)
        db.commit()
        db.refresh(db_patient)
        return PatientResponse.model_validate(db_patient)
    except IntegrityError as e:
        db.rollback()
        raise ValueError("Duplicate entry") 
    except Exception as e:
        db.rollback()
        raise RuntimeError(f"Database error: {str(e)}")

#view specific patient by there number
def get_patient_by_number(db: Session, patient_number: str):
    return db.query(Patient).filter(Patient.patient_number == patient_number, Patient.is_active==True).first ()

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
def updated_patient_by_number(db: Session, patient_number: str, patient_data: PatientUpdate, actor: Optional[User] = None):

    try: 
        patient = db.query(Patient).filter(Patient.patient_number == patient_number, Patient.is_active==True).first()
        if not patient:
            return None
        update_data = patient_data.model_dump(exclude_unset=True)
        for key , value in update_data.items():
            setattr(patient, key, value)
        if actor:
            patient.updated_by_id = actor.id
        db.commit()
        db.refresh(patient)
        return patient
    except IntegrityError as e:
        db.rollback()
        raise ValueError("Duplicate entry")  
    except Exception as e:
        db.rollback()
        raise RuntimeError(f"Database error: {str(e)}")  
    

#delete patient by there number
def soft_delete_patient(db: Session, patient_number:str, actor:Optional[User] = None):

    try: 
        patient = db.query(Patient).filter(Patient.patient_number == patient_number, Patient.is_active==True).first()
        if not patient:
            return None
        patient.is_active = False
        if actor:
            patient.updated_by_id = actor.id
        db.commit()
        db.refresh(patient)
        return patient

    except IntegrityError as e:
        db.rollback()
        raise ValueError("Duplicate entry")
    except Exception as e:
        db.rollback()
        raise RuntimeError(f"Database error: {str(e)}")

#reactive patient by there Id
def reactivate_patient(db: Session, patient_number: str, actor:Optional[User] = None):
    try:
        patient = db.query(Patient).filter(
            Patient.patient_number == patient_number,
            Patient.is_active == False
        ).first()

        if not patient:
            return None
        patient.is_active = True
        if actor:
            patient.updated_by_id = actor.id
        db.commit()
        db.refresh(patient)
        return patient

    except Exception as e:
        db.rollback()
        raise RuntimeError(f"Failed to reactivate patient: {str(e)}")
