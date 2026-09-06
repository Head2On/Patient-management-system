from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional
from datetime import datetime
from enum import Enum
from pydantic import ConfigDict, model_validator
from app.models.user import UserRole


class UserBase(BaseModel):
    phone: str = Field(..., min_length=10, max_length=15)
    email: Optional[EmailStr] = None

class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=72)
    role: UserRole 
    provider_id: Optional[int] = None

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if v is not None and not v.isdigit():
            raise ValueError('Phone must contain only digits')
        return v

    @model_validator(mode="after")
    def validate_doctor_provider(self):
        if self.role == UserRole.DOCTOR and not self.provider_id:
            raise ValueError("DOCTOR role requires a valid provider_id")
        if self.role != UserRole.DOCTOR and self.provider_id is not None:
            raise ValueError("Only DOCTOR role can be linked to provider_id")
        return self
    
class UserUpdate(BaseModel):
    """Ordinary profile updates - NO role, NO provider_id, NO is_active"""

    phone: Optional[str] = Field(None, min_length=10, max_length=15)
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=8, max_length=72)

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.isdigit():
            raise ValueError('Phone must contain only digits')
        return v

class UserResponse(BaseModel):
    """Public representation - NEVER exposes password_hash"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    phone: str
    email: Optional[str]
    role: UserRole
    provider_id: Optional[int]
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]


# Separate schemas for privileged operations

class UserRoleUpdate(BaseModel):
    """Admin-only: Update user role"""
    role: UserRole

class UserProviderLinkUpdate(BaseModel):
    """Admin-only: Link/unlink provider"""
    provider_id: Optional[int] = None

class UserAdminUpdate(BaseModel):
    """Admin-only: Update user role and/or provider_id atomically"""
    role: Optional[UserRole] = None
    provider_id: Optional[int] = None

class UserActivateRequest(BaseModel):
    """Request to activate/deactivate user"""
    is_active: bool

class UserLogin(BaseModel):
    """Login request payload"""
    phone: str = Field(..., min_length=10, max_length=15)
    password: str = Field(..., min_length=8, max_length=72)

class Token(BaseModel):
    """JWT Access Token response"""
    access_token: str
    token_type: str = "bearer"

class TokenPayload(BaseModel):
    """Decoded JWT payload"""
    sub: Optional[str] = None
    role: Optional[UserRole] = None
    exp: Optional[int] = None

class UserLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse