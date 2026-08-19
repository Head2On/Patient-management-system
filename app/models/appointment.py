from __future__ import annotations

from typing import Optional
from datetime import datetime, timezone
from enum import Enum
from sqlalchemy import String, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.database import Base


class AppointmentStatus(str, Enum):
    SCHEDULED = "scheduled"
    CHECKED_IN = "checked_in"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"


class Appointment(Base):
    __tablename__ = "appointments"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="RESTRICT"), 
        nullable=False
    )
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), 
        default=AppointmentStatus.SCHEDULED.value, 
        nullable=False
    )
    reason_for_visit: Mapped[str] = mapped_column(String(300), nullable=False)
    internal_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=datetime.now(timezone.utc), 
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=datetime.now(timezone.utc), 
        onupdate=datetime.now(timezone.utc), 
        nullable=False
    )


    patient: Mapped["Patient"] = relationship(back_populates="appointments")

    def __repr__(self):
        return f"Appointment(id={self.id!r}, patient_id={self.patient_id!r}, status={self.status!r}, start_time={self.start_time!r})"