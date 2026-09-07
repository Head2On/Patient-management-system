from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from typing import Optional,List
from app.models.provider import Provider
from app.models.user import User
from app.schemas.provider import ProviderCreate,ProviderUpdate


class ProviderServices:
    
    def __init__(self, db: Session):
        self.db = db

    
    def _generate_doc_number(self, name: str, phone: str) -> str:
      
        # Get first letter of name (uppercase)
        word = name.strip().split()

        filtered_words = [w for w in word if w.lower() not in ("dr.", "dr")]

        name_initial = "".join([w[0] for w in filtered_words if w]).upper()
        
        # Get last 4 digits of phone
        # Remove any non-digit characters first
        clean_phone = ''.join(filter(str.isdigit, phone))
        last_four = clean_phone[-4:] if len(clean_phone) >= 4 else clean_phone.zfill(4)
        
        return f"{name_initial}{last_four}"
    
    def create_provider(self, provider_data: ProviderCreate, actor: Optional[User] = None) -> Provider:
        """Create a new provider"""
        
        # 1. Generate doc_number from name + phone
        doc_number = self._generate_doc_number(
            name=provider_data.name,
            phone=provider_data.phone
        )
        
        # 2. Check if doc_number already exists (pre-check)
        existing = self.db.query(Provider).filter(
            Provider.doc_number == doc_number
        ).first()
        if existing:
            raise ValueError(
                f"Provider with doc_number '{doc_number}' already exists. "
                f"This may be due to similar name and phone combination."
            )
        
        # 3. Check if phone already exists (pre-check)
        existing_phone = self.db.query(Provider).filter(
            Provider.phone == provider_data.phone
        ).first()
        if existing_phone:
            raise ValueError(f"Phone number '{provider_data.phone}' is already registered")
        
        # 4. Create provider instance
        new_provider = Provider(
            doc_number=doc_number,
            name=provider_data.name,
            specialization=provider_data.specialization,
            phone=provider_data.phone,
            email=provider_data.email,  
            post=provider_data.post.value,  
            is_active=True,
            created_by_id=actor.id if actor else None,
            updated_by_id=actor.id if actor else None
        )
        
        # 5. Save to database
        try:
            self.db.add(new_provider)
            self.db.commit()
            self.db.refresh(new_provider)
            return new_provider
            
        except IntegrityError as e:
            self.db.rollback()
            error_msg = str(e)
            # Only check phone constraint (doc_number already handled)
            if "phone" in error_msg.lower():
                raise ValueError(f"Phone number '{provider_data.phone}' is already registered")
            # doc_number collision (should rarely happen due to pre-check)
            if "doc_number" in error_msg.lower():
                raise ValueError(f"doc_number '{doc_number}' already exists")
            raise ValueError(f"Database integrity error: {error_msg}")
            
        except SQLAlchemyError as e:
            self.db.rollback()
            raise ValueError(f"Database error: {str(e)}")

    def get_provider_by_doc_number(self, doc_number: str) -> Optional[Provider]:
        
        if not doc_number:
            return None

        clean_doc_number = doc_number.strip()

        return  self.db.query(Provider).filter(
            Provider.doc_number == clean_doc_number
        ).first()

    def get_all_providers(self, skip: int = 0, limit: int  = 100) -> List[Provider]:

        return self.db.query(Provider)\
            .order_by(Provider.doc_number)\
            .offset(skip)\
            .limit(limit)\
            .all()

    def update_provider(self, doc_number: str, update_data: ProviderUpdate, actor: Optional[User] = None) -> Provider:
       
        # 1. Find provider
        provider = self.get_provider_by_doc_number(doc_number)
        if not provider:
            raise ValueError(f"Provider with doc_number '{doc_number}' not found")
        
        # 2. Check phone uniqueness if phone is being updated
        if update_data.phone is not None and update_data.phone != provider.phone:
            existing_phone = self.db.query(Provider).filter(
                Provider.phone == update_data.phone,
                Provider.id != provider.id  # Exclude current provider
            ).first()
            if existing_phone:
                raise ValueError(f"Phone number '{update_data.phone}' is already registered")
        
        # 3. Apply updates (only fields that are provided)
        if update_data.name is not None:
            provider.name = update_data.name
        
        if update_data.specialization is not None:
            provider.specialization = update_data.specialization
        
        if update_data.phone is not None:
            provider.phone = update_data.phone
        
        if update_data.email is not None:
            provider.email = update_data.email
        
        if update_data.post is not None:
            provider.post = update_data.post.value  # Enum to string

        if actor:
            provider.updated_by_id = actor.id
        
        # 4. Save to database
        try:
            self.db.commit()
            self.db.refresh(provider)
            return provider
            
        except IntegrityError as e:
            self.db.rollback()
            error_msg = str(e)
            if "phone" in error_msg.lower():
                raise ValueError(f"Phone number '{update_data.phone}' is already registered")
            raise ValueError(f"Database integrity error: {error_msg}")
            
        except SQLAlchemyError as e:
            self.db.rollback()
            raise ValueError(f"Database error: {str(e)}")
 
    def deactivate_provider(self, doc_number: str, actor: Optional[User] = None) -> Provider:
       
        # 1. Find provider
        provider = self.get_provider_by_doc_number(doc_number)
        if not provider:
            raise ValueError(f"Provider with doc_number '{doc_number}' not found")
        
        # 2. Check if already inactive
        if not provider.is_active:
            raise ValueError(f"Provider with doc_number '{doc_number}' is already inactive")
        
        # 3. Deactivate
        provider.is_active = False
        if actor:
            provider.updated_by_id = actor.id
        
        # 4. Save
        try:
            self.db.commit()
            self.db.refresh(provider)
            return provider
            
        except SQLAlchemyError as e:
            self.db.rollback()
            raise ValueError(f"Database error: {str(e)}")
    
    def reactivate_provider(self, doc_number: str, actor: Optional[User] = None) -> Provider:
        
        # 1. Find provider
        provider = self.get_provider_by_doc_number(doc_number)
        if not provider:
            raise ValueError(f"Provider with doc_number '{doc_number}' not found")
        
        # 2. Check if already active
        if provider.is_active:
            raise ValueError(f"Provider with doc_number '{doc_number}' is already active")
        
        # 3. Reactivate
        provider.is_active = True
        if actor:
            provider.updated_by_id = actor.id
        
        # 4. Save
        try:
            self.db.commit()
            self.db.refresh(provider)
            return provider
            
        except SQLAlchemyError as e:
            self.db.rollback()
            raise ValueError(f"Database error: {str(e)}")