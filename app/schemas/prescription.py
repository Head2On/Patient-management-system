from __future__ import annotations

from typing import Optional, List, Dict, Any
from datetime import datetime, date
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.schemas.appointment import PatientAppointmentSummary
from app.schemas.provider import ProviderPublicResponse


class MedicationItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=150, description="Medication or formulation name")
    dosage: str = Field(..., min_length=1, max_length=50, description="Dose amount e.g. 500mg, 1 tablet")
    frequency: str = Field(..., min_length=1, max_length=50, description="Schedule e.g. 1-0-1, Twice daily, OD, BD, TDS, SOS")
    duration: str = Field(..., min_length=1, max_length=50, description="Treatment course e.g. 5 days, 2 weeks")
    instructions: Optional[str] = Field(None, max_length=200, description="Administration advice e.g. After meals, with warm water")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not isinstance(v, str):
            raise ValueError("Medication name must be a string")
        cleaned = v.strip()
        if "\x00" in cleaned:
            raise ValueError("Null bytes not permitted in medication name")
        if not cleaned:
            raise ValueError("Medication name cannot be empty")
        return cleaned


class Vitals(BaseModel):
    model_config = ConfigDict(extra="forbid")

    blood_pressure: Optional[str] = Field(None, max_length=20, description="BP e.g. 120/80")
    pulse: Optional[int] = Field(None, ge=30, le=250, description="Heart rate in bpm")
    temperature: Optional[str] = Field(None, max_length=20, description="Body temperature e.g. 98.6 F")
    weight: Optional[str] = Field(None, max_length=20, description="Body weight e.g. 70 kg")
    spo2: Optional[int] = Field(None, ge=50, le=100, description="Oxygen saturation %")


class PrescriptionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    appointment_id: int = Field(..., gt=0, description="Target consultation appointment ID")
    diagnosis: str = Field(..., min_length=2, max_length=500, description="Primary clinical diagnosis")
    symptoms: Optional[str] = Field(None, max_length=1000, description="Reported clinical symptoms")
    vitals: Optional[Vitals] = None
    medications: List[MedicationItem] = Field(..., min_length=1, description="List of prescribed medications")
    advice: Optional[str] = Field(None, max_length=1000, description="Clinical advice and precautions")
    follow_up_date: Optional[date] = Field(None, description="Recommended next visit date")

    @field_validator("diagnosis")
    @classmethod
    def validate_diagnosis(cls, v: str) -> str:
        if not isinstance(v, str):
            raise ValueError("Diagnosis must be a string")
        cleaned = v.strip()
        if "\x00" in cleaned:
            raise ValueError("Null bytes not permitted in diagnosis")
        if len(cleaned) < 2:
            raise ValueError("Diagnosis must be at least 2 characters")
        return cleaned


class PrescriptionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    diagnosis: Optional[str] = Field(None, min_length=2, max_length=500)
    symptoms: Optional[str] = Field(None, max_length=1000)
    vitals: Optional[Vitals] = None
    medications: Optional[List[MedicationItem]] = Field(None, min_length=1)
    advice: Optional[str] = Field(None, max_length=1000)
    follow_up_date: Optional[date] = None

    @field_validator("diagnosis")
    @classmethod
    def validate_diagnosis(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        if not isinstance(v, str):
            raise ValueError("Diagnosis must be a string")
        cleaned = v.strip()
        if "\x00" in cleaned:
            raise ValueError("Null bytes not permitted in diagnosis")
        if len(cleaned) < 2:
            raise ValueError("Diagnosis must be at least 2 characters")
        return cleaned


class PrescriptionResponse(BaseModel):
    id: int
    appointment_id: int
    patient_id: int
    provider_id: int
    diagnosis: str
    symptoms: Optional[str] = None
    vitals: Optional[Dict[str, Any]] = None
    medications: List[Dict[str, Any]]
    advice: Optional[str] = None
    follow_up_date: Optional[date] = None
    created_at: datetime
    updated_at: datetime
    created_by_id: Optional[int] = None
    updated_by_id: Optional[int] = None

    patient: Optional[PatientAppointmentSummary] = None
    provider: Optional[ProviderPublicResponse] = None

    model_config = ConfigDict(from_attributes=True)
