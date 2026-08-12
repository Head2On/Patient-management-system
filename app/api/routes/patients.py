from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.database import get_db 
from app.schemas.patient import PatientCreate, PatientResponse
from app.services.patient import register_patient


router = APIRouter()

@router.post(
    "/patients",response_model=PatientResponse, 
    status_code=status.HTTP_201_CREATED 
)
def create_patient(patient_data: PatientCreate, db: Session = Depends(get_db)):
    try : 
        patient = register_patient(db, patient_data)
        return patient
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error while registering the patient"
        )
    