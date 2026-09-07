from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.services.provider import ProviderServices
from app.schemas.provider import ProviderCreate, ProviderResponse, ProviderUpdate

from app.models.user import User
from app.core.security import (
    get_current_admin_user,
    get_current_user
)
providers_router = APIRouter()


@providers_router.post(
    "/",
    response_model=ProviderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new provider"
)
def create_provider(
    provider_data: ProviderCreate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    service = ProviderServices(db)
    
    try:
        provider = service.create_provider(provider_data, actor=current_user)
        return provider
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@providers_router.get(
    "/",
    response_model=List[ProviderResponse],
    summary="Get all providers"
)
def get_all_providers(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of records to return"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    
    service = ProviderServices(db)
    providers = service.get_all_providers(skip=skip, limit=limit)
    return providers

@providers_router.get(
    "/{doc_number}",
    response_model=ProviderResponse,
    summary="Get a provider by doc_number"
)
def get_provider_by_doc_number(
    doc_number: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    
    service = ProviderServices(db)
    provider = service.get_provider_by_doc_number(doc_number)
    
    if not provider:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Provider with doc_number '{doc_number}' not found"
        )
    
    return provider

@providers_router.put(
    "/{doc_number}",
    response_model=ProviderResponse,
    summary="Update a provider"
)
def update_provider(
    doc_number: str,
    update_data: ProviderUpdate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    service = ProviderServices(db)
    
    try:
        provider = service.update_provider(doc_number, update_data, actor=current_user)
        return provider
    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error_msg
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@providers_router.delete(
    "/{doc_number}",
    response_model=ProviderResponse,
    summary="Deactivate a provider"
)
def deactivate_provider(
    doc_number: str,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    service = ProviderServices(db)
    
    try:
        provider = service.deactivate_provider(doc_number, actor=current_user)
        return provider
    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error_msg
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg
        )


@providers_router.patch(
    "/{doc_number}/reactivate",
    response_model=ProviderResponse,
    summary="Reactivate a provider"
)
def reactivate_provider(
    doc_number: str,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    service = ProviderServices(db)
    
    try:
        provider = service.reactivate_provider(doc_number, actor=current_user)
        return provider
    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error_msg
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg
        )
