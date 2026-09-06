import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import String, DateTime, ForeignKey, Enum, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.db.database import Base

class UserRole(str, enum.Enum):
    ADMIN  = "ADMIN"
    DOCTOR = "DOCTOR"
    RECEPTIONIST = "RECEPTIONIST"

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    phone: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    
    # Use Optional for nullable fields
    email: Mapped[Optional[str]] = mapped_column(String(255))
    
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role_enum", native_enum=True), nullable=False, default=UserRole.RECEPTIONIST)
    is_active: Mapped[bool] = mapped_column(default=True, server_default=text("true"))
    
    # Foreign key to Provider - NULL for ADMIN and RECEPTIONIST
    provider_id: Mapped[Optional[int]] = mapped_column(ForeignKey("providers.id"), unique=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    provider: Mapped[Optional["Provider"]] = relationship("Provider", back_populates="user")
    
    def __repr__(self):
        return f"User(id={self.id!r}, phone={self.phone!r}, role={self.role!r})"