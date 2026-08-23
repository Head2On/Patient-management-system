from typing import Optional,List
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.models.appointment import Appointment, AppointmentStatus
from app.models.patient import Patient
from app.models.provider import Provider
from app.schemas.appointment import AppointmentCreate, AppointmentUpdate, AppointmentStatus


class AppointmentServices:

    def __init__(self, db: Session):
        self.db = db

    def create_appointment(self, appointment_data: AppointmentCreate) -> Appointment:
        # 1. Validate patient (existing code - keep)

        patient = self.db.query(Patient).filter(Patient.id == appointment_data.patient_id).first()
        if not patient:
            raise ValueError(f"Patient with id {appointment_data.patient_id} not found")
        if not patient.is_active:
            raise ValueError(f"Patient with id {appointment_data.patient_id} is inactive")

        # 2. VALIDATE PROVIDER ← NEW

        provider = self.db.query(Provider).filter(
            Provider.doc_number == appointment_data.provider_id  # doc_number, not id!
        ).first()
        if not provider:
            raise ValueError(f"Provider with doc_number {appointment_data.provider_id} not found")
        if not provider.is_active:
            raise ValueError(f"Provider with doc_number {appointment_data.provider_id} is inactive")

        # 3. Check patient conflicts (existing code - keep)

        patient_conflict = self.db.query(Appointment).filter(
            Appointment.patient_id == appointment_data.patient_id,
            Appointment.start_time < appointment_data.end_time,
            Appointment.end_time > appointment_data.start_time,
            Appointment.status.in_([AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED,
                                    AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_PROGRESS])
        ).first()
        if patient_conflict:
            raise ValueError("Patient already has an appointment in this time slot")

        # 4. CHECK PROVIDER CONFLICTS ← NEW

        provider_conflict = self.db.query(Appointment).filter(
            Appointment.provider_id == provider.id,
            Appointment.start_time < appointment_data.end_time,
            Appointment.end_time > appointment_data.start_time,
            Appointment.status.in_([AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED,
                                    AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_PROGRESS])
        ).first()
        if provider_conflict:
            raise ValueError("Provider already has an appointment in this time slot")

        # 5. Create appointment with provider_id 
        new_appointment = Appointment(
            patient_id=appointment_data.patient_id,
            provider_id=provider.id,  
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
    
    def _get_provider_by_doc_number(self, doc_number: str) -> Optional[Provider]:
        """Helper to get provider by doc_number"""
        return self.db.query(Provider).filter(Provider.doc_number == doc_number).first()
    
    def get_all_appointments(self, skip: int = 0, limit: int = 100, 
                         provider_id: Optional[str] = None) -> List[Appointment]:
        query = self.db.query(Appointment)
        
        if provider_id:
            provider = self._get_provider_by_doc_number(provider_id)
            if provider:
                query = query.filter(Appointment.provider_id == provider.id)
    
        return query.offset(skip).limit(limit).all()

    def get_provider_appointments(self, provider_id: str, status: Optional[AppointmentStatus] = None) -> List[Appointment]:
        """Get all appointments for a specific provider"""
        # Find provider by doc_number
        provider = self.db.query(Provider).filter(Provider.doc_number == provider_id).first()
        if not provider:
            return []
        
        query = self.db.query(Appointment).filter(Appointment.provider_id == provider.id)
        if status:
            query = query.filter(Appointment.status == status)
        return query.all()

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
        
        # 3. Calculate new times
        new_start = update_data.start_time if update_data.start_time else appointment.start_time
        new_end = update_data.end_time if update_data.end_time else appointment.end_time
        
        # 4. If provider_id is being updated
        if update_data.provider_id:
            provider = self._validate_and_get_provider(update_data.provider_id)
            appointment.provider_id = provider.id
        else:
            # Use existing provider for conflict checks
            provider = self.db.query(Provider).filter(Provider.id == appointment.provider_id).first()
        
        # 5. Check time slot conflicts (if time is changing)
        if update_data.start_time or update_data.end_time:
            if new_start >= new_end:
                raise ValueError("end_time must be after start_time")
            
            # Check patient conflicts (excluding current)
            patient_conflict = self.db.query(Appointment).filter(
                Appointment.id != appointment_id,
                Appointment.patient_id == appointment.patient_id,
                Appointment.start_time < new_end,
                Appointment.end_time > new_start,
                Appointment.status.in_([AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED,
                                        AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_PROGRESS])
            ).first()
            if patient_conflict:
                raise ValueError("Patient already has an appointment in this time slot")
            
            # Check provider conflicts (excluding current) ← FIXED
            if provider:
                provider_conflict = self.db.query(Appointment).filter(
                    Appointment.id != appointment_id,
                    Appointment.provider_id == provider.id,
                    Appointment.start_time < new_end,
                    Appointment.end_time > new_start,
                    Appointment.status.in_([AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED,
                                            AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_PROGRESS])
                ).first()
                if provider_conflict:
                    raise ValueError("Provider already has an appointment in this time slot")
        
        # 6. Apply updates
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
        
        # 7. Save
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

    def _validate_and_get_provider(self, doc_number: str) -> Provider:
        """Validate provider exists and is active"""
        provider = self.db.query(Provider).filter(Provider.doc_number == doc_number).first()
        if not provider:
            raise ValueError(f"Provider with doc_number {doc_number} not found")
        if not provider.is_active:
            raise ValueError(f"Provider with doc_number {doc_number} is inactive")
        return provider