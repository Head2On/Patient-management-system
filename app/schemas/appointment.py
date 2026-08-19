from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.models.appointment import AppointmentStatus  # Import the Enum


class AppointmentBase(BaseModel):
    patient_id: int  
    start_time: datetime
    end_time: datetime
    reason_for_visit: str = Field(max_length=300)
    internal_notes: Optional[str] = None


class AppointmentCreate(AppointmentBase):
    
    @field_validator('end_time')
    @classmethod
    def validate_end_time_after_start(cls, v: datetime, info) -> datetime:
        start_time = info.data.get('start_time')
        if start_time and v <= start_time:
            raise ValueError('end_time must be after start time')
        return v
    
    @field_validator('start_time')
    @classmethod
    def validate_start_time_not_past(cls, v: datetime) -> datetime:
        if v < datetime.now(v.tzinfo):
            raise ValueError('start time cannot be in past')
        return v


class AppointmentUpdate(BaseModel):
   
    status: Optional[AppointmentStatus] = None  
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    reason_for_visit: Optional[str] = Field(None, max_length=300)   
    internal_notes: Optional[str] = None

   
    
    model_config = ConfigDict(
        extra='forbid'
    )


class AppointmentResponse(BaseModel):

    id: int
    patient_id: int  
    start_time: datetime
    end_time: datetime
    status: AppointmentStatus 
    reason_for_visit: str
    internal_notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
        str_strip_whitespace=True
    )