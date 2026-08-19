from __future__ import annotations

from typing import Optional ,List
from sqlalchemy import String, Date
from datetime import date
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.database import Base
from app.models.appointment import Appointment


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_number: Mapped[str] = mapped_column(String(20), index=True, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200),nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    dob: Mapped[date] = mapped_column (Date, nullable=False)
    aadhaar: Mapped[Optional[str]] = mapped_column(String(20), nullable=True,  unique=True)
    gender: Mapped[str] = mapped_column(String(10), nullable=False)
    address: Mapped[str] = mapped_column(String(300), nullable=False)
    chief_complaint: Mapped[str] = mapped_column(String(300), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)


    appointments: Mapped[List["Appointment"]] = relationship("Appointment", back_populates="patient", cascade="all, delete-orphan")

    def __repr__(self):
        return f"Patient(patient_number={self.patient_number!r}, name={self.name!r}) "
