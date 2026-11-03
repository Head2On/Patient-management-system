from __future__ import annotations

from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, date
from sqlalchemy import String, Integer, DateTime, Date, ForeignKey, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.database import Base


class Prescription(Base):
    __tablename__ = "prescriptions"

    id: Mapped[int] = mapped_column(primary_key=True)

    # 1-to-1 linkage with Appointment (one prescription per consultation appointment)
    appointment_id: Mapped[int] = mapped_column(
        ForeignKey("appointments.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True
    )

    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="RESTRICT"),
        nullable=False,
        index=True
    )

    provider_id: Mapped[int] = mapped_column(
        ForeignKey("providers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True
    )

    # Clinical Encounter Findings
    diagnosis: Mapped[str] = mapped_column(String(500), nullable=False)
    symptoms: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Structured Vitals: {"blood_pressure": "120/80", "pulse": 72, "temperature": "98.6 F", "weight": "68 kg", "spo2": 99}
    vitals: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

    # Structured Medications List:
    # [{"name": "Amoxicillin 500mg", "dosage": "1 cap", "frequency": "1-0-1", "duration": "5 days", "instructions": "After food"}]
    medications: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)

    # Clinical Advice & Patient Instructions
    advice: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Optional Scheduled Follow-up Date
    follow_up_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # Audit & Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    created_by_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )
    updated_by_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )

    # Relationships
    appointment: Mapped["Appointment"] = relationship("Appointment", back_populates="prescription")
    patient: Mapped["Patient"] = relationship("Patient", back_populates="prescriptions")
    provider: Mapped["Provider"] = relationship("Provider", back_populates="prescriptions")
    created_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by_id])
    updated_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[updated_by_id])

    def __repr__(self):
        return f"Prescription(id={self.id!r}, appointment_id={self.appointment_id!r}, patient_id={self.patient_id!r}, diagnosis={self.diagnosis!r})"
