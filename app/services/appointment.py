from typing import Optional,List
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.models.appointment import Appointment, AppointmentStatus
from app.models.patient import Patient
from app.schemas.appointment import AppointmentCreate, AppointmentResponse, AppointmentUpdate


class AppointmentServices:

    def __init__(self, db: Session):
        self.db = db

    def create_appointment(self, appointment_data: AppointmentCreate) -> Appointment:
        # 1. validate patient 
        patient = self.db.query(Patient).filter(Patient.id == appointment_data.patient_id).first()
        if not patient:
            raise ValueError(f"Patient with id {appointment_data.patient_id} not founded")

        if not patient.is_active:
            raise ValueError(f"Patient with id {appointment_data.patient_id} is inactive. Cannot create appointment for inactive patient.")
    
        #2. check overlapping appointments
        existing_appointments = self.db.query(Appointment).filter(
            Appointment.patient_id == appointment_data.patient_id,
            Appointment.start_time < appointment_data.end_time,
            Appointment.end_time > appointment_data.start_time,
            Appointment.status.in_([AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED,
                                    AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_PROGRESS])
            ).first()

        if existing_appointments:
            raise ValueError("Patient already has an appointment in this time slot")

        #3.create appointment
        new_appointment = Appointment(
            patient_id=appointment_data.patient_id,
            start_time=appointment_data.start_time,
            end_time=appointment_data.end_time,
            status=AppointmentStatus.SCHEDULED.value,
            reason_for_visit=appointment_data.reason_for_visit,
            internal_notes=appointment_data.internal_notes
        )

        try:
            self.db.add(new_appointment)
            self.db.commit()
            self.db.refresh(new_appointment)
        except SQLAlchemyError as e:
            self.db.rollback()
            raise ValueError(f"Database error: {str(e)}")
        
        return new_appointment

    def get_appointment_by_id(self,appointment_id:int) -> Optional[Appointment]:
        return self.db.query(Appointment).filter(Appointment.id == appointment_id).first()

    def get_patient_appointments(self, patient_id:int, status:Optional[AppointmentStatus] = None) -> List[Appointment]:
        patient = self.db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient or not patient.is_active:
            return []
        
        query = self.db.query(Appointment).filter(Appointment.patient_id == patient_id)
        if status:
            query = query.filter(Appointment.status == status)
        return query.all()

    def get_all_appointments(self, skip: int = 0, limit: int = 100) -> List[Appointment]:

        return self.db.query(Appointment).offset(skip).limit(limit).all()

    def _validate_status_transition(self, current_status: str, new_status: str) -> None:
        """Validate if status transition is allowed"""
        
        allowed_transitions = {
            AppointmentStatus.SCHEDULED.value: [
                AppointmentStatus.SCHEDULED.value,
                AppointmentStatus.CONFIRMED.value,
                AppointmentStatus.CANCELLED.value
            ],
            AppointmentStatus.CONFIRMED.value: [
                AppointmentStatus.CONFIRMED.value,
                AppointmentStatus.CHECKED_IN.value,
                AppointmentStatus.CANCELLED.value
            ],
            AppointmentStatus.CHECKED_IN.value: [
                AppointmentStatus.CHECKED_IN.value,
                AppointmentStatus.IN_PROGRESS.value,
                AppointmentStatus.CANCELLED.value
            ],
            AppointmentStatus.IN_PROGRESS.value: [
                AppointmentStatus.IN_PROGRESS.value,
                AppointmentStatus.COMPLETED.value,
                AppointmentStatus.CANCELLED.value
            ],
            AppointmentStatus.COMPLETED.value: [
                AppointmentStatus.COMPLETED.value
            ],
            AppointmentStatus.CANCELLED.value: [
                AppointmentStatus.CANCELLED.value
            ],
            AppointmentStatus.NO_SHOW.value: [
                AppointmentStatus.NO_SHOW.value
            ]
        }
        
        allowed = allowed_transitions.get(current_status, [])
        if new_status not in allowed:
            raise ValueError(
                f"Invalid status transition: '{current_status}' → '{new_status}'. "
                f"Allowed transitions: {allowed}"
            )
    
    def update_appointment(self, appointment_id: int, update_data: AppointmentUpdate) -> Optional[Appointment]:
        """Update an existing appointment"""
        # 1. Get appointment
        appointment = self.get_appointment_by_id(appointment_id)
        if not appointment:
            raise ValueError(f"Appointment with id {appointment_id} not found")
        
        # 2. Check if patient is still active
        patient = self.db.query(Patient).filter(Patient.id == appointment.patient_id).first()
        if not patient or not patient.is_active:
            raise ValueError("Cannot update appointment for inactive patient")
        
        # 3. Check time slot if start_time or end_time is being updated
        new_start = update_data.start_time if update_data.start_time else appointment.start_time
        new_end = update_data.end_time if update_data.end_time else appointment.end_time
        
        if update_data.start_time or update_data.end_time:
            if new_start >= new_end:
                raise ValueError("end_time must be after start_time")
            
            # Check overlapping appointments (excluding current)
            existing_appointments = self.db.query(Appointment).filter(
                Appointment.id != appointment_id,
                Appointment.patient_id == appointment.patient_id,
                Appointment.start_time < new_end,
                Appointment.end_time > new_start,
                Appointment.status.in_([AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED, 
                                        AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_PROGRESS])
            ).first()
            
            if existing_appointments:
                raise ValueError("Patient already has an appointment in this time slot")
        
        # 4. Apply updates
        if update_data.start_time:
            appointment.start_time = update_data.start_time
        if update_data.end_time:
            appointment.end_time = update_data.end_time
        if update_data.reason_for_visit:
            appointment.reason_for_visit = update_data.reason_for_visit
        if update_data.internal_notes is not None:
            appointment.internal_notes = update_data.internal_notes
        if update_data.status:
            self._validate_status_transition(appointment.status, update_data.status.value)
            appointment.status = update_data.status.value
        
        # 5. Save
        try:
            self.db.commit()
            self.db.refresh(appointment)
        except SQLAlchemyError as e:
            self.db.rollback()
            raise ValueError(f"Database error: {str(e)}")
        
        return appointment 

    def cancel_appointment(self, appointment_id: int) -> Optional[Appointment]:
        """Cancel an appointment by setting status to CANCELLED"""
        # 1. Get appointment
        appointment = self.get_appointment_by_id(appointment_id)
        if not appointment:
            raise ValueError(f"Appointment with id {appointment_id} not found")
        
        # 2. Check if already cancelled or completed
        if appointment.status == AppointmentStatus.CANCELLED.value:
            raise ValueError(f"Appointment with id {appointment_id} is already cancelled")
        
        if appointment.status == AppointmentStatus.COMPLETED.value:
            raise ValueError(f"Cannot cancel a completed appointment")
        
        # 3. Validate transition to cancelled
        self._validate_status_transition(appointment.status, AppointmentStatus.CANCELLED.value)
        
        # 4. Update status
        appointment.status = AppointmentStatus.CANCELLED.value
        
        try:
            self.db.commit()
            self.db.refresh(appointment)
        except SQLAlchemyError as e:
            self.db.rollback()
            raise ValueError(f"Database error: {str(e)}")
        
        return appointment
    
    def _validate_status_transition(self, current_status: str, new_status: str) -> None:
        """Validate if status transition is allowed"""
        
        allowed_transitions = {
            AppointmentStatus.SCHEDULED.value: [
                AppointmentStatus.SCHEDULED.value,
                AppointmentStatus.CONFIRMED.value,
                AppointmentStatus.CANCELLED.value
            ],
            AppointmentStatus.CONFIRMED.value: [
                AppointmentStatus.CONFIRMED.value,
                AppointmentStatus.CHECKED_IN.value,
                AppointmentStatus.CANCELLED.value
            ],
            AppointmentStatus.CHECKED_IN.value: [
                AppointmentStatus.CHECKED_IN.value,
                AppointmentStatus.IN_PROGRESS.value,
                AppointmentStatus.CANCELLED.value
            ],
            AppointmentStatus.IN_PROGRESS.value: [
                AppointmentStatus.IN_PROGRESS.value,
                AppointmentStatus.COMPLETED.value,
                AppointmentStatus.CANCELLED.value
            ],
            AppointmentStatus.COMPLETED.value: [
                AppointmentStatus.COMPLETED.value
            ],
            AppointmentStatus.CANCELLED.value: [
                AppointmentStatus.CANCELLED.value
            ],
            AppointmentStatus.NO_SHOW.value: [
                AppointmentStatus.NO_SHOW.value
            ]
        }
        
        allowed = allowed_transitions.get(current_status, [])
        if new_status not in allowed:
            raise ValueError(
                f"Invalid status transition: '{current_status}' → '{new_status}'. "
                f"Allowed transitions: {allowed}"
            )

    def update_appointment(self, appointment_id: int, update_data: AppointmentUpdate) -> Optional[Appointment]:
        """Update an existing appointment"""
        # 1. Get appointment
        appointment = self.get_appointment_by_id(appointment_id)
        if not appointment:
            raise ValueError(f"Appointment with id {appointment_id} not found")
        
        # 2. Check if patient is still active
        patient = self.db.query(Patient).filter(Patient.id == appointment.patient_id).first()
        
        if not patient or not patient.is_active:
            raise ValueError("Cannot update appointment for inactive patient")
        
        # 3. VALIDATE STATUS FIRST (before any mutations)
        if update_data.status:
            self._validate_status_transition(appointment.status, update_data.status.value)

        # 4. Check time slot if start_time or end_time is being updated
        new_start = update_data.start_time if update_data.start_time else appointment.start_time
        new_end = update_data.end_time if update_data.end_time else appointment.end_time
        
        if update_data.start_time or update_data.end_time:
            if new_start >= new_end:
                raise ValueError("end_time must be after start_time")
            
            # Check overlapping appointments (excluding current)
            existing_appointments = self.db.query(Appointment).filter(
                Appointment.id != appointment_id,
                Appointment.patient_id == appointment.patient_id,
                Appointment.start_time < new_end,
                Appointment.end_time > new_start,
                Appointment.status.in_([AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED, 
                                        AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_PROGRESS])
            ).first()
            
            if existing_appointments:
                raise ValueError("Patient already has an appointment in this time slot")
        
        # 5. Apply updates
        if update_data.start_time is not None:
            appointment.start_time = update_data.start_time
        if update_data.end_time is not None:
            appointment.end_time = update_data.end_time
        if update_data.reason_for_visit is not None:
            appointment.reason_for_visit = update_data.reason_for_visit
        if update_data.internal_notes is not None:
            appointment.internal_notes = update_data.internal_notes
        if update_data.status is not None:
            appointment.status = update_data.status.value
        
        # 6. Save
        try:
            self.db.commit()
            self.db.refresh(appointment)
        except SQLAlchemyError as e:
            self.db.rollback()
            raise ValueError(f"Database error: {str(e)}")
        
        return appointment

    def cancel_appointment(self, appointment_id: int) -> Optional[Appointment]:
        """Cancel an appointment by setting status to CANCELLED"""
        # 1. Get appointment
        appointment = self.get_appointment_by_id(appointment_id)
        if not appointment:
            raise ValueError(f"Appointment with id {appointment_id} not found")
        
        # 2. Check if already cancelled or completed
        if appointment.status == AppointmentStatus.CANCELLED.value:
            raise ValueError(f"Appointment with id {appointment_id} is already cancelled")
        
        if appointment.status == AppointmentStatus.COMPLETED.value:
            raise ValueError(f"Cannot cancel a completed appointment")
        
        # 3. Validate transition to cancelled
        self._validate_status_transition(appointment.status, AppointmentStatus.CANCELLED.value)
        
        # 4. Update status
        appointment.status = AppointmentStatus.CANCELLED.value
        
        try:
            self.db.commit()
            self.db.refresh(appointment)
        except SQLAlchemyError as e:
            self.db.rollback()
            raise ValueError(f"Database error: {str(e)}")
        
        return appointment