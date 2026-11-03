from pydantic import BaseModel, EmailStr, ConfigDict, Field, field_validator
from typing import Optional
from enum import Enum


class PostType(str, Enum):
    MD = "MD"
    MS = "MS"


class ProviderCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., max_length=300)
    specialization: str = Field(..., max_length=300)
    phone: str = Field(..., max_length=20)
    email: Optional[EmailStr] = None
    post: PostType

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
        if len(cleaned) > 300:
            raise ValueError("Full name cannot exceed 300 characters")
        return cleaned

    @field_validator("specialization")
    @classmethod
    def validate_specialization(cls, v: str) -> str:
        if not isinstance(v, str):
            raise ValueError("Specialization must be a string")
        cleaned = v.strip()
        if "\x00" in cleaned:
            raise ValueError("Null bytes are not permitted in specialization")
        if len(cleaned) < 2:
            raise ValueError("Specialization must be at least 2 characters")
        if len(cleaned) > 300:
            raise ValueError("Specialization cannot exceed 300 characters")
        return cleaned

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if isinstance(v, str):
            cleaned = v.strip()
            if "\x00" in cleaned:
                raise ValueError("Null bytes are not permitted in phone")
            if len(cleaned) < 10:
                raise ValueError("Phone number must be at least 10 characters")
            if len(cleaned) > 20:
                raise ValueError("Phone number cannot exceed 20 characters")
            import re
            if not re.match(r"^[0-9+\-() ]+$", cleaned):
                raise ValueError("Phone number can only contain digits, spaces, hyphens, '+', and parentheses")
            digit_count = sum(1 for c in cleaned if c.isdigit())
            if digit_count < 10:
                raise ValueError("Phone number must contain at least 10 digits")
            return cleaned
        raise ValueError("Phone number must be a string")


class ProviderUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(None, max_length=300)
    specialization: Optional[str] = Field(None, max_length=300)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    post: Optional[PostType] = None

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
        if len(cleaned) > 300:
            raise ValueError("Full name cannot exceed 300 characters")
        return cleaned

    @field_validator("specialization")
    @classmethod
    def validate_specialization_update(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        cleaned = v.strip()
        if "\x00" in cleaned:
            raise ValueError("Null bytes are not permitted in specialization")
        if len(cleaned) < 2:
            raise ValueError("Specialization must be at least 2 characters")
        if len(cleaned) > 300:
            raise ValueError("Specialization cannot exceed 300 characters")
        return cleaned

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone_update(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        if isinstance(v, str):
            cleaned = v.strip()
            if "\x00" in cleaned:
                raise ValueError("Null bytes are not permitted in phone")
            if len(cleaned) < 10:
                raise ValueError("Phone number must be at least 10 characters")
            if len(cleaned) > 20:
                raise ValueError("Phone number cannot exceed 20 characters")
            import re
            if not re.match(r"^[0-9+\-() ]+$", cleaned):
                raise ValueError("Phone number can only contain digits, spaces, hyphens, '+', and parentheses")
            digit_count = sum(1 for c in cleaned if c.isdigit())
            if digit_count < 10:
                raise ValueError("Phone number must contain at least 10 digits")
            return cleaned
        raise ValueError("Phone number must be a string")


class ProviderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    doc_number: str
    name: str
    specialization: str
    phone: str
    email: Optional[EmailStr]
    post: PostType
    is_active: bool
    created_by_id: Optional[int] = None
    updated_by_id: Optional[int] = None


class ProviderPublicResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    doc_number: str
    name: str
    specialization: str
