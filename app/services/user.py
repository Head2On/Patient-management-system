from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import Optional, List
from fastapi import HTTPException, status

from app.models.user import User, UserRole
from app.models.provider import Provider
from app.schemas.user import (
    UserUpdate,
    UserCreate,
    UserProviderLinkUpdate,
    UserRoleUpdate,
    UserAdminUpdate,
)
from app.core.security import get_password_hash, verify_password


class UserService:
    def __init__(self, db: Session):
        self.db = db

    def _validate_role_provider_relationship(
        self,
        role: UserRole,
        provider_id: Optional[int],
        exclude_user_id: Optional[int] = None
    ):
        """Validate the relationship between role and provider_id."""
        if role == UserRole.DOCTOR:
            if not provider_id:
                raise ValueError("DOCTOR must have a provider_id")
            
            provider = self.db.query(Provider).filter(
                Provider.id == provider_id,
                Provider.is_active == True
            ).first()
            
            if not provider:
                raise ValueError("Provider must exist and be active")
            
            # Check if another user is already linked to this provider
            query = self.db.query(User).filter(User.provider_id == provider_id)
            if exclude_user_id is not None:
                query = query.filter(User.id != exclude_user_id)
            if query.first():
                raise ValueError("Provider is already linked to another user account")
        else:
            if provider_id is not None:
                raise ValueError(f"{role.value} cannot have provider_id")

    def create_user(self, user_data: UserCreate, actor: User) -> User:
        """Create a user. Only an Admin can create user accounts."""

        if actor.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can create user accounts"
            )

        # Check if phone already exists
        existing_user = self.db.query(User).filter(User.phone == user_data.phone).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phone number already registered"
            )
        
        # Validate role-provider relationship
        try:
            self._validate_role_provider_relationship(
                user_data.role, 
                user_data.provider_id
            )
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )
        
        # Create user
        user = User(
            phone=user_data.phone,
            email=user_data.email,
            password_hash=get_password_hash(user_data.password),
            role=user_data.role,
            provider_id=user_data.provider_id,
            is_active=True
        )
        
        try:
            self.db.add(user)
            self.db.commit()
            self.db.refresh(user)
            return user
        except IntegrityError as e:
            self.db.rollback()
            if "foreign key" in str(e).lower():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Provider does not exist"
                )
            if "provider_id" in str(e).lower():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Provider is already linked to another user account"
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Error creating user"
            )

    def get_user_by_id(self, user_id: int) -> Optional[User]:
        return self.db.query(User).filter(User.id == user_id).first()

    def get_user_by_phone(self, phone: str, actor: Optional[User] = None) -> Optional[User]:
        return self.db.query(User).filter(User.phone == phone).first()

    def get_all_users(self, skip: int = 0, limit: int = 100) -> List[User]:
        return (
            self.db.query(User)
            .order_by(User.phone.asc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def update_user(self, user_id: int, user_update: UserUpdate, actor:User) -> User:
        """Update basic profile (phone, email, password). All roles can update own profile. Inactive users cannot."""

        user = self.get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        if not user.is_active and actor.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot update deactivated user profile"
            )

        # Check actor authorization: only the user themselves or an ADMIN can update
        if actor.role != UserRole.ADMIN and actor.id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to update another user's profile"
            )
        
        update_data = user_update.model_dump(exclude_unset=True)
        
        # Check phone uniqueness if phone is being changed
        if "phone" in update_data and update_data["phone"] and update_data["phone"] != user.phone:
            existing_phone = self.db.query(User).filter(
                User.phone == update_data["phone"],
                User.id != user_id
            ).first()
            if existing_phone:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Phone number already taken"
                )

        # Hash password if updating
        if "password" in update_data and update_data["password"]:
            update_data["password_hash"] = get_password_hash(update_data.pop("password"))
        elif "password" in update_data:
            update_data.pop("password")
        
        # Update user fields
        for field, value in update_data.items():
            setattr(user, field, value)
        
        try:
            self.db.commit()
            self.db.refresh(user)
            return user
        except IntegrityError as e:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Error updating user"
            )

    def admin_update_user(self, user_id: int, admin_update: UserAdminUpdate, actor:User) -> User:
        """Admin-only: Atomically update role and/or provider_id."""

        if actor.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can update user role and provider link"
            )

        user = self.get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        new_role = admin_update.role if admin_update.role is not None else user.role
        
        # If changing away from DOCTOR, clear provider_id unless explicitly set
        if 'provider_id' in admin_update.__dict__ or  admin_update.provider_id is not None:
            new_provider_id = admin_update.provider_id
        elif new_role != UserRole.DOCTOR:
            new_provider_id = None
        else:
            new_provider_id = user.provider_id

        # Validate role and provider relationship
        try:
            self._validate_role_provider_relationship(
                new_role,
                new_provider_id,
                exclude_user_id=user.id
            )
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )

        user.role = new_role
        user.provider_id = new_provider_id

        try:
            self.db.commit()
            self.db.refresh(user)
            return user
        except IntegrityError as e:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Error updating user role or provider link"
            )

    def update_user_role(self, user_id: int, role_update: UserRoleUpdate, actor: User) -> User:
        """Admin-only: Update user role."""

        return self.admin_update_user(
            user_id=user_id,
            admin_update=UserAdminUpdate(role=role_update.role),
            actor=actor
        )

    def update_user_provider_link(self, user_id: int, link_update: UserProviderLinkUpdate, actor: User) -> User:
        """Admin-only: Update user-provider relationship."""
        
        return self.admin_update_user(
            user_id=user_id,
            admin_update=UserAdminUpdate(provider_id=link_update.provider_id),
            actor=actor
        )

    def deactivate_user(self, user_id: int, actor:User) -> User:
        """
        Deactivate user account.
        - Admin can deactivate any non-admin account (and cannot deactivate own account).
        - Receptionist can deactivate operational accounts (DOCTOR, RECEPTIONIST), but NOT ADMIN or self.
        - Doctor has no deactivation permissions.
        """
        user = self.get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        if actor.role == UserRole.DOCTOR:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Doctors do not have user-management permissions"
                )
        if actor.id == user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Users cannot deactivate their own account"
            )
        if actor.role == UserRole.RECEPTIONIST:
            if user.role == UserRole.ADMIN:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Receptionists cannot deactivate Admin accounts"
                )

        user.is_active = False
        self.db.commit()
        self.db.refresh(user)
        return user

    def reactivate_user(self, user_id: int, actor:User) -> User:
        """
        Reactivate user account.
        - Admin can reactivate any account.
        - Receptionist can reactivate operational accounts (DOCTOR, RECEPTIONIST), but NOT ADMIN accounts.
        - Doctor has no reactivation permissions.
        """
        user = self.get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        if actor.role == UserRole.DOCTOR:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Doctors do not have user-management permissions"
            )
        if actor.role == UserRole.RECEPTIONIST:
            if user.role == UserRole.ADMIN:
                raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Receptionists cannot reactivate Admin accounts"
                )

        user.is_active = True
        self.db.commit()
        self.db.refresh(user)
        return user

    def authenticate_user(self, phone: str, password: str) -> Optional[User]:
        """Authenticate a user by phone and password."""
        user = self.get_user_by_phone(phone)
        if not user:
            return None
        if not user.is_active:
            return None
        if not verify_password(password, user.password_hash):
            return None
        return user

    
    