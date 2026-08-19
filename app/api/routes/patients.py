# TODO: Refactor to custom domain exceptions

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from sqlalchemy.orm import Session
from app.db.database import get_db 
from app.schemas.patient import PatientCreate, PatientResponse, PatientUpdate, PatientDeleteResponse, PaginationParams
from app.services.patient import register_patient, get_patient_by_number, get_all_patients, updated_patient_by_number, soft_delete_patient,reactivate_patient



router = APIRouter()

@router.post(
    "/patients",response_model=PatientResponse, 
    status_code=status.HTTP_201_CREATED 
)
def create_patient(patient_data: PatientCreate, db: Session = Depends(get_db)):
    try : 
        patient = register_patient(db, patient_data)
        return patient
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An error while registering the patient")
    
    

@router.get("/patients/{patient_number}")
def get_patient(patient_number: str, db: Session = Depends(get_db)):
    patient = get_patient_by_number(db, patient_number)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    return patient   

@router.get("/patients", response_model=List[PatientResponse])
def list_all_patients(
    db: Session = Depends(get_db), 
    pagination: PaginationParams = Depends(),
    search: Optional[str] = None
):
    offset = (pagination.page - 1) * pagination.limit
    patients = get_all_patients(
        db, offset=offset,
        limit=pagination.limit,
        search=search
    )
    return patients

@router.patch("/patients/{patient_number}", response_model=PatientResponse)
def update_patient(patient_number: str, patient_data: PatientUpdate, db: Session = Depends(get_db)):
    try:
        patient = updated_patient_by_number(db, patient_number, patient_data)
        if not patient:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
        return patient
    except HTTPException:
        raise 
    except ValueError as e:
        raise HTTPException(400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(500, detail=str(e))
    except Exception as e:
        raise HTTPException(500, detail="An error when updating the patient")


@router.delete("/patients/{patient_number}" ,response_model=PatientDeleteResponse, status_code=status.HTTP_200_OK)
def delete_patient_soft(patient_number: str, db: Session = Depends(get_db)):
    try : 
        patient = soft_delete_patient(db, patient_number)
        if not patient:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
        return {
            "message": "Patient deactivated success",
            "patient_number": patient_number,
            "status": "inactive"
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(500, detail=str(e))
    except Exception as e:
        raise HTTPException(500, detail="An error while deactivating the patient")

@router.patch("/patients/{patient_number}/reactivate", response_model=PatientResponse)
def reactivate_patient_route(patient_number: str, db: Session = Depends(get_db)):  
    try:
        patient = reactivate_patient(db, patient_number)  
        if not patient:
            raise HTTPException(404, detail="Patient not found")
        return patient
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(500, detail=str(e))
    except Exception as e:
        raise HTTPException(500, detail="An error while reactivating the patient")