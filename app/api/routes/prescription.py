from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.services.prescription import PrescriptionService
from app.schemas.prescription import (
    PrescriptionCreate,
    PrescriptionUpdate,
    PrescriptionResponse,
)
from app.models.user import User, UserRole
from app.core.security import get_current_user, get_current_admin_user
from app.core.logging_config import get_logger

logger = get_logger(__name__)

prescriptions_router = APIRouter()


@prescriptions_router.post(
    "/",
    response_model=PrescriptionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a clinical prescription for a consultation encounter",
)
def create_prescription(
    prescription_data: PrescriptionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = PrescriptionService(db)
    try:
        prescription = service.create_prescription(prescription_data, actor=current_user)
        return prescription
    except ValueError as e:
        msg = str(e)
        logger.warning(
            "Prescription creation failed actor=%s reason=%s",
            current_user.id,
            msg
        )
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg)
        elif "already exists" in msg.lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=msg)
        elif "only doctors" in msg.lower() or "not assigned" in msg.lower() or "can only issue" in msg.lower():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=msg)
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


@prescriptions_router.get(
    "/{prescription_id}",
    response_model=PrescriptionResponse,
    summary="Get a prescription by primary ID",
)
def get_prescription(
    prescription_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = PrescriptionService(db)
    prescription = service.get_prescription_by_id(prescription_id)
    if not prescription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Prescription with id {prescription_id} not found",
        )
    return prescription


@prescriptions_router.get(
    "/appointment/{appointment_id}",
    response_model=Optional[PrescriptionResponse],
    summary="Get the prescription for a consultation appointment",
)
def get_appointment_prescription(
    appointment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = PrescriptionService(db)
    prescription = service.get_by_appointment_id(appointment_id)
    return prescription


@prescriptions_router.get(
    "/patient/{patient_id}",
    response_model=List[PrescriptionResponse],
    summary="Get chronological prescription history for a patient",
)
def get_patient_prescriptions(
    patient_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = PrescriptionService(db)
    return service.get_patient_prescriptions(patient_id)


@prescriptions_router.patch(
    "/{prescription_id}",
    response_model=PrescriptionResponse,
    summary="Update a clinical prescription",
)
def update_prescription(
    prescription_id: int,
    update_data: PrescriptionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = PrescriptionService(db)
    try:
        updated = service.update_prescription(prescription_id, update_data, actor=current_user)
        return updated
    except ValueError as e:
        msg = str(e)
        logger.warning(
            "Prescription update failed actor=%s id=%s reason=%s",
            current_user.id,
            prescription_id,
            msg
        )
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg)
        elif "not authorized" in msg.lower() or "only doctors" in msg.lower():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=msg)
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


@prescriptions_router.delete(
    "/{prescription_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a prescription record (Administrator only)",
)
def delete_prescription(
    prescription_id: int,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    service = PrescriptionService(db)
    try:
        service.delete_prescription(prescription_id, actor=current_user)
        return {"message": "Prescription successfully deleted"}
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg)
        elif "only administrators" in msg.lower():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=msg)
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)
