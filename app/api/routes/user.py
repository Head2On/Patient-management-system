from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List
from datetime import timedelta

from app.db.database import get_db
from app.services.user import UserService
from app.schemas.user import (
    UserCreate,
    UserUpdate,
    UserResponse,
    UserAdminUpdate,
    UserRoleUpdate,
    UserProviderLinkUpdate,
    UserLogin,
    UserLoginResponse,
    UserRole
)
from app.core.security import (
    get_current_user,
    get_current_admin_user,
    get_current_admin_or_receptionist_user,
    create_access_token,
)

from app.models.user import User
from app.core.config import settings


users_router = APIRouter()

@users_router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user_data: UserCreate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    service = UserService(db)
    try:
        user = service.create_user(user_data, actor=current_user)
        return user
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

# Get current user profile
@users_router.get("/me", response_model=UserResponse)
def get_current_user_profile(
    current_user: User = Depends(get_current_user),
):
    """Get current authenticated user profile"""
    return current_user

# Login
@users_router.post("/login", response_model=UserLoginResponse)
def login(
    login_data: UserLogin,
    db: Session = Depends(get_db)
):
    """Login with phone and password - returns JWT token"""
    service = UserService(db)
    
    user = service.authenticate_user(login_data.phone, login_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid phone or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create access token
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value},
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }

# Get user by phone
@users_router.get("/phone/{phone}", response_model=UserResponse)
def get_user_by_phone(
    phone: str,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    service = UserService(db)
    user = service.get_user_by_phone(phone)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return user

# Get user by there ID 
@users_router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id:int,
    current_user: User = Depends(get_current_user),
    db:Session = Depends(get_db)
):
    service = UserService(db)

    if current_user.role != UserRole.ADMIN and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this user"
        )

    user = service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return user 

# List all user  
@users_router.get("/", response_model=List[UserResponse])
def get_all_user(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    service = UserService(db)
    users = service.get_all_users(skip=skip, limit=limit)
    return users

# Update user
@users_router.patch("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db:Session = Depends(get_db)
):
    service = UserService(db)

    if current_user.role != UserRole.ADMIN and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update another user's profile"
        )
    
    try:
        user = service.update_user(user_id, user_update, actor=current_user)
        return user
    except ValueError as e:
       raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

# ADMIN update user (role + provider)
@users_router.patch("/{user_id}/admin", response_model=UserResponse)
def update_user_by_admin(
    user_id: int,
    admin_update:UserAdminUpdate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    service = UserService(db)
    try:
        user = service.admin_update_user(user_id, admin_update, actor=current_user)
        return user
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

# UPDATE user role only
@users_router.patch("/{user_id}/role", response_model=UserResponse)
def update_user_role(
    user_id: int,
    role_update: UserRoleUpdate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    service = UserService(db)

    try:
        user = service.update_user_role(user_id, role_update, actor=current_user)
        return user
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

# UPDATE provider link only 
@users_router.patch("/{user_id}/provider", response_model=UserResponse)
def update_user_provider_link(
    user_id: int,
    link_update: UserProviderLinkUpdate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    service = UserService(db)
    try:
        user = service.update_user_provider_link(user_id, link_update, actor=current_user)
        return user
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

# DEACTIVATE user
@users_router.delete("/{user_id}/deactivate", response_model=UserResponse)
def deactivate_user(
    user_id: int,
    current_user: User = Depends(get_current_admin_or_receptionist_user),
    db: Session = Depends(get_db)
):
    service = UserService(db)

    try:
        user = service.deactivate_user(user_id, actor=current_user)
        return user
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

# REACTIVATE user 
@users_router.post("/{user_id}/reactivate", response_model=UserResponse)
def reactivate_user(
    user_id: int,
    current_user: User = Depends(get_current_admin_or_receptionist_user),
    db: Session = Depends(get_db)
):
    service = UserService(db)

    try:
        user = service.reactivate_user(user_id, actor=current_user)
        return user
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

