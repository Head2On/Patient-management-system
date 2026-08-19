# TODO: Refactor to custom domain exceptions

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.database import get_db
from app.schemas.appointment import AppointmentCreate, AppointmentResponse
from app.services.appointment import AppointmentServices, AppointmentStatus,AppointmentUpdate 

appointments_router = APIRouter()

#Create appointments
@appointments_router.post(
    "/",
    response_model=AppointmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new appointment"
)
def create_appointment(
    appointment_data: AppointmentCreate,
    db: Session = Depends(get_db)
):
    service = AppointmentServices(db)
    
    try:
        appointment = service.create_appointment(appointment_data)
        return appointment
    except ValueError as e:
        # Translate service errors to HTTP exceptions
        if "not found" in str(e).lower() or "inactive" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(e)
            )
        elif "already has an appointment" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=str(e)
            )
        elif "end_time must be after" in str(e).lower() or "start time cannot be in past" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )

#For specific appointment
@appointments_router.get(
    "/{appointment_id}",
    response_model=AppointmentResponse,
    summary="Get appointment by ID"
)
def get_appointment(
    appointment_id: int,
    db: Session = Depends(get_db)
):
    service = AppointmentServices(db)
    appointment = service.get_appointment_by_id(appointment_id)
    
    if not appointment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Appointment with id {appointment_id} not found"
        )
    
    return appointment

#For specific appointments with patient_id
@appointments_router.get(
    "/patient/{patient_id}/appointments",
    response_model=List[AppointmentResponse],
    summary="Get all appointments for a patient"
)
def get_patient_appointments(
    patient_id: int,
    status: Optional[AppointmentStatus] = None,
    db: Session = Depends(get_db)
):
    service = AppointmentServices(db)
    appointments = service.get_patient_appointments(patient_id, status)
    return appointments

#For all appointments 
@appointments_router.get(
    "/",
    response_model=List[AppointmentResponse],
    summary="Get all appointment"
)
def get_all_appointment(
    skip: int = 0,
    limit : int = 100,
    db:Session = Depends(get_db)
):
    service = AppointmentServices(db)
    appointments = service.get_all_appointments(skip=skip, limit=limit)
    return appointments 


@appointments_router.patch(
    "/{appointment_id}",
    response_model=AppointmentResponse,
    summary="Upadate an appointment"
)

def update_appointment(
    appointment_id:int,
    update_data: AppointmentUpdate,
    db:Session = Depends(get_db)
):
    service = AppointmentServices(db)

    try:
        appointment = service.update_appointment(appointment_id, update_data)
        return appointment
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(e)
            )
        elif "inactive" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(e)
            )
        elif "already has an appointment" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=str(e)
            )
        elif "end_time must be after" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )
        elif "invalid status transition" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )