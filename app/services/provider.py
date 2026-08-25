from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from typing import Optional,List
from app.models.provider import Provider
from app.schemas.provider import ProviderCreate


class ProviderServices:
    
    def __init__(self, db: Session):
        self.db = db
    
    def _generate_doc_number(self, name: str, phone: str) -> str:
      
        # Get first letter of name (uppercase)
        word = name.strip().split()
        name_initial = "".join([word[0] for word in word if word]).upper()
        
        # Get last 4 digits of phone
        # Remove any non-digit characters first
        clean_phone = ''.join(filter(str.isdigit, phone))
        last_four = clean_phone[-4:] if len(clean_phone) >= 4 else clean_phone.zfill(4)
        
        return f"{name_initial}{last_four}"
    
    def create_provider(self, provider_data: ProviderCreate) -> Provider:

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
            is_active=True 
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

    def get_all_providers(self, skip: int = 0, limit = 100) -> List[Provider]:

        return self.db.query(Provider)\
            .order_by(Provider.doc_number)\
            .offset(skip)\
            .limit(limit)\
            .all()