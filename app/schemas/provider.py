from pydantic import BaseModel, EmailStr, ConfigDict, Field
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


class ProviderUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    
    name: Optional[str] = Field(None, max_length=300)
    specialization: Optional[str] = Field(None, max_length=300)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    post: Optional[PostType] = None

   
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
    post: PostType
    is_active: bool