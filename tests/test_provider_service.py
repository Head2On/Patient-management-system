import pytest
from app.services.provider import ProviderServices
from app.models.provider import Provider
from app.schemas.provider import ProviderCreate, PostType


class TestProviderServices:

    # CREATE PROVIDER TESTS 

    def test_create_provider_success(self, db_session):
        """Test successful provider creation with correct doc_number format"""
        service = ProviderServices(db_session)
        
        provider_data = ProviderCreate(
            name="Aman Sharma",
            specialization="Cardiology",
            phone="9876543210", 
            email="aman@hospital.com",
            post=PostType.MD
        )
        
        provider = service.create_provider(provider_data)
        
        # Verify returned provider
        assert provider.id is not None
        assert provider.doc_number == "AS3210"  
        assert provider.name == "Aman Sharma"
        assert provider.specialization == "Cardiology"
        assert provider.phone == "9876543210"
        assert provider.email == "aman@hospital.com"
        assert provider.post.value == "MD"
        assert provider.is_active is True
        
        # Verify in database
        saved = db_session.query(Provider).filter(Provider.id == provider.id).first()

        assert saved is not None
        assert saved.doc_number == "AS3210"
        assert saved.name == "Aman Sharma"
    
    def test_create_provider_doc_number_from_name_and_phone(self, db_session):
        """Test doc_number is correctly generated from name initial + last 4 phone digits"""
        service = ProviderServices(db_session)
        
        # Test with standard phone
        provider_data = ProviderCreate(
            name="Riya Patel",
            specialization="Neurology",
            phone="9876549876",
            email="riya@hospital.com",
            post=PostType.MS
        )
        
        provider = service.create_provider(provider_data)
        assert provider.doc_number == "RP9876"  # R + 9876
    
    def test_create_provider_doc_number_with_special_chars_in_phone(self, db_session):
        """Test doc_number uses cleaned phone (ignores special characters)"""
        service = ProviderServices(db_session)
        
        provider_data = ProviderCreate(
            name="Sam Lee",
            specialization="Orthopedics",
            phone="+91-98765-43210",  # Special chars
            email="sam@hospital.com",
            post=PostType.MS
        )
        
        provider = service.create_provider(provider_data)
        
        # Phone stored as provided
        assert provider.phone == "+91-98765-43210"
        # doc_number based on cleaned phone (last 4 = 3210)
        assert provider.doc_number == "SL3210"
    
    def test_create_provider_doc_number_with_short_phone(self, db_session):
        """Test doc_number pads phone if less than 4 digits"""
        service = ProviderServices(db_session)
        
        provider_data = ProviderCreate(
            name="Sam Lee",
            specialization="Orthopedics",
            phone="123",  # Only 3 digits
            email="sam@hospital.com",
            post=PostType.MS
        )
        
        provider = service.create_provider(provider_data)
        assert provider.doc_number == "SL0123"  # Padded with zero
    
    def test_create_provider_without_email(self, db_session):
        """Test creating provider without email (optional field)"""
        service = ProviderServices(db_session)
        
        provider_data = ProviderCreate(
            name="Riya Patel",
            specialization="Neurology",
            phone="9876549876",
            email=None,
            post=PostType.MS
        )
        
        provider = service.create_provider(provider_data)
        
        assert provider.id is not None
        assert provider.doc_number == "RP9876"
        assert provider.email is None
        assert provider.is_active is True
    
    def test_create_provider_with_email(self, db_session):

        """Test creating provider with email"""
        service = ProviderServices(db_session)
        
        provider_data = ProviderCreate(
            name="John Doe",
            specialization="Dermatology",
            phone="9876541234",
            email="johndeo@hospital.com",
            post=PostType.MD
        )
        
        provider = service.create_provider(provider_data)
        
        assert provider.email == "johndeo@hospital.com"
        assert provider.doc_number == "JD1234"
    
    def test_create_provider_duplicate_phone_raises_error(self, db_session):
        """Test that duplicate phone number raises ValueError"""

        service = ProviderServices(db_session)
        
        # Create first provider
        provider_data1 = ProviderCreate(
            name="Aman Sharma",
            specialization="Cardiology",
            phone="9876543210",
            email="aman@hospital.com",
            post=PostType.MD
        )
        service.create_provider(provider_data1)
        
        # Try to create second provider with same phone
        provider_data2 = ProviderCreate(
            name="Amit Sharma",
            specialization="Cardiology",
            phone="9876543210", 
            email="amit@hospital.com",
            post=PostType.MD
        )
        
        with pytest.raises(ValueError) as exc_info:
            service.create_provider(provider_data2)
        
        assert "doc_number" in str(exc_info.value).lower()
        assert "AS3210" in str(exc_info.value)
    
    def test_create_provider_duplicate_doc_number_collision(self, db_session):
        """Test doc_number collision with different phone but same last 4 digits"""
        service = ProviderServices(db_session)
        
        # Create first provider
        provider_data1 = ProviderCreate(
            name="Aman Sharma",
            specialization="Cardiology",
            phone="9876543210",
            email="aman@hospital.com",
            post=PostType.MD
        )
        service.create_provider(provider_data1)
        # doc_number = AS3210
        
        # Try to create second provider with same doc_number
        # Different phone but same last 4 digits (3210)
        provider_data2 = ProviderCreate(
            name="Amit Sharma",  # Same initial 'A'
            specialization="Cardiology",
            phone="9876503210",  # Different prefix, same last 4 digits = 3210
            email="amit@hospital.com",
            post=PostType.MD
        )
        
        with pytest.raises(ValueError) as exc_info:
            service.create_provider(provider_data2)
        
        assert "doc_number" in str(exc_info.value).lower()
        assert "AS3210" in str(exc_info.value)
    
    def test_create_provider_multiple_same_email_allowed(self, db_session):
        """Test that multiple providers can have the same email (not unique)"""
        service = ProviderServices(db_session)
        
        # Create first provider with email
        provider_data1 = ProviderCreate(
            name="Aman Sharma",
            specialization="Cardiology",
            phone="9876543210",
            email="shared@hospital.com",  # Same email
            post=PostType.MD
        )
        provider1 = service.create_provider(provider_data1)
        
        # Create second provider with same email
        provider_data2 = ProviderCreate(
            name="Riya Patel",
            specialization="Neurology",
            phone="9876549876",
            email="shared@hospital.com",  # Same email - allowed!
            post=PostType.MS
        )
        provider2 = service.create_provider(provider_data2)
        
        # Both should be created successfully
        assert provider1.id is not None
        assert provider2.id is not None
        assert provider1.email == provider2.email == "shared@hospital.com"
    
    def test_create_provider_starts_active(self, db_session):
        """Test that new provider always starts as active"""
        service = ProviderServices(db_session)
        
        provider_data = ProviderCreate(
            name="Test Doctor",
            specialization="Test",
            phone="9876549999",
            email="test@hospital.com",
            post=PostType.MD
        )
        
        provider = service.create_provider(provider_data)
        
        assert provider.is_active is True
    
    def test_create_provider_phone_with_parentheses(self, db_session):
        """Test phone with parentheses format"""
        service = ProviderServices(db_session)
        
        provider_data = ProviderCreate(
            name="Jane Doe",
            specialization="Pediatrics",
            phone="(987) 654-3210",
            email="jane@hospital.com",
            post=PostType.MD
        )
        
        provider = service.create_provider(provider_data)
        
        assert provider.phone == "(987) 654-3210"
        assert provider.doc_number == "JD3210"

    # GET PROVIDER BY DOC_NUMBER TESTS

    def test_get_provider_by_doc_number_success(self, db_session):
        """test successfully retriveing a provider by doc_number"""

        service = ProviderServices(db_session)

        provider_data = ProviderCreate(
            name="Aman Sharma",
            specialization="Cardiology",
            phone="9876543210",
            email="aman@hospital.com",
            post=PostType.MD
        )
        created = service.create_provider(provider_data)

        retrieved = service.get_provider_by_doc_number("AS3210")

        assert retrieved is not None
        assert retrieved.id == created.id
        assert retrieved.doc_number == "AS3210"
        assert retrieved.name == "Aman Sharma"
        assert retrieved.specialization == "Cardiology"
        assert retrieved.phone == "9876543210"
        assert retrieved.email == "aman@hospital.com"
        assert retrieved.post.value == "MD"
        assert retrieved.is_active is True

    def test_get_provider_by_doc_number_not_found(self, db_session):
        """Test retrieving a provider that doesn't exist returns None"""

        service = ProviderServices(db_session)
        
        retrieved = service.get_provider_by_doc_number("AS9999")
        
        assert retrieved is None

    def test_get_provider_by_doc_number_case_sensitive(self, db_session):
            
            """Test that doc_number lookup is case-sensitive"""
            service = ProviderServices(db_session)
            
            # Create a provider
            provider_data = ProviderCreate(
                name="Dr. Riya Patel",
                specialization="Neurology",
                phone="9876549876",
                email="riya@hospital.com",
                post=PostType.MS
            )
            service.create_provider(provider_data)
            # doc_number = RP9876
            
            # Try with different case
            retrieved = service.get_provider_by_doc_number("rp9876")  # lowercase
            
            # Should return None because doc_number is case-sensitive
            assert retrieved is None

    def test_get_provider_by_doc_number_inactive_provider(self, db_session):
            """Test that inactive providers are still retrievable (no filter)"""

            service = ProviderServices(db_session)
            
            # Create a provider
            provider_data = ProviderCreate(
                name="Inactive Doctor",
                specialization="Test",
                phone="9876549999",
                email="inactive@hospital.com",
                post=PostType.MD
            )
            provider = service.create_provider(provider_data)
            # doc_number = I9999 (I + 9999)
            
            # Manually deactivate (you'll have this method later)
            provider.is_active = False
            db_session.commit()
            
            # Retrieve by doc_number - should still find it
            retrieved = service.get_provider_by_doc_number("ID9999")
            
            assert retrieved is not None
            assert retrieved.id == provider.id
            assert retrieved.is_active is False 

    def test_get_provider_by_doc_number_empty_string(self, db_session):
            
            """Test retrieving with empty string returns None"""
            service = ProviderServices(db_session)
            
            retrieved = service.get_provider_by_doc_number("")
            
            assert retrieved is None

    def test_get_provider_by_doc_number_with_spaces(self, db_session):
            
            """Test retrieving with doc_number containing spaces (trim handling)"""

            service = ProviderServices(db_session)
            
            # Create a provider
            provider_data = ProviderCreate(
                name="Sam Lee",
                specialization="Orthopedics",
                phone="9876541234",
                email="sam@hospital.com",
                post=PostType.MS
            )
            service.create_provider(provider_data)
            
            retrieved = service.get_provider_by_doc_number(" SL1234 ")
            
           
            assert retrieved is not None
            assert retrieved.doc_number == "SL1234"


    # GET ALL PROVIDERS TESTS

    def test_get_all_providers_empty(self, db_session):
        """Test that empty list is returned when no providers exist"""

        service = ProviderServices(db_session)
            
        providers = service.get_all_providers()
            
        assert providers == []
        assert len(providers) == 0

    def test_get_all_providers_one_provider(self, db_session):
        """Test that one provider is returned"""

        service = ProviderServices(db_session)
        
        # Create one provider
        provider_data = ProviderCreate(
            name="Aman Sharma",
            specialization="Cardiology",
            phone="9876543210",
            email="aman@hospital.com",
            post=PostType.MD
        )
        service.create_provider(provider_data)
        
        providers = service.get_all_providers()
        
        assert len(providers) == 1
        assert providers[0].doc_number == "AS3210"
        assert providers[0].name == "Aman Sharma"

    def test_get_all_providers_multiple_providers(self, db_session):

        """Test that multiple providers are returned"""
        service = ProviderServices(db_session)
            
        # Create multiple providers
        providers_data = [
            ProviderCreate(
                name="Aman Sharma",
                specialization="Cardiology",
                phone="9876543210",
                email="aman@hospital.com",
                post=PostType.MD
            ),
            ProviderCreate(
                name="Riya Patel",
                specialization="Neurology",
                phone="9876549876",
                email="riya@hospital.com",
                post=PostType.MS
            ),
            ProviderCreate(
                name="John Doe",
                specialization="Dermatology",
                phone="9876541234",
                email="john@hospital.com",
                post=PostType.MD
            ),
        ]
            
        for data in providers_data:
            service.create_provider(data)
            
        providers = service.get_all_providers()
            
        assert len(providers) == 3
            
        # Verify all doc_numbers are present
        doc_numbers = [p.doc_number for p in providers]
        assert "AS3210" in doc_numbers
        assert "RP9876" in doc_numbers
        assert "JD1234" in doc_numbers

    def test_get_all_providers_includes_inactive(self, db_session):
        """Test that inactive providers are included in results"""
        service = ProviderServices(db_session)
            
        # Create active provider
        active_data = ProviderCreate(
            name="Active Doctor",
            specialization="Cardiology",
            phone="9876541111",
            email="active@hospital.com",
            post=PostType.MD
        )
        active = service.create_provider(active_data)
            
        # Create inactive provider
        inactive_data = ProviderCreate(
            name="Inactive Doctor",
            specialization="Neurology",
            phone="9876542222",
            email="inactive@hospital.com",
            post=PostType.MS
        )
        inactive = service.create_provider(inactive_data)
            
        # Manually deactivate the second provider
        inactive.is_active = False
        db_session.commit()
            
        # Get all providers
        providers = service.get_all_providers()
            
        # Should include both active and inactive
        assert len(providers) == 2
        doc_numbers = [p.doc_number for p in providers]
        assert active.doc_number in doc_numbers
        assert inactive.doc_number in doc_numbers
            
        # Verify one is inactive
        inactive_found = [p for p in providers if p.is_active is False]
        assert len(inactive_found) == 1
        assert inactive_found[0].doc_number == inactive.doc_number

    def test_get_all_providers_order_by_doc_number(self, db_session):
            """Test that providers are ordered by doc_number ascending"""

            service = ProviderServices(db_session)
            
            provider_data1 = ProviderCreate(
                name="Aman Sharma",  # A
                specialization="Cardiology",
                phone="9876543210",
                email="aman@hospital.com",
                post=PostType.MD
            )
            service.create_provider(provider_data1)
            # doc_number = AS3210
            
            provider_data2 = ProviderCreate(
                name="Bob Smith",  # B
                specialization="Neurology",
                phone="9876549876",
                email="bob@hospital.com",
                post=PostType.MS
            )
            service.create_provider(provider_data2)
            # doc_number = B9876
            
            provider_data3 = ProviderCreate(
                name="Charlie Brown",  # C
                specialization="Dermatology",
                phone="9876541234",
                email="charlie@hospital.com",
                post=PostType.MD
            )
            service.create_provider(provider_data3)
            
            providers = service.get_all_providers()
            
            assert len(providers) == 3
            assert providers[0].doc_number == "AS3210"
            assert providers[1].doc_number == "BS9876"
            assert providers[2].doc_number == "CB1234"
    
    def test_get_all_providers_pagination_skip(self, db_session):
        """Test pagination with skip parameter"""

        service = ProviderServices(db_session)
        
        # Create 5 providers
        for i in range(1, 6):
            provider_data = ProviderCreate(
                name=f"Doctor{i}",
                specialization="Test",
                phone=f"987654{i:04d}",  # 9876540001, 0002, etc.
                email=f"doctor{i}@hospital.com",
                post=PostType.MD
            )
            service.create_provider(provider_data)
        
        # Skip first 2
        providers = service.get_all_providers(skip=2)

        assert len(providers) == 3
        
        assert providers[0].doc_number == "D0003"

    def test_get_all_providers_pagination_limit(self, db_session):
            """Test pagination with limit parameter"""

            service = ProviderServices(db_session)
            
            # Create 5 providers
            for i in range(1, 6):
                provider_data = ProviderCreate(
                    name=f"Doctor{i}",
                    specialization="Test",
                    phone=f"987654{i:04d}",
                    email=f"doctor{i}@hospital.com",
                    post=PostType.MD
                )
                service.create_provider(provider_data)
            
            # Limit to 2
            providers = service.get_all_providers(limit=2)
            
            # Should return only 2 providers
            assert len(providers) == 2
            
            assert providers[0].doc_number == "D0001"
            assert providers[1].doc_number == "D0002"
    
    def test_get_all_providers_pagination_skip_and_limit(self, db_session):
        """Test pagination with both skip and limit"""
        service = ProviderServices(db_session)
        
        # Create 10 providers
        for i in range(1, 11):
            provider_data = ProviderCreate(
                name=f"Doctor{i}",
                specialization="Test",
                phone=f"987654{i:04d}",
                email=f"doctor{i}@hospital.com",
                post=PostType.MD
            )
            service.create_provider(provider_data)
        
        # Skip 3, limit 4
        providers = service.get_all_providers(skip=3, limit=4)
        
        
        assert providers[0].doc_number == "D0004"
        assert providers[1].doc_number == "D0005"
        assert providers[2].doc_number == "D0006"
        assert providers[3].doc_number == "D0007"

    def test_get_all_providers_pagination_limit_greater_than_total(self, db_session):
        """Test pagination with limit greater than total providers"""
        
        service = ProviderServices(db_session)
        
        # Create 3 providers
        for i in range(1, 4):
            provider_data = ProviderCreate(
                name=f"Doctor{i}",
                specialization="Test",
                phone=f"987654{i:04d}",
                email=f"doctor{i}@hospital.com",
                post=PostType.MD
            )
            service.create_provider(provider_data)
        
        # Limit 10 (greater than total 3)
        providers = service.get_all_providers(limit=10)
        
        # Should return all 3
        assert len(providers) == 3
    
    def test_get_all_providers_pagination_skip_greater_than_total(self, db_session):
        """Test pagination with skip greater than total providers"""
        service = ProviderServices(db_session)
        
        # Create 3 providers
        for i in range(1, 4):
            provider_data = ProviderCreate(
                name=f"Doctor{i}",
                specialization="Test",
                phone=f"987654{i:04d}",
                email=f"doctor{i}@hospital.com",
                post=PostType.MD
            )
            service.create_provider(provider_data)
        
        # Skip 10 (greater than total 3)
        providers = service.get_all_providers(skip=10)
        
        # Should return empty list
        assert providers == []
        assert len(providers) == 0
    
    def test_get_all_providers_default_pagination(self, db_session):
        """Test default pagination values (skip=0, limit=100)"""
        service = ProviderServices(db_session)
        
        # Create 50 providers
        for i in range(1, 51):
            provider_data = ProviderCreate(
                name=f"Doctor{i}",
                specialization="Test",
                phone=f"987654{i:04d}",
                email=f"doctor{i}@hospital.com",
                post=PostType.MD
            )
            service.create_provider(provider_data)
        
        # Default: skip=0, limit=100
        providers = service.get_all_providers()
        
        # Should return all 50 (since limit is 100)
        assert len(providers) == 50


