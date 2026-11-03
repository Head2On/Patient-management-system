from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional
from datetime import date


class PatientCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., max_length=200)
    phone: str
    dob: date
    gender: str = Field(..., max_length=10)
    address: str = Field(..., max_length=300)
    chief_complaint: str = Field(..., max_length=300)
    aadhaar: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not isinstance(v, str):
            raise ValueError("Full name must be a string")
        cleaned = v.strip()
        if "\x00" in cleaned:
            raise ValueError("Null bytes are not permitted in name")
        if len(cleaned) < 2:
            raise ValueError("Full name must be at least 2 characters")
        if len(cleaned) > 200:
            raise ValueError("Full name cannot exceed 200 characters")
        return cleaned

    @field_validator("gender")
    @classmethod
    def validate_gender(cls, v: str) -> str:
        if isinstance(v, str):
            cleaned = v.strip()
            cap = cleaned.capitalize()
            if cap in {"Female", "Male", "Other"}:
                return cap
        raise ValueError("Gender must be one of 'Female', 'Male', or 'Other'")

    @field_validator("address")
    @classmethod
    def validate_address(cls, v: str) -> str:
        if not isinstance(v, str):
            raise ValueError("Address must be a string")
        cleaned = v.strip()
        if "\x00" in cleaned:
            raise ValueError("Null bytes are not permitted in address")
        if len(cleaned) < 5:
            raise ValueError("Address must be at least 5 characters")
        if len(cleaned) > 300:
            raise ValueError("Address cannot exceed 300 characters")
        return cleaned

    @field_validator("chief_complaint")
    @classmethod
    def validate_chief_complaint(cls, v: str) -> str:
        if not isinstance(v, str):
            raise ValueError("Chief complaint must be a string")
        cleaned = v.strip()
        if "\x00" in cleaned:
            raise ValueError("Null bytes are not permitted in chief complaint")
        if len(cleaned) < 3:
            raise ValueError("Chief complaint must be at least 3 characters")
        if len(cleaned) > 300:
            raise ValueError("Chief complaint cannot exceed 300 characters")
        return cleaned

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if isinstance(v, str):
            cleaned = v.strip()
            if not cleaned.isdigit():
                raise ValueError("Phone number must contain only digits")
            if len(cleaned) < 10:
                raise ValueError("Phone number must be at least 10 digits")
            if len(cleaned) > 15:
                raise ValueError("Phone number cannot exceed 15 digits")
            return cleaned
        raise ValueError("Phone number must be a string")

    @field_validator("aadhaar", mode="before")
    @classmethod
    def validate_aadhaar(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        if isinstance(v, str):
            cleaned = v.strip()
            if not cleaned:
                return None
            normalized = cleaned.replace(" ", "").replace("-", "")
            if not normalized.isdigit() or len(normalized) != 12:
                raise ValueError("Aadhaar number must be exactly 12 digits")
            return normalized
        raise ValueError("Aadhaar must be a string")

    @field_validator("dob")
    @classmethod
    def validate_dob_not_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("Date of birth cannot be in the future")
        return v


class PatientResponse(BaseModel):
    patient_number: str
    name: str
    phone: str
    dob: date
    gender: str
    address: str
    chief_complaint: str
    is_active: bool
    created_by_id: Optional[int] = None
    updated_by_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class PatientShortResponse(BaseModel):
    id: int
    patient_number: str
    name: str
    phone: str
    gender: str
    dob: date

    model_config = ConfigDict(from_attributes=True)


class PatientUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = None
    dob: Optional[date] = None
    gender: Optional[str] = Field(None, max_length=10)
    address: Optional[str] = Field(None, max_length=300)
    chief_complaint: Optional[str] = Field(None, max_length=300)

    @field_validator("name")
    @classmethod
    def validate_name_update(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        cleaned = v.strip()
        if "\x00" in cleaned:
            raise ValueError("Null bytes are not permitted in name")
        if len(cleaned) < 2:
            raise ValueError("Full name must be at least 2 characters")
        if len(cleaned) > 200:
            raise ValueError("Full name cannot exceed 200 characters")
        return cleaned

    @field_validator("gender")
    @classmethod
    def validate_gender_update(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        cleaned = v.strip()
        cap = cleaned.capitalize()
        if cap in {"Female", "Male", "Other"}:
            return cap
        raise ValueError("Gender must be one of 'Female', 'Male', or 'Other'")

    @field_validator("address")
    @classmethod
    def validate_address_update(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        cleaned = v.strip()
        if "\x00" in cleaned:
            raise ValueError("Null bytes are not permitted in address")
        if len(cleaned) < 5:
            raise ValueError("Address must be at least 5 characters")
        if len(cleaned) > 300:
            raise ValueError("Address cannot exceed 300 characters")
        return cleaned

    @field_validator("chief_complaint")
    @classmethod
    def validate_chief_complaint_update(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        cleaned = v.strip()
        if "\x00" in cleaned:
            raise ValueError("Null bytes are not permitted in chief complaint")
        if len(cleaned) < 3:
            raise ValueError("Chief complaint must be at least 3 characters")
        if len(cleaned) > 300:
            raise ValueError("Chief complaint cannot exceed 300 characters")
        return cleaned

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone_update(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        if isinstance(v, str):
            cleaned = v.strip()
            if not cleaned.isdigit():
                raise ValueError("Phone number must contain only digits")
            if len(cleaned) < 10:
                raise ValueError("Phone number must be at least 10 digits")
            if len(cleaned) > 15:
                raise ValueError("Phone number cannot exceed 15 digits")
            return cleaned
        raise ValueError("Phone number must be a string")

    @field_validator("dob")
    @classmethod
    def validate_dob_update(cls, v: Optional[date]) -> Optional[date]:
        if v is not None and v > date.today():
            raise ValueError("Date of birth cannot be in the future")
        return v


class PatientDeleteResponse(BaseModel):
    message: str
    patient_number: str
    status: str


class PaginationParams(BaseModel):
    page: int = Field(1, ge=1)
    limit: int = Field(10, ge=1, le=100)
