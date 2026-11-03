from __future__ import annotations

from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError

from app.models.prescription import Prescription
from app.models.appointment import Appointment, AppointmentStatus
from app.models.user import User, UserRole
from app.schemas.prescription import PrescriptionCreate, PrescriptionUpdate
from app.core.logging_config import get_logger

logger = get_logger(__name__)


class PrescriptionService:
    def __init__(self, db: Session):
        self.db = db

    def create_prescription(self, data: PrescriptionCreate, actor: User) -> Prescription:
        """
        Create a clinical prescription for a consultation encounter.
        Enforces clinical assignment, valid appointment state, and duplicate prevention.
        """
        # 1. Role Authorization: Only Doctors (or Admins) can issue prescriptions
        if actor.role not in (UserRole.DOCTOR, UserRole.ADMIN):
            logger.warning(
                "Unauthorized prescription creation attempt actor=%s role=%s",
                actor.id,
                actor.role
            )
            raise ValueError("Only doctors and administrators can create prescriptions")

        # 2. Look up the consultation appointment
        appointment = self.db.query(Appointment).filter(
            Appointment.id == data.appointment_id
        ).first()

        if not appointment:
            raise ValueError(f"Appointment with id {data.appointment_id} not found")

        # 3. Appointment State Guard: Cancelled appointments cannot receive prescriptions; must be in_progress or completed
        if appointment.status == AppointmentStatus.CANCELLED.value:
            raise ValueError("Cannot create a prescription for a cancelled appointment")
        if appointment.status not in (
            AppointmentStatus.IN_PROGRESS.value,
            AppointmentStatus.COMPLETED.value,
        ):
            raise ValueError(
                f"Prescriptions can only be issued for consultations in progress or completed (current status: {appointment.status})"
            )

        # 4. Clinical Ownership Guard: Doctor must be assigned to this consultation
        if actor.role == UserRole.DOCTOR:
            if not actor.provider_id or actor.provider_id != appointment.provider_id:
                logger.warning(
                    "Doctor IDOR prescription attempt actor=%s provider_id=%s appointment_provider=%s",
                    actor.id,
                    actor.provider_id,
                    appointment.provider_id
                )
                raise ValueError("Doctors can only issue prescriptions for their assigned appointments")

        # 5. Duplicate Guard: Exactly one prescription per consultation
        existing = self.db.query(Prescription).filter(
            Prescription.appointment_id == data.appointment_id
        ).first()
        if existing:
            raise ValueError("A prescription already exists for this appointment")

        # 6. Format vitals and medications
        vitals_dict = data.vitals.model_dump(exclude_unset=True) if data.vitals else None
        medications_list = [med.model_dump(exclude_unset=True) for med in data.medications]

        prescription = Prescription(
            appointment_id=appointment.id,
            patient_id=appointment.patient_id,
            provider_id=appointment.provider_id,
            diagnosis=data.diagnosis,
            symptoms=data.symptoms,
            vitals=vitals_dict,
            medications=medications_list,
            advice=data.advice,
            follow_up_date=data.follow_up_date,
            created_by_id=actor.id,
            updated_by_id=actor.id,
        )

        try:
            self.db.add(prescription)
            self.db.commit()
            self.db.refresh(prescription)
            logger.info(
                "Prescription created id=%s appointment_id=%s patient_id=%s provider_id=%s by=%s",
                prescription.id,
                prescription.appointment_id,
                prescription.patient_id,
                prescription.provider_id,
                actor.id
            )
            return prescription
        except IntegrityError as e:
            self.db.rollback()
            logger.warning("Prescription creation integrity failure: %s", str(e))
            raise ValueError("Duplicate prescription entry or foreign key violation")

    def get_prescription_by_id(self, prescription_id: int) -> Optional[Prescription]:
        """Fetch prescription by primary ID with enriched patient and provider details."""
        return self.db.query(Prescription).options(
            joinedload(Prescription.patient),
            joinedload(Prescription.provider),
            joinedload(Prescription.appointment)
        ).filter(Prescription.id == prescription_id).first()

    def get_by_appointment_id(self, appointment_id: int) -> Optional[Prescription]:
        """Fetch prescription for a specific consultation encounter."""
        return self.db.query(Prescription).options(
            joinedload(Prescription.patient),
            joinedload(Prescription.provider)
        ).filter(Prescription.appointment_id == appointment_id).first()

    def get_patient_prescriptions(self, patient_id: int) -> List[Prescription]:
        """Fetch complete chronological prescription history for a patient."""
        return self.db.query(Prescription).options(
            joinedload(Prescription.provider)
        ).filter(
            Prescription.patient_id == patient_id
        ).order_by(Prescription.created_at.desc()).all()

    def update_prescription(
        self,
        prescription_id: int,
        update_data: PrescriptionUpdate,
        actor: User
    ) -> Prescription:
        """Update an existing prescription with clinical ownership checks."""
        prescription = self.db.query(Prescription).filter(
            Prescription.id == prescription_id
        ).first()

        if not prescription:
            raise ValueError(f"Prescription with id {prescription_id} not found")

        # Ownership check: Only Admin or the assigned Doctor can modify
        if actor.role == UserRole.DOCTOR:
            if not actor.provider_id or actor.provider_id != prescription.provider_id:
                raise ValueError("Not authorized to modify another provider's prescription")
        elif actor.role != UserRole.ADMIN:
            raise ValueError("Only doctors and administrators can modify prescriptions")

        dump = update_data.model_dump(exclude_unset=True)

        if "diagnosis" in dump and dump["diagnosis"] is not None:
            prescription.diagnosis = dump["diagnosis"]
        if "symptoms" in dump:
            prescription.symptoms = dump["symptoms"]
        if "vitals" in dump:
            prescription.vitals = (
                update_data.vitals.model_dump(exclude_unset=True)
                if update_data.vitals
                else None
            )
        if "medications" in dump and update_data.medications is not None:
            prescription.medications = [
                m.model_dump(exclude_unset=True) for m in update_data.medications
            ]
        if "advice" in dump:
            prescription.advice = dump["advice"]
        if "follow_up_date" in dump:
            prescription.follow_up_date = dump["follow_up_date"]

        prescription.updated_by_id = actor.id

        self.db.commit()
        self.db.refresh(prescription)
        logger.info(
            "Prescription updated id=%s by=%s",
            prescription.id,
            actor.id
        )
        return prescription

    def delete_prescription(self, prescription_id: int, actor: User) -> bool:
        """Permanently delete a prescription. Strictly restricted to Admins."""
        if actor.role != UserRole.ADMIN:
            raise ValueError("Only administrators can delete prescription records")

        prescription = self.db.query(Prescription).filter(
            Prescription.id == prescription_id
        ).first()

        if not prescription:
            raise ValueError(f"Prescription with id {prescription_id} not found")

        self.db.delete(prescription)
        self.db.commit()
        logger.info("Prescription deleted id=%s by=%s", prescription_id, actor.id)
        return True
