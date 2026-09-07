import pytest
from app.services.provider import ProviderServices
from app.models.provider import Provider
from app.schemas.provider import ProviderCreate, PostType, ProviderUpdate


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


    # UPDATE PROVIDER TESTS

    def test_update_provider_success(self, db_session):
        """Test successfully updating a provider"""

        service = ProviderServices(db_session)

        provider_data = ProviderCreate(
            name="Aman Sharma",
            specialization="Cardiology",
            phone="9876543210",
            email="aman@hospital.com",
            post=PostType.MD
        )

        created = service.create_provider(provider_data)
        assert created.doc_number == "AS3210"

        #update the provider 
        update_data = ProviderUpdate(
            name="Aman Kumar Sharma",
            specialization="Interventional Cardiology",
            phone="9876549999",
            email="amankumar@hospital.com",
            post=PostType.MS
        )

        updated = service.update_provider("AS3210", update_data)

        assert  updated.id == created.id
        assert updated.doc_number == "AS3210" # unchanged 
        assert updated.name == "Aman Kumar Sharma"
        assert updated.specialization == "Interventional Cardiology"
        assert updated.phone == "9876549999"
        assert updated.email == "amankumar@hospital.com"
        assert updated.post.value == "MS"

    def test_update_provider_partial_updates(self, db_session):
        """Test partial update (only some fields)"""

        service = ProviderServices(db_session)

        # Create a provider
        provider_data = ProviderCreate(
            name="Riya Patel",
            specialization="Neurology",
            phone="9876549876",
            email="riya@hospital.com",
            post=PostType.MS
        )
        service.create_provider(provider_data)

        # Update only name and specialization
        update_data = ProviderUpdate(
            name="Riya Sharma Patel",
            specialization="Pediatric Neurology"
        )

        updated = service.update_provider("RP9876", update_data)
        
        # Verify only name and specialization changed
        assert updated.name == "Riya Sharma Patel"
        assert updated.specialization == "Pediatric Neurology"
        assert updated.phone == "9876549876"  # Unchanged
        assert updated.email == "riya@hospital.com"  # Unchanged
        assert updated.post.value == "MS"  # Unchanged
        assert updated.is_active is True

    def test_update_provider_partial_update(self, db_session):
        """Test partial update (only some fields)"""

        service = ProviderServices(db_session)
        
        # Create a provider
        provider_data = ProviderCreate(
            name="Riya Patel",
            specialization="Neurology",
            phone="9876549876",
            email="riya@hospital.com",
            post=PostType.MS
        )
        service.create_provider(provider_data)

        # Update only name and specialization
        update_data = ProviderUpdate(
            name="Riya Sharma Patel",
            specialization="Pediatric Neurology"
        )
        
        updated = service.update_provider("RP9876", update_data)
        
        # Verify only name and specialization changed
        assert updated.name == "Riya Sharma Patel"
        assert updated.specialization == "Pediatric Neurology"
        assert updated.phone == "9876549876"  # Unchanged
        assert updated.email == "riya@hospital.com"  # Unchanged
        assert updated.post.value == "MS"  # Unchanged
        assert updated.is_active is True 

    def test_update_provider_update_phone(self, db_session):
        """Test updating phone number"""

        service = ProviderServices(db_session)
        
        # Create a provider
        provider_data = ProviderCreate(
            name="John Doe",
            specialization="Dermatology",
            phone="9876541234",
            email="john@hospital.com",
            post=PostType.MD
        )
        service.create_provider(provider_data)

        # Update phone
        update_data = ProviderUpdate(phone="9876545555")
        updated = service.update_provider("JD1234", update_data)
        
        assert updated.phone == "9876545555"

    def test_update_provider_phone_already_exists_raises_error(self, db_session):
        """Test that updating to an existing phone number raises error"""

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
        
        # Create second provider
        provider_data2 = ProviderCreate(
            name="Riya Patel",
            specialization="Neurology",
            phone="9876549876",
            email="riya@hospital.com",
            post=PostType.MS
        )
        service.create_provider(provider_data2)
        
        # Try to update second provider with first provider's phone
        update_data = ProviderUpdate(phone="9876543210")
        
        with pytest.raises(ValueError) as exc_info:
            service.update_provider("RP9876", update_data)
        
        assert "already registered" in str(exc_info.value).lower()
        assert "9876543210" in str(exc_info.value)

    def test_update_provider_same_phone_no_error(self, db_session):
        """Test updating with same phone (no change) doesn't raise error"""

        service = ProviderServices(db_session)
        
        # Create a provider
        provider_data = ProviderCreate(
            name="Aman Sharma",
            specialization="Cardiology",
            phone="9876543210",
            email="aman@hospital.com",
            post=PostType.MD
        )
        service.create_provider(provider_data)
        
        # Update with same phonem  
        update_data = ProviderUpdate(phone="9876543210") 
        
        # Should not raise error
        updated = service.update_provider("AS3210", update_data)
        assert updated.phone == "9876543210"

    def test_update_provider_update_email(self, db_session):
        """Test updating email (not unique)"""

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
        
        # Update email
        update_data = ProviderUpdate(email="samlee@hospital.com")
        updated = service.update_provider("SL1234", update_data)
        
        assert updated.email == "samlee@hospital.com"
    
    def test_update_provider_duplicate_email_allowed(self, db_session):
        """Test that multiple providers can share the same email"""

        service = ProviderServices(db_session)
        
        # Create first provider with email
        provider_data1 = ProviderCreate(
            name="Aman Sharma",
            specialization="Cardiology",
            phone="9876543210",
            email="shared@hospital.com",
            post=PostType.MD
        )
        service.create_provider(provider_data1)
        
        # Create second provider with different email
        provider_data2 = ProviderCreate(
            name="Riya Patel",
            specialization="Neurology",
            phone="9876549876",
            email="riya@hospital.com",
            post=PostType.MS
        )
        service.create_provider(provider_data2)
        
        # Update second provider to use first provider's email
        update_data = ProviderUpdate(email="shared@hospital.com")
        updated = service.update_provider("RP9876", update_data)
        
        # Should succeed (email not unique)
        assert updated.email == "shared@hospital.com"
        
        # Both providers should have same email
        provider1 = service.get_provider_by_doc_number("AS3210")
        provider2 = service.get_provider_by_doc_number("RP9876")
        assert provider1.email == provider2.email == "shared@hospital.com"
    
    def test_update_provider_not_found_raises_error(self, db_session):
        """Test updating a provider that doesn't exist raises error"""

        service = ProviderServices(db_session)
        
        update_data = ProviderUpdate(name="New Name")
        
        with pytest.raises(ValueError) as exc_info:
            service.update_provider("AS9999", update_data)
        
        assert "not found" in str(exc_info.value).lower()
        assert "AS9999" in str(exc_info.value)
    
    def test_update_provider_doc_number_immutable(self, db_session):
        """Test that doc_number cannot be changed (not in update schema)"""

        service = ProviderServices(db_session)
        
        # Create a provider
        provider_data = ProviderCreate(
            name="Aman Sharma",
            specialization="Cardiology",
            phone="9876543210",
            email="aman@hospital.com",
            post=PostType.MD
        )
        service.create_provider(provider_data)
        
        from app.schemas.provider import ProviderUpdate
        assert not hasattr(ProviderUpdate, 'doc_number')   

    def test_update_provider_is_active_not_allowed(self, db_session):
        """Test that is_active cannot be updated through ProviderUpdate"""

        service = ProviderServices(db_session)
        
        # Create a provider
        provider_data = ProviderCreate(
            name="Dr. Test Doctor",
            specialization="Test",
            phone="9876549999",
            email="test@hospital.com",
            post=PostType.MD
        )
        service.create_provider(provider_data)
        
        # Just verify the schema doesn't have is_active
        from app.schemas.provider import ProviderUpdate
        assert not hasattr(ProviderUpdate, 'is_active')
    
    def test_update_provider_multiple_fields(self, db_session):
        """Test updating multiple fields at once"""

        service = ProviderServices(db_session)
        
        # Create a provider
        provider_data = ProviderCreate(
            name="Old Name",
            specialization="Old Specialty",
            phone="9876541111",
            email="old@hospital.com",
            post=PostType.MD
        )
        service.create_provider(provider_data)
        # doc_number = O1111
        
        # Update multiple fields
        update_data = ProviderUpdate(
            name="New Name",
            specialization="New Specialty",
            phone="9876542222",
            email="new@hospital.com",
            post=PostType.MS
        )
        
        updated = service.update_provider("ON1111", update_data)
        
        assert updated.name == "New Name"
        assert updated.specialization == "New Specialty"
        assert updated.phone == "9876542222"
        assert updated.email == "new@hospital.com"
        assert updated.post.value == "MS"
        assert updated.is_active is True


    # DEACTIVATE PROVIDER TEST 
    
    def test_deactivate_provider_success(self, db_session):
        """Test successfully deactivating a provider"""

        service = ProviderServices(db_session)
        
        # Create a provider (starts active)
        provider_data = ProviderCreate(
            name="Aman Sharma",
            specialization="Cardiology",
            phone="9876543210",
            email="aman@hospital.com",
            post=PostType.MD
        )
        provider = service.create_provider(provider_data)
        assert provider.is_active is True
        
        # Deactivate
        deactivated = service.deactivate_provider("AS3210")
        
        assert deactivated.id == provider.id
        assert deactivated.is_active is False
        assert deactivated.doc_number == "AS3210"
        assert deactivated.name == "Aman Sharma"  # Other fields unchanged
        
        # Verify in database
        saved = service.get_provider_by_doc_number("AS3210")
        assert saved.is_active is False
    
    def test_deactivate_provider_already_inactive_raises_error(self, db_session):
        """Test deactivating an already inactive provider raises error"""

        service = ProviderServices(db_session)
        
        # Create a provider
        provider_data = ProviderCreate(
            name="Riya Patel",
            specialization="Neurology",
            phone="9876549876",
            email="riya@hospital.com",
            post=PostType.MS
        )
        service.create_provider(provider_data)
        
        # Deactivate first time
        service.deactivate_provider("RP9876")
        
        # Try to deactivate again
        with pytest.raises(ValueError) as exc_info:
            service.deactivate_provider("RP9876")
        
        assert "already inactive" in str(exc_info.value).lower()
        assert "RP9876" in str(exc_info.value)
    
    def test_deactivate_provider_not_found_raises_error(self, db_session):
        """Test deactivating a provider that doesn't exist raises error"""

        service = ProviderServices(db_session)
        
        with pytest.raises(ValueError) as exc_info:
            service.deactivate_provider("AS9999")
        
        assert "not found" in str(exc_info.value).lower()
        assert "AS9999" in str(exc_info.value)
    
    def test_deactivate_provider_preserves_other_fields(self, db_session):
        """Test that deactivation only changes is_active"""

        service = ProviderServices(db_session)
        
        # Create a provider
        provider_data = ProviderCreate(
            name="John Doe",
            specialization="Dermatology",
            phone="9876541234",
            email="johndoe@hospital.com",
            post=PostType.MD
        )
        provider = service.create_provider(provider_data)
        
        # Store original values
        original_name = provider.name
        original_specialization = provider.specialization
        original_phone = provider.phone
        original_email = provider.email
        original_post = provider.post.value
        
        # Deactivate
        deactivated = service.deactivate_provider("JD1234")
        
        # Verify only is_active changed
        assert deactivated.name == original_name
        assert deactivated.specialization == original_specialization
        assert deactivated.phone == original_phone
        assert deactivated.email == original_email
        assert deactivated.post.value == original_post
        assert deactivated.is_active is False

    # REACTIVATE PROVIDER TESTS 

    def test_reactivate_provider_success(self, db_session):
        """Test successfully reactivating a provider"""

        service = ProviderServices(db_session)
        
        # Create a provider
        provider_data = ProviderCreate(
            name="Aman Sharma",
            specialization="Cardiology",
            phone="9876543210",
            email="aman@hospital.com",
            post=PostType.MD
        )
        provider = service.create_provider(provider_data)
        assert provider.is_active is True
        
        # Deactivate first
        service.deactivate_provider("AS3210")
        deactivated = service.get_provider_by_doc_number("AS3210")
        assert deactivated.is_active is False
        
        # Reactivate
        reactivated = service.reactivate_provider("AS3210")
        
        assert reactivated.id == provider.id
        assert reactivated.is_active is True
        assert reactivated.doc_number == "AS3210"
        assert reactivated.name == "Aman Sharma"
        
        # Verify in database
        saved = service.get_provider_by_doc_number("AS3210")
        assert saved.is_active is True
    
    def test_reactivate_provider_already_active_raises_error(self, db_session):
        """Test reactivating an already active provider raises error"""

        service = ProviderServices(db_session)
        
        # Create a provider (starts active)
        provider_data = ProviderCreate(
            name="Riya Patel",
            specialization="Neurology",
            phone="9876549876",
            email="riya@hospital.com",
            post=PostType.MS
        )
        service.create_provider(provider_data)
        
        # Try to reactivate (already active)
        with pytest.raises(ValueError) as exc_info:
            service.reactivate_provider("RP9876")
        
        assert "already active" in str(exc_info.value).lower()
        assert "RP9876" in str(exc_info.value)
    
    def test_reactivate_provider_not_found_raises_error(self, db_session):
        """Test reactivating a provider that doesn't exist raises error"""

        service = ProviderServices(db_session)
        
        with pytest.raises(ValueError) as exc_info:
            service.reactivate_provider("AS9999")
        
        assert "not found" in str(exc_info.value).lower()
        assert "AS9999" in str(exc_info.value)
    
    def test_reactivate_provider_preserves_other_fields(self, db_session):
        """Test that reactivation only changes is_active"""

        service = ProviderServices(db_session)
        
        # Create a provider
        provider_data = ProviderCreate(
            name="John Doe",
            specialization="Dermatology",
            phone="9876541234",
            email="john@hospital.com",
            post=PostType.MD
        )
        service.create_provider(provider_data)
        
        # Deactivate
        service.deactivate_provider("JD1234")
        
        # Store original values
        provider = service.get_provider_by_doc_number("JD1234")
        original_name = provider.name
        original_specialization = provider.specialization
        original_phone = provider.phone
        original_email = provider.email
        original_post = provider.post.value
        
        # Reactivate
        reactivated = service.reactivate_provider("JD1234")
        
        # Verify only is_active changed
        assert reactivated.name == original_name
        assert reactivated.specialization == original_specialization
        assert reactivated.phone == original_phone
        assert reactivated.email == original_email
        assert reactivated.post.value == original_post
        assert reactivated.is_active is True

    # INTEGRATION: DEACTIVATE + REACTIVATE CYCLE

    def test_deactivate_reactivate_cycle(self, db_session):
        """Test full deactivate → reactivate cycle"""

        service = ProviderServices(db_session)
        
        # Create a provider
        provider_data = ProviderCreate(
            name="Test Doctor",
            specialization="Test",
            phone="9876549999",
            email="test@hospital.com",
            post=PostType.MD
        )
        provider = service.create_provider(provider_data)
        assert provider.is_active is True
        
        # Deactivate
        deactivated = service.deactivate_provider("TD9999")
        assert deactivated.is_active is False
        
        # Reactivate
        reactivated = service.reactivate_provider("TD9999")
        assert reactivated.is_active is True
        
        # Final state should be active
        final = service.get_provider_by_doc_number("TD9999")
        assert final.is_active is True

    # ============= AUDIT TRAIL TESTS =============

    def test_create_provider_audit_fields(self, db_session, admin_user):
        """Test provider creation records actor in created_by_id and updated_by_id"""
        service = ProviderServices(db_session)
        provider_data = ProviderCreate(
            name="Audit Doc",
            specialization="Radiology",
            phone="9876547777",
            post=PostType.MD
        )
        provider = service.create_provider(provider_data, actor=admin_user)
        assert provider.created_by_id == admin_user.id
        assert provider.updated_by_id == admin_user.id

    def test_update_provider_audit_fields(self, db_session, active_provider, admin_user):
        """Test provider update records actor in updated_by_id"""
        service = ProviderServices(db_session)
        updated = service.update_provider(
            active_provider.doc_number,
            ProviderUpdate(specialization="Orthopedics"),
            actor=admin_user
        )
        assert updated.updated_by_id == admin_user.id

    def test_deactivate_provider_audit_fields(self, db_session, active_provider, admin_user):
        """Test provider deactivation records actor in updated_by_id"""
        service = ProviderServices(db_session)
        deactivated = service.deactivate_provider(active_provider.doc_number, actor=admin_user)
        assert deactivated.updated_by_id == admin_user.id

    def test_reactivate_provider_audit_fields(self, db_session, inactive_provider, admin_user):
        """Test provider reactivation records actor in updated_by_id"""
        service = ProviderServices(db_session)
        reactivated = service.reactivate_provider(inactive_provider.doc_number, actor=admin_user)
        assert reactivated.updated_by_id == admin_user.id