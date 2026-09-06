from __future__ import annotations

import enum
from typing import Optional,List
from sqlalchemy import String, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.database import Base
from app.models.appointment import Appointment
from app.models.user import User

class PostType(enum.Enum):
    MD = "MD"
    MS = "MS"

class Provider(Base):
    __tablename__ = "providers"
    id: Mapped[int] = mapped_column(primary_key=True)
    doc_number: Mapped[str] = mapped_column(String(20), index=True, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    specialization: Mapped[str] = mapped_column(String(300), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    post: Mapped[PostType] = mapped_column(Enum(PostType),nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, index=True)

    appointments: Mapped[List["Appointment"]] = relationship( "Appointment",back_populates="provider" )
    user: Mapped[Optional["User"]] = relationship("User", back_populates="provider", uselist=False)
    def __repr__(self):
        return f"Provider(id={self.id!r}, doc_number={self.doc_number!r}, name={self.name!r}, is_active={self.is_active!r})"

