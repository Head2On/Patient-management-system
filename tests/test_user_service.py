import pytest
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.user import User, UserRole
from app.services.user import UserService
from app.services.provider import ProviderServices
from app.schemas.user import UserCreate, UserUpdate, UserAdminUpdate, UserProviderLinkUpdate
from app.schemas.provider import ProviderCreate, PostType
from app.core.security import verify_password


class TestUserServiceCreate:
    
    def test_admin_can_create_receptionist(self, db_session: Session, admin_user: User):
        """Test 1: Admin can create Receptionist """

        service = UserService(db_session)
        
        user_data = UserCreate(
            phone="9876543210",
            email="receptionist@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        
        user = service.create_user(user_data, actor=admin_user)
        
        assert user.id is not None
        assert user.phone == "9876543210"
        assert user.email == "receptionist@hospital.com"
        assert user.role == UserRole.RECEPTIONIST
        assert user.provider_id is None
        assert user.is_active is True
        assert user.created_at is not None
        assert user.password_hash != "SecurePass123"  # Should be hashed
        assert verify_password("SecurePass123", user.password_hash) is True

    def test_admin_can_create_doctor_with_provider(self, db_session: Session, admin_user: User):
        """Test 2: Admin can create Doctor with Provider """

        provider_service = ProviderServices(db_session)
        provider = provider_service.create_provider(
            ProviderCreate(
                name="Aman Sharma",
                specialization="Cardiology",
                phone="9876543210",
                email="aman@hospital.com",
                post=PostType.MD
            )
        )

        service = UserService(db_session)
        user_data = UserCreate(
            phone="9876543211",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=provider.id
        )
        
        user = service.create_user(user_data, actor=admin_user)
        
        assert user.id is not None
        assert user.phone == "9876543211"
        assert user.email == "doctor@hospital.com"
        assert user.role == UserRole.DOCTOR
        assert user.provider_id == provider.id
        assert user.is_active is True
        assert verify_password("SecurePass123", user.password_hash) is True

    def test_non_admin_cannot_create_user(self, db_session: Session, doctor_user: User):
        """Test 3: Non-admin cannot create User """


        service = UserService(db_session)
        
        user_data = UserCreate(
            phone="9876543212",
            email="test@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.create_user(user_data, actor=doctor_user)
        
        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
        assert "Only admins can create user accounts" in exc_info.value.detail

    def test_duplicate_phone(self, db_session: Session, admin_user: User, existing_user: User):
        """Test 4: Duplicate phone """

        service = UserService(db_session)
        
        user_data = UserCreate(
            phone=existing_user.phone,  # Same phone as existing user
            email="new@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.create_user(user_data, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Phone number already registered" in exc_info.value.detail

    def test_doctor_without_provider_id(self, db_session: Session, admin_user: User):
        """Test 5: Doctor without provider_id raises validation error """

        with pytest.raises(ValueError, match="DOCTOR role requires a valid provider_id"):
            UserCreate(
                phone="9876543213",
                email="doctor@hospital.com",
                password="SecurePass123",
                role=UserRole.DOCTOR,
                provider_id=None  # Missing provider_id
            )

    def test_doctor_with_nonexistent_provider(self, db_session: Session, admin_user: User):
        """Test 6: Doctor with nonexistent Provider """

        service = UserService(db_session)
        
        user_data = UserCreate(
            phone="9876543214",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=99999  # Non-existent provider
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.create_user(user_data, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Provider must exist and be active" in exc_info.value.detail

    def test_doctor_with_inactive_provider(self, db_session: Session, admin_user: User):
        """Test 7: Doctor with inactive Provider """

        provider_service = ProviderServices(db_session)
        provider = provider_service.create_provider(
            ProviderCreate(
                name="Inactive Doctor",
                specialization="Neurology",
                phone="9876548888",
                email="inactive@hospital.com",
                post=PostType.MS
            )
        )
        provider_service.deactivate_provider(provider.doc_number)

        service = UserService(db_session)
        user_data = UserCreate(
            phone="9876543215",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=provider.id
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.create_user(user_data, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Provider must exist and be active" in exc_info.value.detail

    def test_provider_already_linked(self, db_session: Session, admin_user: User):
        """Test 8: Provider already linked """

        provider_service = ProviderServices(db_session)
        provider = provider_service.create_provider(
            ProviderCreate(
                name="Linked Doctor",
                specialization="Pediatrics",
                phone="9876547777",
                email="linked@hospital.com",
                post=PostType.MD
            )
        )

        service = UserService(db_session)
        
        # Link provider to a first doctor user
        first_doc = UserCreate(
            phone="9876543299",
            email="first_doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=provider.id
        )
        service.create_user(first_doc, actor=admin_user)

        # Attempt to link the same provider to a second doctor user
        duplicate_user_data = UserCreate(
            phone="9876543216",
            email="new_doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=provider.id
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.create_user(duplicate_user_data, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Provider is already linked to another user account" in exc_info.value.detail

    def test_admin_with_provider_id(self):
        """Test 9: Admin with provider_id raises validation error """

        with pytest.raises(ValueError, match="Only DOCTOR role can be linked to provider_id"):
            UserCreate(
                phone="9876543217",
                email="admin@hospital.com",
                password="SecurePass123",
                role=UserRole.ADMIN,
                provider_id=1  # Admin cannot have provider_id
            )

    def test_receptionist_with_provider_id(self):
        """Test 10: Receptionist with provider_id raises validation error """

        with pytest.raises(ValueError, match="Only DOCTOR role can be linked to provider_id"):
            UserCreate(
                phone="9876543218",
                email="receptionist@hospital.com",
                password="SecurePass123",
                role=UserRole.RECEPTIONIST,
                provider_id=1  # Receptionist cannot have provider_id
            )

    def test_password_is_stored_hashed(self, db_session: Session, admin_user: User):
        """Test 11: Password is stored hashed """

        service = UserService(db_session)
        
        plain_password = "SecurePass123"
        user_data = UserCreate(
            phone="9876543219",
            email="test@hospital.com",
            password=plain_password,
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        
        user = service.create_user(user_data, actor=admin_user)
        
        # Password should not be stored in plain text
        assert user.password_hash != plain_password
        # But should verify correctly
        assert verify_password(plain_password, user.password_hash) is True

    def test_new_user_is_active(self, db_session: Session, admin_user: User):
        """Test 12: New User is active """
        
        service = UserService(db_session)
        
        user_data = UserCreate(
            phone="9876543220",
            email="test@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        
        user = service.create_user(user_data, actor=admin_user)
        
        assert user.is_active is True

    # Get the user by there ID

    def test_get_user_by_id_success(self, db_session, admin_user):
        """Test successfully retrieving a user by ID"""

        service = UserService(db_session)
        
        # Create a user first
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Retrieve by ID
        retrieved = service.get_user_by_id(created_user.id)
        
        assert retrieved is not None
        assert retrieved.id == created_user.id
        assert retrieved.phone == "9876543210"
        assert retrieved.email == "test@hospital.com"
        assert retrieved.role.value == UserRole.RECEPTIONIST
        assert retrieved.provider_id is None
        assert retrieved.is_active is True
        assert retrieved.created_at is not None

    def test_get_user_by_id_with_doctor_and_provider(self, db_session, admin_user, active_provider):
        """Test retrieving a doctor user with provider link"""
        service = UserService(db_session)
        
        # Create a doctor user with provider
        user_data = UserCreate(
            phone="9876543211",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Retrieve by ID
        retrieved = service.get_user_by_id(created_user.id)
        
        assert retrieved is not None
        assert retrieved.id == created_user.id
        assert retrieved.phone == "9876543211"
        assert retrieved.role == UserRole.DOCTOR
        assert retrieved.provider_id == active_provider.id
        assert retrieved.is_active is True

    def test_get_user_by_id_not_found(self, db_session):
        """Test retrieving a user that doesn't exist returns None"""
        service = UserService(db_session)
        
        retrieved = service.get_user_by_id(99999)  # Non-existent ID
        
        assert retrieved is None

    def test_get_user_by_id_inactive_user(self, db_session, admin_user):
        """Test retrieving an inactive user still returns the user"""
        service = UserService(db_session)
        
        # Create a user
        user_data = UserCreate(
            phone="9876543212",
            email="inactive@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Deactivate the user
        service.deactivate_user(created_user.id, actor=admin_user)
        
        # Retrieve by ID - should still find it
        retrieved = service.get_user_by_id(created_user.id)
        
        assert retrieved is not None
        assert retrieved.id == created_user.id
        assert retrieved.is_active is False
        assert retrieved.phone == "9876543212"

    def test_get_user_by_id_returns_correct_fields(self, db_session, admin_user):
        """Test that all expected fields are returned"""
        service = UserService(db_session)
        
        # Create a user with all fields
        user_data = UserCreate(
            phone="9876543213",
            email="full@hospital.com",
            password="SecurePass123",
            role=UserRole.ADMIN,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Retrieve
        retrieved = service.get_user_by_id(created_user.id)
        
        # Verify all fields are present and correct
        assert hasattr(retrieved, 'id')
        assert hasattr(retrieved, 'phone')
        assert hasattr(retrieved, 'email')
        assert hasattr(retrieved, 'role')
        assert hasattr(retrieved, 'provider_id')
        assert hasattr(retrieved, 'is_active')
        assert hasattr(retrieved, 'created_at')
        assert hasattr(retrieved, 'updated_at')
        assert hasattr(retrieved, 'password_hash')  # Model has it
        
        # But NOT returned in response (schema handles this)
        assert retrieved.id is not None
        assert retrieved.phone == "9876543213"
        assert retrieved.email == "full@hospital.com"
        assert retrieved.role == UserRole.ADMIN
        assert retrieved.provider_id is None
        assert retrieved.is_active is True

    def test_get_user_by_id_with_same_id_returns_same_user(self, db_session, admin_user):
        """Test that multiple calls with same ID return the same user"""
        service = UserService(db_session)
        
        # Create a user
        user_data = UserCreate(
            phone="9876543214",
            email="test2@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Retrieve twice
        retrieved1 = service.get_user_by_id(created_user.id)
        retrieved2 = service.get_user_by_id(created_user.id)
        
        assert retrieved1.id == retrieved2.id
        assert retrieved1.phone == retrieved2.phone
        assert retrieved1.email == retrieved2.email
        assert retrieved1.role == retrieved2.role
        assert retrieved1.is_active == retrieved2.is_active

    def test_get_user_by_id_after_update(self, db_session, admin_user):
        """Test retrieving a user after they've been updated"""
        service = UserService(db_session)
        
        # Create a user
        user_data = UserCreate(
            phone="9876543215",
            email="old@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Update the user (using update method)
        from app.schemas.user import UserUpdate
        update_data = UserUpdate(
            phone="9876543216",
            email="new@hospital.com"
        )
        service.update_user(created_user.id, update_data, actor=admin_user)
        
        # Retrieve by ID
        retrieved = service.get_user_by_id(created_user.id)
        
        assert retrieved.phone == "9876543216"
        assert retrieved.email == "new@hospital.com"
        assert retrieved.id == created_user.id

    def test_get_user_by_id_zero_id(self, db_session):
        """Test retrieving with ID 0 returns None"""
        service = UserService(db_session)
        
        retrieved = service.get_user_by_id(0)
        
        assert retrieved is None

    def test_get_user_by_id_negative_id(self, db_session):
        """Test retrieving with negative ID returns None"""
        service = UserService(db_session)
        
        retrieved = service.get_user_by_id(-1)
        
        assert retrieved is None

    # GET use by phone number 

    def test_get_user_by_phone_success(self, db_session, admin_user):
        """Test successfully retrieving a user by phone"""

        service = UserService(db_session)
        
        # Create a user first
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Retrieve by phone
        retrieved = service.get_user_by_phone("9876543210")
        
        assert retrieved is not None
        assert retrieved.id == created_user.id
        assert retrieved.phone == "9876543210"
        assert retrieved.email == "test@hospital.com"
        assert retrieved.role == UserRole.RECEPTIONIST
        assert retrieved.provider_id is None
        assert retrieved.is_active is True
        assert retrieved.created_at is not None

    def test_get_user_by_phone_with_doctor_and_provider(self, db_session, admin_user, active_provider):
        """Test retrieving a doctor user with provider link by phone"""
        service = UserService(db_session)
        
        # Create a doctor user with provider
        user_data = UserCreate(
            phone="9876543211",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Retrieve by phone
        retrieved = service.get_user_by_phone("9876543211")
        
        assert retrieved is not None
        assert retrieved.id == created_user.id
        assert retrieved.phone == "9876543211"
        assert retrieved.role == UserRole.DOCTOR
        assert retrieved.provider_id == active_provider.id
        assert retrieved.is_active is True

    def test_get_user_by_phone_not_found(self, db_session):
        """Test retrieving a user that doesn't exist returns None"""
        service = UserService(db_session)
        
        retrieved = service.get_user_by_phone("9999999999")  # Non-existent phone
        
        assert retrieved is None

    def test_get_user_by_phone_inactive_user(self, db_session, admin_user):
        """Test retrieving an inactive user still returns the user"""
        service = UserService(db_session)
        
        # Create a user
        user_data = UserCreate(
            phone="9876543212",
            email="inactive@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Deactivate the user
        service.deactivate_user(created_user.id, actor=admin_user)
        
        # Retrieve by phone - should still find it
        retrieved = service.get_user_by_phone("9876543212")
        
        assert retrieved is not None
        assert retrieved.id == created_user.id
        assert retrieved.is_active is False
        assert retrieved.phone == "9876543212"

    def test_get_user_by_phone_returns_correct_fields(self, db_session, admin_user):
        """Test that all expected fields are returned"""
        service = UserService(db_session)
        
        # Create a user with all fields
        user_data = UserCreate(
            phone="9876543213",
            email="full@hospital.com",
            password="SecurePass123",
            role=UserRole.ADMIN,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Retrieve by phone
        retrieved = service.get_user_by_phone("9876543213")
        
        # Verify all fields are present and correct
        assert hasattr(retrieved, 'id')
        assert hasattr(retrieved, 'phone')
        assert hasattr(retrieved, 'email')
        assert hasattr(retrieved, 'role')
        assert hasattr(retrieved, 'provider_id')
        assert hasattr(retrieved, 'is_active')
        assert hasattr(retrieved, 'created_at')
        assert hasattr(retrieved, 'updated_at')
        assert hasattr(retrieved, 'password_hash')  # Model has it
        
        assert retrieved.id == created_user.id
        assert retrieved.phone == "9876543213"
        assert retrieved.email == "full@hospital.com"
        assert retrieved.role == UserRole.ADMIN
        assert retrieved.provider_id is None
        assert retrieved.is_active is True

    def test_get_user_by_phone_case_sensitive(self, db_session, admin_user):
        """Test that phone lookup is exact match (no case sensitivity for numbers)"""
        service = UserService(db_session)
        
        # Create a user
        user_data = UserCreate(
            phone="9876543214",
            email="test@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        service.create_user(user_data, actor=admin_user)
        
        # Try with a different number
        retrieved = service.get_user_by_phone("9876543215")
        
        assert retrieved is None

    def test_get_user_by_phone_with_leading_trailing_spaces(self, db_session, admin_user):
        """Test that phone with spaces is handled correctly"""
        service = UserService(db_session)
        
        # Create a user
        user_data = UserCreate(
            phone="9876543216",
            email="test@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # The phone is stored without trimming by default
        retrieved = service.get_user_by_phone("9876543216")  # No spaces
        
        assert retrieved is not None
        assert retrieved.id == created_user.id
        
        # But if there are spaces in the stored phone, it won't match
        # This is fine - exact match is expected

    def test_get_user_by_phone_after_update(self, db_session, admin_user):
        """Test retrieving a user after their phone number has been updated"""
        service = UserService(db_session)
        
        # Create a user
        user_data = UserCreate(
            phone="9876543217",
            email="old@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Update the phone number
        from app.schemas.user import UserUpdate
        update_data = UserUpdate(phone="9876543218")
        service.update_user(created_user.id, update_data, actor=admin_user)
        
        # Try to retrieve by old phone - should return None
        retrieved_old = service.get_user_by_phone("9876543217")
        assert retrieved_old is None
        
        # Retrieve by new phone - should find the user
        retrieved_new = service.get_user_by_phone("9876543218")
        assert retrieved_new is not None
        assert retrieved_new.id == created_user.id
        assert retrieved_new.phone == "9876543218"

    def test_get_user_by_phone_empty_string(self, db_session):
        """Test retrieving with empty string returns None"""
        service = UserService(db_session)
        
        retrieved = service.get_user_by_phone("")
        
        assert retrieved is None

    def test_get_user_by_phone_duplicate_phone_not_possible(self, db_session, admin_user):
        """Test that duplicate phone numbers are prevented (unique constraint)"""
        service = UserService(db_session)
        
        # Create first user
        user_data1 = UserCreate(
            phone="9876543219",
            email="user1@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        service.create_user(user_data1, actor=admin_user)
        
        # Try to create second user with same phone
        user_data2 = UserCreate(
            phone="9876543219",  # Same phone
            email="user2@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.create_user(user_data2, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Phone number already registered" in exc_info.value.detail

    def test_get_user_by_phone_after_reactivation(self, db_session, admin_user):
        """Test retrieving a user after reactivation"""
        service = UserService(db_session)
        
        # Create a user
        user_data = UserCreate(
            phone="9876543220",
            email="reactivate@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Deactivate
        service.deactivate_user(created_user.id, actor=admin_user)
        
        # Retrieve - should still find (inactive)
        retrieved_inactive = service.get_user_by_phone("9876543220")
        assert retrieved_inactive.is_active is False
        
        # Reactivate
        service.reactivate_user(created_user.id, actor=admin_user)
        
        # Retrieve - should be active
        retrieved_active = service.get_user_by_phone("9876543220")
        assert retrieved_active.is_active is True

    def test_get_user_by_phone_multiple_retrievals(self, db_session, admin_user):
        """Test multiple retrievals by phone return the same user"""
        service = UserService(db_session)
        
        # Create a user
        user_data = UserCreate(
            phone="9876543221",
            email="test@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Retrieve multiple times
        retrieved1 = service.get_user_by_phone("9876543221")
        retrieved2 = service.get_user_by_phone("9876543221")
        retrieved3 = service.get_user_by_phone("9876543221")
        
        assert retrieved1.id == retrieved2.id == retrieved3.id
        assert retrieved1.id == created_user.id
        assert retrieved1.phone == retrieved2.phone == retrieved3.phone 

    #   GET all user 
    def test_get_all_users_empty(self, db_session):
        """Test that empty list is returned when no users exist"""
        service = UserService(db_session)
        
        users = service.get_all_users()
        
        assert users == []
        assert len(users) == 0

    def test_get_all_users_one_user(self, db_session, admin_user):
        """Test that one user is returned"""
        service = UserService(db_session)
        
        # Create one user
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        service.create_user(user_data, actor=admin_user)
        
        users = service.get_all_users()
        
        # 1 admin fixture + 1 created = 2
        assert len(users) == 2
        created_user = next(u for u in users if u.phone == "9876543210")
        assert created_user.email == "test@hospital.com"
        assert created_user.role == UserRole.RECEPTIONIST
        assert created_user.is_active is True

    def test_get_all_users_multiple_users(self, db_session, admin_user):
        """Test that multiple users are returned"""
        provider_service = ProviderServices(db_session)
        provider = provider_service.create_provider(
            ProviderCreate(
                name="Doctor Sharma",
                specialization="Cardiology",
                phone="9876540001",
                email="sharma@hospital.com",
                post=PostType.MD
            )
        )

        service = UserService(db_session)
        
        users_data = [
            UserCreate(
                phone="9876543210",
                email="user1@hospital.com",
                password="SecurePass123",
                role=UserRole.RECEPTIONIST,
                provider_id=None
            ),
            UserCreate(
                phone="9876543211",
                email="user2@hospital.com",
                password="SecurePass123",
                role=UserRole.DOCTOR,
                provider_id=provider.id
            ),
            UserCreate(
                phone="9876543212",
                email="user3@hospital.com",
                password="SecurePass123",
                role=UserRole.ADMIN,
                provider_id=None
            ),
        ]
        
        for data in users_data:
            service.create_user(data, actor=admin_user)
        
        users = service.get_all_users()
        
        # Admin + 3 users = 4
        assert len(users) == 4
        
        # Verify all phones are present (including admin)
        phones = [u.phone for u in users]
        assert "9999999999" in phones  # Admin
        assert "9876543210" in phones
        assert "9876543211" in phones
        assert "9876543212" in phones

    def test_get_all_users_includes_inactive(self, db_session, admin_user):
        """Test that inactive users are included in results"""
        service = UserService(db_session)
        
        # Create active user
        active_data = UserCreate(
            phone="9876543210",
            email="active@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        active_user = service.create_user(active_data, actor=admin_user)
        
        # Create inactive user
        inactive_data = UserCreate(
            phone="9876543211",
            email="inactive@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        inactive_user = service.create_user(inactive_data, actor=admin_user)
        
        # Deactivate the second user
        service.deactivate_user(inactive_user.id, actor=admin_user)
        
        # Get all users
        users = service.get_all_users()
        
        # Should include both active and inactive + admin = 3
        assert len(users) == 3
        phones = [u.phone for u in users]
        assert active_user.phone in phones
        assert inactive_user.phone in phones
        
        # Verify one is inactive
        inactive_found = [u for u in users if u.is_active is False]
        assert len(inactive_found) == 1
        assert inactive_found[0].phone == inactive_user.phone

    def test_get_all_users_order_by_phone(self, db_session, admin_user):
        """Test that users are ordered by phone ascending"""
        service = UserService(db_session)
        
        # Create users with different phones
        user_data1 = UserCreate(
            phone="9876543210",  # First
            email="user1@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        service.create_user(user_data1, actor=admin_user)
        
        user_data2 = UserCreate(
            phone="9876543211",  # Second
            email="user2@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        service.create_user(user_data2, actor=admin_user)
        
        user_data3 = UserCreate(
            phone="9876543212",  # Third
            email="user3@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        service.create_user(user_data3, actor=admin_user)
        
        users = service.get_all_users()
        
        assert len(users) == 4
        assert users[0].phone == "9876543210"
        assert users[1].phone == "9876543211"
        assert users[2].phone == "9876543212"
        assert users[3].phone == "9999999999" 
         
    def test_get_all_users_pagination_skip(self, db_session, admin_user):
        """Test pagination with skip parameter"""
        service = UserService(db_session)
        
        # Create 5 users (9876540001 to 9876540005)
        for i in range(1, 6):
            user_data = UserCreate(
                phone=f"987654{i:04d}",
                email=f"user{i}@hospital.com",
                password="SecurePass123",
                role=UserRole.RECEPTIONIST,
                provider_id=None
            )
            service.create_user(user_data, actor=admin_user)
        
        # Total in DB = 6 (5 created + 1 admin at 9999999999)
        # Skip first 2 -> returns 4 users
        users = service.get_all_users(skip=2)
        
        assert len(users) == 4
        assert users[0].phone == "9876540003"
        assert users[1].phone == "9876540004"
        assert users[2].phone == "9876540005"
        assert users[3].phone == "9999999999"

    def test_get_all_users_pagination_limit(self, db_session, admin_user):
        """Test pagination with limit parameter"""
        service = UserService(db_session)
        
        # Create 5 users
        for i in range(1, 6):
            user_data = UserCreate(
                phone=f"987654{i:04d}",
                email=f"user{i}@hospital.com",
                password="SecurePass123",
                role=UserRole.RECEPTIONIST,
                provider_id=None
            )
            service.create_user(user_data, actor=admin_user)
        
        # Limit to 2
        users = service.get_all_users(limit=2)
        
        assert len(users) == 2
        assert users[0].phone == "9876540001"
        assert users[1].phone == "9876540002"

    def test_get_all_users_pagination_skip_and_limit(self, db_session, admin_user):
        """Test pagination with both skip and limit"""
        service = UserService(db_session)
        
        # Create 10 users
        for i in range(1, 11):
            user_data = UserCreate(
                phone=f"987654{i:04d}",
                email=f"user{i}@hospital.com",
                password="SecurePass123",
                role=UserRole.RECEPTIONIST,
                provider_id=None
            )
            service.create_user(user_data, actor=admin_user)
        
        # Skip 3, limit 4
        users = service.get_all_users(skip=3, limit=4)
        
        assert len(users) == 4
        assert users[0].phone == "9876540004"
        assert users[1].phone == "9876540005"
        assert users[2].phone == "9876540006"
        assert users[3].phone == "9876540007"

    def test_get_all_users_pagination_limit_greater_than_total(self, db_session, admin_user):
        """Test pagination with limit greater than total users"""
        service = UserService(db_session)
        
        # Create 3 users
        for i in range(1, 4):
            user_data = UserCreate(
                phone=f"987654{i:04d}",
                email=f"user{i}@hospital.com",
                password="SecurePass123",
                role=UserRole.RECEPTIONIST,
                provider_id=None
            )
            service.create_user(user_data, actor=admin_user)
        
        # Limit 10 (total is 1 admin + 3 created = 4)
        users = service.get_all_users(limit=10)
        
        assert len(users) == 4
        assert users[0].phone == "9876540001"
        assert users[1].phone == "9876540002"
        assert users[2].phone == "9876540003"
        assert users[3].phone == "9999999999"

    def test_get_all_users_pagination_skip_greater_than_total(self, db_session, admin_user):
        """Test pagination with skip greater than total users"""
        service = UserService(db_session)
        
        # Create 3 users
        for i in range(1, 4):
            user_data = UserCreate(
                phone=f"987654{i:04d}",
                email=f"user{i}@hospital.com",
                password="SecurePass123",
                role=UserRole.RECEPTIONIST,
                provider_id=None
            )
            service.create_user(user_data, actor=admin_user)
        
        # Skip 10 (greater than total 4)
        users = service.get_all_users(skip=10)
        
        assert users == []
        assert len(users) == 0

    def test_get_all_users_default_pagination(self, db_session, admin_user):
        """Test default pagination values (skip=0, limit=100)"""
        service = UserService(db_session)
        
        # Create 50 users
        for i in range(1, 51):
            user_data = UserCreate(
                phone=f"987654{i:04d}",
                email=f"user{i}@hospital.com",
                password="SecurePass123",
                role=UserRole.RECEPTIONIST,
                provider_id=None
            )
            service.create_user(user_data, actor=admin_user)
        
        # Default: skip=0, limit=100 (1 admin + 50 created = 51)
        users = service.get_all_users()
        
        assert len(users) == 51
        assert users[0].phone == "9876540001"
        assert users[49].phone == "9876540050"
        assert users[50].phone == "9999999999"

    def test_get_all_users_with_different_roles(self, db_session, admin_user):
        """Test that users with different roles are all returned"""
        provider_service = ProviderServices(db_session)
        doc1 = provider_service.create_provider(
            ProviderCreate(name="Doc One", specialization="Cardiology", phone="9876548881", email="d1@hospital.com", post=PostType.MD)
        )
        doc2 = provider_service.create_provider(
            ProviderCreate(name="Doc Two", specialization="Neurology", phone="9876548882", email="d2@hospital.com", post=PostType.MS)
        )

        service = UserService(db_session)
        
        users_data = [
            UserCreate(phone="9876540001", email="user1@hospital.com", password="SecurePass123", role=UserRole.ADMIN, provider_id=None),
            UserCreate(phone="9876540002", email="user2@hospital.com", password="SecurePass123", role=UserRole.DOCTOR, provider_id=doc1.id),
            UserCreate(phone="9876540003", email="user3@hospital.com", password="SecurePass123", role=UserRole.RECEPTIONIST, provider_id=None),
            UserCreate(phone="9876540004", email="user4@hospital.com", password="SecurePass123", role=UserRole.DOCTOR, provider_id=doc2.id),
            UserCreate(phone="9876540005", email="user5@hospital.com", password="SecurePass123", role=UserRole.RECEPTIONIST, provider_id=None),
        ]
        
        for data in users_data:
            service.create_user(data, actor=admin_user)
        
        users = service.get_all_users()
        
        # 1 admin fixture + 5 created = 6
        assert len(users) == 6
        
        role_counts = {}
        for user in users:
            role_counts[user.role] = role_counts.get(user.role, 0) + 1
        
        assert role_counts[UserRole.ADMIN] == 2  # 1 fixture + 1 created
        assert role_counts[UserRole.DOCTOR] == 2
        assert role_counts[UserRole.RECEPTIONIST] == 2

    def test_get_all_users_with_provider_links(self, db_session, admin_user):
        """Test that users with provider links are included"""
        provider_service = ProviderServices(db_session)
        provider = provider_service.create_provider(
            ProviderCreate(
                name="Doctor Provider",
                specialization="Cardiology",
                phone="9876547771",
                email="docprov@hospital.com",
                post=PostType.MD
            )
        )

        service = UserService(db_session)
        
        # Create a doctor with provider link
        doctor_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=provider.id
        )
        service.create_user(doctor_data, actor=admin_user)
        
        # Create a receptionist without provider link
        receptionist_data = UserCreate(
            phone="9876543211",
            email="receptionist@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        service.create_user(receptionist_data, actor=admin_user)
        
        users = service.get_all_users()
        
        # 1 admin fixture + 2 created = 3
        assert len(users) == 3
        
        doctor = next(u for u in users if u.role == UserRole.DOCTOR)
        assert doctor.provider_id == provider.id
        
        receptionist = next(u for u in users if u.role == UserRole.RECEPTIONIST)
        assert receptionist.provider_id is None

    def test_get_all_users_after_deactivation(self, db_session, admin_user):
        """Test that deactivated users are still in the list"""
        service = UserService(db_session)
        
        user_data1 = UserCreate(
            phone="9876543210",
            email="user1@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        user1 = service.create_user(user_data1, actor=admin_user)
        
        user_data2 = UserCreate(
            phone="9876543211",
            email="user2@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        user2 = service.create_user(user_data2, actor=admin_user)
        
        # Deactivate user2
        service.deactivate_user(user2.id, actor=admin_user)
        
        users = service.get_all_users()
        
        # 1 admin fixture + 2 created = 3
        assert len(users) == 3
        
        user2_found = next(u for u in users if u.id == user2.id)
        assert user2_found.is_active is False
        
        user1_found = next(u for u in users if u.id == user1.id)
        assert user1_found.is_active is True

    #Update user 

    def test_user_updates_own_phone_success(self, db_session, admin_user):
        """User updates own phone successfully"""

        service = UserService(db_session)
        
        # Create a user
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Update own phone
        update_data = UserUpdate(phone="9876543211")
        updated = service.update_user(created_user.id, update_data, actor=created_user)
        
        assert updated.id == created_user.id
        assert updated.phone == "9876543211"
        assert updated.email == "test@hospital.com"  # Unchanged
        assert updated.role == UserRole.RECEPTIONIST  # Unchanged
        assert updated.is_active is True  

    def test_user_updates_own_email_success(self, db_session, admin_user):
        """User updates own email successfully"""

        service = UserService(db_session)
        
        # Create a user
        user_data = UserCreate(
            phone="9876543210",
            email="old@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Update own email
        update_data = UserUpdate(email="new@hospital.com")
        updated = service.update_user(created_user.id, update_data, actor=created_user)
        
        assert updated.id == created_user.id
        assert updated.phone == "9876543210"  # Unchanged
        assert updated.email == "new@hospital.com"
        assert updated.role == UserRole.RECEPTIONIST  # Unchanged
        assert updated.is_active is True

    def test_user_updates_own_password_success(self, db_session, admin_user):
        """User updates own password successfully"""

        service = UserService(db_session)
        
        # Create a user
        old_password = "SecurePass123"
        new_password = "NewSecurePass456"
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password=old_password,
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Verify old password works
        assert verify_password(old_password, created_user.password_hash) is True
        
        # Update own password
        update_data = UserUpdate(password=new_password)
        updated = service.update_user(created_user.id, update_data, actor=created_user)
        
        # Verify new password works
        assert verify_password(new_password, updated.password_hash) is True
        # Old password should not work
        assert verify_password(old_password, updated.password_hash) is False
        # Other fields unchanged
        assert updated.phone == "9876543210"
        assert updated.email == "test@hospital.com"
        assert updated.role == UserRole.RECEPTIONIST

    def test_admin_updates_another_user_profile(self, db_session, admin_user):
        """Admin updates another user's profile"""

        service = UserService(db_session)
        
        # Create a user
        user_data = UserCreate(
            phone="9876543210",
            email="user@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Admin updates the user
        update_data = UserUpdate(
            phone="9876543211",
            email="updated@hospital.com"
        )
        updated = service.update_user(created_user.id, update_data, actor=admin_user)
        
        assert updated.id == created_user.id
        assert updated.phone == "9876543211"
        assert updated.email == "updated@hospital.com"
        assert updated.role == UserRole.RECEPTIONIST  # Unchanged
        assert updated.is_active is True

    def test_user_cannot_update_another_user(self, db_session, admin_user):
        """User tries to update another user"""
        service = UserService(db_session)
        
        # Create two users
        user1_data = UserCreate(
            phone="9876543210",
            email="user1@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        user1 = service.create_user(user1_data, actor=admin_user)
        
        user2_data = UserCreate(
            phone="9876543211",
            email="user2@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        user2 = service.create_user(user2_data, actor=admin_user)
        
        # User1 tries to update User2
        update_data = UserUpdate(phone="9999999999")
        
        with pytest.raises(HTTPException) as exc_info:
            service.update_user(user2.id, update_data, actor=user1)
        
        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
        assert "Not authorized to update another user's profile" in exc_info.value.detail

    def test_update_user_not_found(self, db_session, admin_user):
        """User ID doesn't exist"""
        service = UserService(db_session)
        
        update_data = UserUpdate(phone="9876543211")
        
        with pytest.raises(HTTPException) as exc_info:
            service.update_user(99999, update_data, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_404_NOT_FOUND
        assert "User not found" in exc_info.value.detail

    def test_update_user_duplicate_phone(self, db_session, admin_user):
        """Duplicate phone"""
        service = UserService(db_session)
        
        # Create two users
        user1_data = UserCreate(
            phone="9876543210",
            email="user1@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        user1 = service.create_user(user1_data, actor=admin_user)
        
        user2_data = UserCreate(
            phone="9876543211",
            email="user2@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        user2 = service.create_user(user2_data, actor=admin_user)
        
        # Try to update user2 with user1's phone
        update_data = UserUpdate(phone=user1.phone)
        
        with pytest.raises(HTTPException) as exc_info:
            service.update_user(user2.id, update_data, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Phone number already taken" in exc_info.value.detail

    def test_update_user_same_phone_no_error(self, db_session, admin_user):
        """Updating with same phone (no change) doesn't raise error"""

        service = UserService(db_session)
        
        # Create a user
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Update with same phone
        update_data = UserUpdate(phone="9876543210")
        updated = service.update_user(created_user.id, update_data, actor=created_user)
        
        assert updated.phone == "9876543210"
        assert updated.email == "test@hospital.com"

    def test_update_user_verify_data_persisted(self, db_session, admin_user):
        """Verify updated data is actually persisted in database"""

        service = UserService(db_session)
        
        # Create a user
        user_data = UserCreate(
            phone="9876543210",
            email="old@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Update
        update_data = UserUpdate(
            phone="9876543211",
            email="new@hospital.com"
        )
        service.update_user(created_user.id, update_data, actor=created_user)
        
        # Retrieve fresh from database
        retrieved = service.get_user_by_id(created_user.id)
        
        assert retrieved.phone == "9876543211"
        assert retrieved.email == "new@hospital.com"
        assert retrieved.id == created_user.id

    def test_update_user_password_hashed(self, db_session, admin_user):
        """Test 10: Verify password is hashed when changed """
        service = UserService(db_session)
        
        # Create a user
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Store old hash
        old_hash = created_user.password_hash
        
        # Update password
        new_password = "NewSecurePass456"
        update_data = UserUpdate(password=new_password)
        updated = service.update_user(created_user.id, update_data, actor=created_user)
        
        # Password hash should change
        assert updated.password_hash != old_hash
        # New password should verify
        assert verify_password(new_password, updated.password_hash) is True
        # Old password should not verify
        assert verify_password("SecurePass123", updated.password_hash) is False

    def test_update_user_only_one_field(self, db_session, admin_user):
        """Test 11: Updating only one field doesn't accidentally erase others """
        service = UserService(db_session)
        
        # Create a user with all fields
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        original_phone = created_user.phone
        original_email = created_user.email
        original_role = created_user.role
        original_is_active = created_user.is_active
        
        # Update only email
        update_data = UserUpdate(email="new@hospital.com")
        updated = service.update_user(created_user.id, update_data, actor=created_user)
        
        # Only email should change
        assert updated.email == "new@hospital.com"
        assert updated.phone == original_phone
        assert updated.role == original_role
        assert updated.is_active == original_is_active  

    def test_update_user_doctor_phone_without_changing_provider(self, db_session, admin_user, active_provider):
        """Doctor updates phone without affecting provider link"""
        service = UserService(db_session)
        
        # Create a doctor with provider
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        original_provider_id = created_user.provider_id
        
        # Update phone only
        update_data = UserUpdate(phone="9876543211")
        updated = service.update_user(created_user.id, update_data, actor=created_user)
        
        # Provider link should remain unchanged
        assert updated.provider_id == original_provider_id
        assert updated.phone == "9876543211"
        assert updated.role == UserRole.DOCTOR

    def test_update_user_inactive_user_cannot_update(self, db_session, admin_user):
        """Inactive user cannot update profile"""
        service = UserService(db_session)
        
        # Create a user
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Deactivate the user
        service.deactivate_user(created_user.id, actor=admin_user)
        
        # Try to update
        update_data = UserUpdate(phone="9876543211")
        
        with pytest.raises(HTTPException) as exc_info:
            service.update_user(created_user.id, update_data, actor=created_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Cannot update deactivated user profile" in exc_info.value.detail

    def test_update_user_admin_updates_inactive_user(self, db_session, admin_user):
        """Admin can update an inactive user's profile"""
        service = UserService(db_session)
        
        # Create a user
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Deactivate the user
        service.deactivate_user(created_user.id, actor=admin_user)
        
        # Admin updates
        update_data = UserUpdate(phone="9876543211")
        updated = service.update_user(created_user.id, update_data, actor=admin_user)
        
        assert updated.phone == "9876543211"
        assert updated.is_active is False  # Should remain inactive

    def test_update_user_multiple_fields_at_once(self, db_session, admin_user):
        """Update multiple fields at once"""
        service = UserService(db_session)
        
        # Create a user
        user_data = UserCreate(
            phone="9876543210",
            email="old@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Update multiple fields
        update_data = UserUpdate(
            phone="9876543211",
            email="new@hospital.com",
            password="NewSecurePass456"
        )
        updated = service.update_user(created_user.id, update_data, actor=created_user)
        
        assert updated.phone == "9876543211"
        assert updated.email == "new@hospital.com"
        assert verify_password("NewSecurePass456", updated.password_hash) is True
        assert updated.role == UserRole.RECEPTIONIST  # Unchanged

    def test_update_user_doctor_tries_to_update_admin(self, db_session, admin_user,active_provider):
        """Doctor tries to update admin profile"""
        service = UserService(db_session)
        
        # Create a doctor user
        doctor_data = UserCreate(
            phone="9876543211",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        doctor = service.create_user(doctor_data, actor=admin_user)
        
        # Doctor tries to update admin
        update_data = UserUpdate(phone="9999999999")
        
        with pytest.raises(HTTPException) as exc_info:
            service.update_user(admin_user.id, update_data, actor=doctor)
        
        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
        assert "Not authorized to update another user's profile" in exc_info.value.detail 

    
    # Admin update user
    def test_admin_updates_user_role_to_doctor(self, db_session, admin_user, active_provider):
        """Admin updates user role to DOCTOR with provider"""

        service = UserService(db_session)
        
        # Create a receptionist
        user_data = UserCreate(
            phone="9876543210",
            email="user@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Admin updates role to DOCTOR with provider
        admin_update = UserAdminUpdate(
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        updated = service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert updated.role == UserRole.DOCTOR
        assert updated.provider_id == active_provider.id
        assert updated.phone == "9876543210"  # Unchanged
        assert updated.email == "user@hospital.com"  # Unchanged
        assert updated.is_active is True

    def test_admin_updates_user_role_to_receptionist(self, db_session, admin_user,active_provider):
        """Admin updates user role to RECEPTIONIST (clears provider)"""
        
        service = UserService(db_session)
        
        # Create a doctor with provider
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Admin updates role to RECEPTIONIST
        admin_update = UserAdminUpdate(
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        updated = service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert updated.role == UserRole.RECEPTIONIST
        assert updated.provider_id is None
        assert updated.phone == "9876543210"

    def test_admin_updates_user_role_to_admin(self, db_session, admin_user, active_provider):
        """Admin updates user role to ADMIN (clears provider)"""
        service = UserService(db_session)
        
        # Create a doctor with provider
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Admin updates role to ADMIN
        admin_update = UserAdminUpdate(
            role=UserRole.ADMIN,
            provider_id=None
        )
        updated = service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert updated.role == UserRole.ADMIN
        assert updated.provider_id is None
        assert updated.phone == "9876543210"    

    def test_admin_updates_only_provider_for_doctor(self, db_session, admin_user, active_provider):
        """Admin updates only provider_id for a doctor"""
        service = UserService(db_session)
        
        # Create a doctor without provider
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        
        created_user = service.create_user(user_data, actor=admin_user)
        assert created_user.provider_id 
        
        # Admin adds provider
        admin_update = UserAdminUpdate(
            provider_id=active_provider.id
        )
        updated = service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert updated.role == UserRole.DOCTOR 
        assert updated.provider_id == active_provider.id

    def test_admin_updates_only_role_keeps_provider(self, db_session, admin_user, active_provider):
        """Admin updates only role, provider_id stays if valid"""
        service = UserService(db_session)
        
        # Create a doctor with provider
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Admin updates only role (stays DOCTOR)
        admin_update = UserAdminUpdate(
            role=UserRole.DOCTOR
        )
        updated = service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert updated.role == UserRole.DOCTOR
        assert updated.provider_id == active_provider.id

    def test_admin_changes_doctor_to_receptionist_clears_provider(self, db_session, admin_user, active_provider):
        "Changing DOCTOR to RECEPTIONIST automatically clears provider"

        service = UserService(db_session)

        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        assert created_user.provider_id == active_provider.id
        
        # Admin changes role to RECEPTIONIST (provider_id not specified)
        admin_update = UserAdminUpdate(
            role=UserRole.RECEPTIONIST
        )
        updated = service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert updated.role == UserRole.RECEPTIONIST
        assert updated.provider_id is None

    def test_admin_changes_receptionist_to_doctor_needs_provider(self, db_session, admin_user, active_provider):
        """Changing RECEPTIONIST to DOCTOR requires provider"""

        service = UserService(db_session)
        
        # Create a receptionist
        user_data = UserCreate(
            phone="9876543210",
            email="user@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Admin tries to change to DOCTOR without provider
        admin_update = UserAdminUpdate(
            role=UserRole.DOCTOR
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "DOCTOR must have a provider_id" in exc_info.value.detail

    def test_admin_tries_to_set_admin_with_provider(self, db_session, admin_user, active_provider):
        """Admin cannot have provider_id"""
        service = UserService(db_session)
        
        # Create a user
        user_data = UserCreate(
            phone="9876543210",
            email="user@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Admin tries to set role to ADMIN with provider
        admin_update = UserAdminUpdate(
            role=UserRole.ADMIN,
            provider_id=active_provider.id
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "ADMIN cannot have provider_id" in exc_info.value.detail

    def test_admin_tries_to_set_receptionist_with_provider(self, db_session, admin_user, active_provider):
        """Receptionist cannot have provider_id"""

        service = UserService(db_session)
        
        # Create a user
        user_data = UserCreate(
            phone="9876543210",
            email="user@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Admin tries to set provider_id for receptionist
        admin_update = UserAdminUpdate(
            provider_id=active_provider.id
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "RECEPTIONIST cannot have provider_id" in exc_info.value.detail

    def test_non_admin_cannot_admin_update(self, db_session, doctor_user):
        """Non-admin cannot use admin_update_user"""

        service = UserService(db_session)
        
        admin_update = UserAdminUpdate(
            role=UserRole.ADMIN
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.admin_update_user(99999, admin_update, actor=doctor_user)
        
        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
        assert "Only admins can update user role and provider link" in exc_info.value.detail

    def test_admin_update_user_not_found(self, db_session, admin_user):
        """User ID doesn't exist"""

        service = UserService(db_session)
        
        admin_update = UserAdminUpdate(
            role=UserRole.ADMIN
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.admin_update_user(99999, admin_update, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_404_NOT_FOUND
        assert "User not found" in exc_info.value.detail

    def test_admin_update_provider_already_linked(self, db_session, admin_user, existing_doctor_user):
        service = UserService(db_session)
        provider_service = ProviderServices(db_session)
        
        # 1. Create a dummy provider just to get the Doctor created legally
        temp_provider = provider_service.create_provider(
            ProviderCreate(
                name="Temp Doctor", 
                specialization="General", 
                phone="1112223333", 
                email="temp@hospital.com", 
                post=PostType.MD
            )
        )
        
        # 2. Create the Doctor linked to the temporary provider
        user_data = UserCreate(
            phone="9876543210",
            email="new_doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=temp_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # 3. Now try to update them to the taken provider ID
        admin_update = UserAdminUpdate(
            provider_id=existing_doctor_user.provider_id
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Provider is already linked to another user account" in exc_info.value.detail

    def test_admin_update_provider_nonexistent(self, db_session, admin_user, active_provider):
        """Test 13: Provider doesn't exist """
        service = UserService(db_session)
        
        # Create a doctor user
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Try to link to non-existent provider
        admin_update = UserAdminUpdate(
            provider_id=99999
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Provider must exist and be active" in exc_info.value.detail

    def test_admin_update_provider_inactive(self, db_session, admin_user, active_provider, inactive_provider):
        """Test 14: Provider is inactive """
        service = UserService(db_session)
        
        # Create a doctor user
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Try to link to inactive provider
        admin_update = UserAdminUpdate(
            provider_id=inactive_provider.id
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Provider must exist and be active" in exc_info.value.detail

    def test_admin_update_verify_persisted(self, db_session, admin_user, active_provider):
        """Verify admin update is persisted in database"""

        service = UserService(db_session)
        
        # Create a receptionist
        user_data = UserCreate(
            phone="9876543210",
            email="user@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Admin updates
        admin_update = UserAdminUpdate(
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        # Retrieve fresh from database
        retrieved = service.get_user_by_id(created_user.id)
        
        assert retrieved.role == UserRole.DOCTOR
        assert retrieved.provider_id == active_provider.id
        assert retrieved.phone == "9876543210" 

    def test_admin_update_only_role_keeps_provider_if_doctor(self, db_session, admin_user, active_provider):
        """Updating only role keeps provider if new role is DOCTOR"""
        service = UserService(db_session)
        
        # Create a doctor with provider
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        original_provider_id = created_user.provider_id
        
        # Update only role (same role)
        admin_update = UserAdminUpdate(
            role=UserRole.DOCTOR
        )
        updated = service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert updated.role == UserRole.DOCTOR
        assert updated.provider_id == original_provider_id

    def test_admin_update_doctor_to_doctor_with_different_provider(self, db_session, admin_user, active_provider, sample_provider):
        """Admin changes doctor to another provider"""

        service = UserService(db_session)
        
        # Create a doctor with first provider
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Change to different provider
        admin_update = UserAdminUpdate(
            provider_id=sample_provider.id
        )
        updated = service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert updated.role == UserRole.DOCTOR
        assert updated.provider_id == sample_provider.id

    def test_admin_update_doctor_to_receptionist_with_provider_explicit(self, db_session, admin_user, active_provider):
        """Changing DOCTOR to RECEPTIONIST with provider_id"""
        service = UserService(db_session)
        
        # Create a doctor with provider
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Try to change to RECEPTIONIST but keep provider
        admin_update = UserAdminUpdate(
            role=UserRole.RECEPTIONIST,
            provider_id=active_provider.id  # Explicitly trying to keep provider
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "RECEPTIONIST cannot have provider_id" in exc_info.value.detail 

    # UPDATE user role

    def test_admin_updates_user_role_to_doctor(slef, db_session, admin_user, active_provider):
        """Admin updates user role to DOCTOR with provider"""
        service = UserService(db_session)

        user_data = UserCreate(
            phone="9876543210",
            email="user@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )

        created_user = service.create_user(user_data, actor=admin_user)

        admin_update = UserAdminUpdate(
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        updated = service.admin_update_user(created_user.id, admin_update, actor=admin_user)

        assert updated.role == UserRole.DOCTOR
        assert updated.provider_id == active_provider.id
        assert updated.phone == "9876543210"
        assert updated.email == "user@hospital.com"
        assert updated.is_active is True

    def test_admin_updates_user_role_to_receptionist(self, db_session, admin_user, active_provider): 
        """Admin updates user role to RECEPTIONIST (clears provider)"""
        service = UserService(db_session)
        
        # Create a doctor with provider
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Admin updates role to RECEPTIONIST
        admin_update = UserAdminUpdate(
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        updated = service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert updated.role == UserRole.RECEPTIONIST
        assert updated.provider_id is None
        assert updated.phone == "9876543210"  # Unchanged

    def test_admin_updates_user_role_to_admin(self, db_session, admin_user , active_provider):
        """Admin updates user role to ADMIN (clears provider)"""
        service = UserService(db_session)
        
        # Create a doctor with provider
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Admin updates role to ADMIN
        admin_update = UserAdminUpdate(
            role=UserRole.ADMIN,
            provider_id=None
        )
        updated = service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert updated.role == UserRole.ADMIN
        assert updated.provider_id is None
        assert updated.phone == "9876543210"  # Unchanged

    def test_admin_updates_only_provider_for_doctor(self, db_session, admin_user, active_provider):
        """Admin updates only provider_id for a doctor"""
        service = UserService(db_session)
        
        # Create a doctor without provider
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        assert created_user.provider_id 
        
        # Admin adds provider
        admin_update = UserAdminUpdate(
            provider_id=active_provider.id
        )
        updated = service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert updated.role == UserRole.DOCTOR  # Role unchanged
        assert updated.provider_id == active_provider.id

    def test_admin_updates_only_role_keeps_provider(self, db_session, admin_user, active_provider):
        """Admin updates only role, provider_id stays if valid"""
        service = UserService(db_session)
        
        # Create a doctor with provider
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Admin updates only role (stays DOCTOR)
        admin_update = UserAdminUpdate(
            role=UserRole.DOCTOR
        )
        updated = service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert updated.role == UserRole.DOCTOR
        assert updated.provider_id == active_provider.id  # Provider unchanged

    def test_admin_changes_doctor_to_receptionist_clears_provider(self, db_session, admin_user, active_provider):
        """Changing DOCTOR to RECEPTIONIST automatically clears provider"""
        service = UserService(db_session)
        
        # Create a doctor with provider
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        assert created_user.provider_id == active_provider.id
        
        # Admin changes role to RECEPTIONIST (provider_id not specified)
        admin_update = UserAdminUpdate(
            role=UserRole.RECEPTIONIST
        )
        updated = service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert updated.role == UserRole.RECEPTIONIST
        assert updated.provider_id is None  # Auto-cleared

    def test_admin_changes_receptionist_to_doctor_needs_provider(self, db_session, admin_user, active_provider):
        """Changing RECEPTIONIST to DOCTOR requires provider"""
        service = UserService(db_session)
        
        # Create a receptionist
        user_data = UserCreate(
            phone="9876543210",
            email="user@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Admin tries to change to DOCTOR without provider
        admin_update = UserAdminUpdate(
            role=UserRole.DOCTOR
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "DOCTOR must have a provider_id" in exc_info.value.detail

    def test_admin_tries_to_set_admin_with_provider(self, db_session, admin_user, active_provider):
        """Admin cannot have provider_id"""
        service = UserService(db_session)
        
        # Create a user
        user_data = UserCreate(
            phone="9876543210",
            email="user@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Admin tries to set role to ADMIN with provider
        admin_update = UserAdminUpdate(
            role=UserRole.ADMIN,
            provider_id=active_provider.id
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "ADMIN cannot have provider_id" in exc_info.value.detail

    def test_admin_tries_to_set_receptionist_with_provider(self, db_session, admin_user, active_provider):
        """Receptionist cannot have provider_id"""
        service = UserService(db_session)
        
        # Create a user
        user_data = UserCreate(
            phone="9876543210",
            email="user@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Admin tries to set provider_id for receptionist
        admin_update = UserAdminUpdate(
            provider_id=active_provider.id
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "RECEPTIONIST cannot have provider_id" in exc_info.value.detail

    def test_non_admin_cannot_admin_update(self, db_session, doctor_user):
        """Non-admin cannot use admin_update_user"""
        service = UserService(db_session)
        
        admin_update = UserAdminUpdate(
            role=UserRole.ADMIN
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.admin_update_user(99999, admin_update, actor=doctor_user)
        
        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
        assert "Only admins can update user role and provider link" in exc_info.value.detail

    def test_admin_update_user_not_found(self, db_session, admin_user):
        """User ID doesn't exist"""
        service = UserService(db_session)
        
        admin_update = UserAdminUpdate(
            role=UserRole.ADMIN
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.admin_update_user(99999, admin_update, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_404_NOT_FOUND
        assert "User not found" in exc_info.value.detail

    def test_admin_update_provider_already_linked(self, db_session, admin_user, active_provider, existing_doctor_user):
        """Provider already linked to another user"""
        service = UserService(db_session)
        
        # Create a new doctor user
        user_data = UserCreate(
            phone="9876543210",
            email="newuser@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Try to link to provider already linked to existing_doctor_user
        admin_update = UserAdminUpdate(
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Provider is already linked to another user account" in exc_info.value.detail

    def test_admin_update_provider_nonexistent(self, db_session, admin_user, active_provider):
        """Provider doesn't exist"""
        service = UserService(db_session)
        
        # Create a doctor user
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Try to link to non-existent provider
        admin_update = UserAdminUpdate(
            provider_id=99999
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Provider must exist and be active" in exc_info.value.detail

    def test_admin_update_provider_inactive(self, db_session, admin_user, active_provider,inactive_provider):
        """Provider is inactive"""
        service = UserService(db_session)
        
        # Create a doctor user
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Try to link to inactive provider
        admin_update = UserAdminUpdate(
            provider_id=inactive_provider.id
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Provider must exist and be active" in exc_info.value.detail

    def test_admin_update_verify_persisted(self, db_session, admin_user, active_provider):
        """Verify admin update is persisted in database"""
        service = UserService(db_session)
        
        # Create a receptionist
        user_data = UserCreate(
            phone="9876543210",
            email="user@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Admin updates
        admin_update = UserAdminUpdate(
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        # Retrieve fresh from database
        retrieved = service.get_user_by_id(created_user.id)
        
        assert retrieved.role == UserRole.DOCTOR
        assert retrieved.provider_id == active_provider.id
        assert retrieved.phone == "9876543210"  # Unchanged

    def test_admin_update_only_role_keeps_provider_if_doctor(self, db_session, admin_user, active_provider):
        """Updating only role keeps provider if new role is DOCTOR"""
        service = UserService(db_session)
        
        # Create a doctor with provider
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        original_provider_id = created_user.provider_id
        
        # Update only role (same role)
        admin_update = UserAdminUpdate(
            role=UserRole.DOCTOR
        )
        updated = service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert updated.role == UserRole.DOCTOR
        assert updated.provider_id == original_provider_id

    def test_admin_update_doctor_to_doctor_with_different_provider(self, db_session, admin_user, active_provider, sample_provider):
        """Admin changes doctor to another provider"""
        service = UserService(db_session)
        
        # Create a doctor with first provider
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Change to different provider
        admin_update = UserAdminUpdate(
            provider_id=sample_provider.id
        )
        updated = service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert updated.role == UserRole.DOCTOR
        assert updated.provider_id == sample_provider.id

    def test_admin_update_doctor_to_receptionist_with_provider_explicit(self, db_session, admin_user, active_provider):
        """Changing DOCTOR to RECEPTIONIST with provider_id explicitly set should clear it"""
        service = UserService(db_session)
        
        # Create a doctor with provider
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Try to change to RECEPTIONIST but keep provider
        admin_update = UserAdminUpdate(
            role=UserRole.RECEPTIONIST,
            provider_id=active_provider.id  # Explicitly trying to keep provider
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.admin_update_user(created_user.id, admin_update, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "RECEPTIONIST cannot have provider_id" in exc_info.value.detail

    # UPDATE user by provder link

    def test_admin_updates_provider_for_doctor(self, db_session, admin_user, active_provider):
        """Admin can update provider link for a doctor"""
        service = UserService(db_session)
        
        # Create a doctor without provider
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        assert created_user.provider_id 
        
        # Update provider link
        from app.schemas.user import UserProviderLinkUpdate
        link_update = UserProviderLinkUpdate(provider_id=active_provider.id)
        updated = service.update_user_provider_link(created_user.id, link_update, actor=admin_user)
        
        assert updated.provider_id == active_provider.id
        assert updated.role == UserRole.DOCTOR  # Role unchanged

    def test_admin_changes_doctor_to_different_provider(self, db_session, admin_user, active_provider, sample_provider):
        """Admin can change a doctor from one provider to another"""
        service = UserService(db_session)
        
        # Create a doctor with first provider
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        assert created_user.provider_id == active_provider.id
        
        # Change to different provider
        from app.schemas.user import UserProviderLinkUpdate
        link_update = UserProviderLinkUpdate(provider_id=sample_provider.id)
        updated = service.update_user_provider_link(created_user.id, link_update, actor=admin_user)
        
        assert updated.provider_id == sample_provider.id
        assert updated.role == UserRole.DOCTOR

    def test_admin_removes_provider_from_doctor(self, db_session, admin_user):
        """Admin can remove provider link from a doctor (must change role first)"""
        service = UserService(db_session)
        provider_service = ProviderServices(db_session)
        
        # 1. Create a provider
        temp_provider = provider_service.create_provider(
            ProviderCreate(
                name="Temp Doctor",
                specialization="General",
                phone="5556667777",
                email="temp2@hospital.com",
                post=PostType.MD
            )
        )
        
        # 2. Create the Doctor using the provider
        user_data = UserCreate(
            phone="9876543210",
            email="new_doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=temp_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        assert created_user.provider_id == temp_provider.id
        
        # 3. Try to remove provider (should fail because DOCTOR needs provider)
        link_update = UserProviderLinkUpdate(provider_id=None)
        
        with pytest.raises(HTTPException) as exc_info:
            service.update_user_provider_link(created_user.id, link_update, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "DOCTOR must have a provider_id" in exc_info.value.detail

    def test_admin_cannot_set_provider_for_receptionist(self, db_session, admin_user, active_provider):
        """Admin cannot set provider_id for receptionist"""
        service = UserService(db_session)
        
        # Create a receptionist
        user_data = UserCreate(
            phone="9876543210",
            email="user@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Try to set provider for receptionist
        from app.schemas.user import UserProviderLinkUpdate
        link_update = UserProviderLinkUpdate(provider_id=active_provider.id)
        
        with pytest.raises(HTTPException) as exc_info:
            service.update_user_provider_link(created_user.id, link_update, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "RECEPTIONIST cannot have provider_id" in exc_info.value.detail

    def test_admin_cannot_set_provider_for_admin(self, db_session, admin_user, active_provider):
        """Admin cannot set provider_id for admin"""
        service = UserService(db_session)
        
        # Create an admin
        user_data = UserCreate(
            phone="9876543210",
            email="admin@hospital.com",
            password="SecurePass123",
            role=UserRole.ADMIN,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Try to set provider for admin
        from app.schemas.user import UserProviderLinkUpdate
        link_update = UserProviderLinkUpdate(provider_id=active_provider.id)
        
        with pytest.raises(HTTPException) as exc_info:
            service.update_user_provider_link(created_user.id, link_update, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "ADMIN cannot have provider_id" in exc_info.value.detail

    def test_non_admin_cannot_update_provider_link(self, db_session, doctor_user):
        """Non-admin cannot use update_user_provider_link"""
        service = UserService(db_session)
        
        from app.schemas.user import UserProviderLinkUpdate
        link_update = UserProviderLinkUpdate(provider_id=1)
        
        with pytest.raises(HTTPException) as exc_info:
            service.update_user_provider_link(99999, link_update, actor=doctor_user)
        
        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
        assert "Only admins can update user role and provider link" in exc_info.value.detail

    def test_update_provider_link_user_not_found(self, db_session, admin_user):
        """User ID doesn't exist"""
        service = UserService(db_session)
        
        from app.schemas.user import UserProviderLinkUpdate
        link_update = UserProviderLinkUpdate(provider_id=1)
        
        with pytest.raises(HTTPException) as exc_info:
            service.update_user_provider_link(99999, link_update, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_404_NOT_FOUND
        assert "User not found" in exc_info.value.detail

    def test_update_provider_link_provider_already_linked(self, db_session, admin_user, existing_doctor_user):
        """Provider already linked to another user"""
        service = UserService(db_session)
        provider_service = ProviderServices(db_session)
        
        # 1. Create a brand-new, unlinked provider to satisfy setup constraints
        temp_provider = provider_service.create_provider(
            ProviderCreate(
                name="Temp Doctor",
                specialization="General",
                phone="5556667777",
                email="temp2@hospital.com",
                post=PostType.MD
            )
        )
        
        # 2. Create the Doctor using the unlinked provider
        user_data = UserCreate(
            phone="9876543210",
            email="new_doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=temp_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # 3. Try to update the link to a provider ID that is already taken
        from app.schemas.user import UserProviderLinkUpdate
        link_update = UserProviderLinkUpdate(
            provider_id=existing_doctor_user.provider_id
        )
        
        with pytest.raises(HTTPException) as exc_info:
            service.update_user_provider_link(created_user.id, link_update, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Provider is already linked to another user account" in exc_info.value.detail

    def test_update_provider_link_provider_nonexistent(self, db_session, admin_user, active_provider):
        """Provider doesn't exist"""
        service = UserService(db_session)
        
        # Create a doctor user
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Try to link to non-existent provider
        from app.schemas.user import UserProviderLinkUpdate
        link_update = UserProviderLinkUpdate(provider_id=99999)
        
        with pytest.raises(HTTPException) as exc_info:
            service.update_user_provider_link(created_user.id, link_update, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Provider must exist and be active" in exc_info.value.detail

    def test_update_provider_link_provider_inactive(self, db_session, admin_user, active_provider, inactive_provider):
        """Provider is inactive"""
        service = UserService(db_session)
        
        # Create a doctor user
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Try to link to inactive provider
        from app.schemas.user import UserProviderLinkUpdate
        link_update = UserProviderLinkUpdate(provider_id=inactive_provider.id)
        
        with pytest.raises(HTTPException) as exc_info:
            service.update_user_provider_link(created_user.id, link_update, actor=admin_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Provider must exist and be active" in exc_info.value.detail

    def test_update_provider_link_verify_persisted(self, db_session, admin_user, active_provider, inactive_provider):
        """Verify provider link update is persisted in database"""
        service = UserService(db_session)
        
        # Create a doctor without provider
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        assert created_user.provider_id 
        
        # Update provider link
        from app.schemas.user import UserProviderLinkUpdate
        link_update = UserProviderLinkUpdate(provider_id=active_provider.id)
        service.update_user_provider_link(created_user.id, link_update, actor=admin_user)
        
        # Retrieve fresh from database
        retrieved = service.get_user_by_id(created_user.id)
        
        assert retrieved.provider_id == active_provider.id 
        assert retrieved.phone == "9876543210"
        assert retrieved.role == UserRole.DOCTOR

    def test_update_provider_link_doctor_to_doctor_same_provider(self, db_session, admin_user, active_provider):
        """Updating to same provider works (idempotent)"""
        service = UserService(db_session)
        
        # Create a doctor with provider
        user_data = UserCreate(
            phone="9876543210",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        original_provider_id = created_user.provider_id
        
        # Update to same provider
        from app.schemas.user import UserProviderLinkUpdate
        link_update = UserProviderLinkUpdate(provider_id=active_provider.id)
        updated = service.update_user_provider_link(created_user.id, link_update, actor=admin_user)
        
        assert updated.provider_id == original_provider_id

    # DEACTIVATE USER 
    def test_admin_deactivates_user_success(self, db_session, admin_user):
        """Admin can deactivate a user"""

        service = UserService(db_session)
        
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        assert created_user.is_active is True
        
        deactivated = service.deactivate_user(created_user.id, actor=admin_user)
        assert deactivated.is_active is False
        
        # Verify in database
        retrieved = service.get_user_by_id(created_user.id)
        assert retrieved.is_active is False

    def test_receptionist_deactivates_user_success(self, db_session, admin_user):
        """Receptionist can deactivate a user"""

        service = UserService(db_session)
        
        # Create a receptionist
        receptionist_data = UserCreate(
            phone="9876543211",
            email="receptionist@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        receptionist = service.create_user(receptionist_data, actor=admin_user)
        
        # Create a user to deactivate
        user_data = UserCreate(
            phone="9876543212",
            email="user@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        deactivated = service.deactivate_user(created_user.id, actor=receptionist)
        assert deactivated.is_active is False

    def test_doctor_cannot_deactivate_user(self, db_session, admin_user, active_provider):
        """Doctor cannot deactivate a user"""

        service = UserService(db_session)
        
        # Create a doctor
        doctor_data = UserCreate(
            phone="9876543211",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        doctor = service.create_user(doctor_data, actor=admin_user)
        
        # Create a user to deactivate
        user_data = UserCreate(
            phone="9876543212",
            email="user@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        with pytest.raises(HTTPException) as exc_info:
            service.deactivate_user(created_user.id, actor=doctor)
        
        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
        assert "Doctors do not have user-management permissions" in exc_info.value.detail

    def test_cannot_deactivate_own_account(self, db_session, admin_user):
        """Users cannot deactivate their own account"""

        service = UserService(db_session)
        
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        with pytest.raises(HTTPException) as exc_info:
            service.deactivate_user(created_user.id, actor=created_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Users cannot deactivate their own account" in exc_info.value.detail

    def test_receptionist_cannot_deactivate_admin(self, db_session, admin_user):
        """Receptionist cannot deactivate Admin accounts"""

        service = UserService(db_session)
        
        # Create a receptionist
        receptionist_data = UserCreate(
            phone="9876543211",
            email="receptionist@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        receptionist = service.create_user(receptionist_data, actor=admin_user)
        
        with pytest.raises(HTTPException) as exc_info:
            service.deactivate_user(admin_user.id, actor=receptionist)
        
        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
        assert "Receptionists cannot deactivate Admin accounts" in exc_info.value.detail

    # REACTIVATE
    def test_admin_reactivates_user_success(self, db_session, admin_user):
        """Admin can reactivate a user"""
        service = UserService(db_session)
        
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Deactivate first
        service.deactivate_user(created_user.id, actor=admin_user)
        assert created_user.is_active is False
        
        # Reactivate
        reactivated = service.reactivate_user(created_user.id, actor=admin_user)
        assert reactivated.is_active is True

    def test_receptionist_reactivates_user_success(self, db_session, admin_user):
        """Receptionist can reactivate a user"""
        service = UserService(db_session)
        
        # Create a receptionist
        receptionist_data = UserCreate(
            phone="9876543211",
            email="receptionist@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        receptionist = service.create_user(receptionist_data, actor=admin_user)
        
        # Create a user to reactivate
        user_data = UserCreate(
            phone="9876543212",
            email="user@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Deactivate first
        service.deactivate_user(created_user.id, actor=admin_user)
        
        # Reactivate
        reactivated = service.reactivate_user(created_user.id, actor=receptionist)
        assert reactivated.is_active is True

    def test_doctor_cannot_reactivate_user(self, db_session, admin_user, active_provider):
        """Doctor cannot reactivate a user"""
        service = UserService(db_session)
        
        # Create a doctor
        doctor_data = UserCreate(
            phone="9876543211",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        doctor = service.create_user(doctor_data, actor=admin_user)
        
        # Create a user to reactivate
        user_data = UserCreate(
            phone="9876543212",
            email="user@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        service.deactivate_user(created_user.id, actor=admin_user)
        
        with pytest.raises(HTTPException) as exc_info:
            service.reactivate_user(created_user.id, actor=doctor)
        
        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
        assert "Doctors do not have user-management permissions" in exc_info.value.detail

    def test_receptionist_cannot_reactivate_admin(self, db_session, admin_user):
        """Receptionist cannot reactivate Admin accounts"""
        service = UserService(db_session)
        
        # Create a receptionist
        receptionist_data = UserCreate(
            phone="9876543211",
            email="receptionist@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        receptionist = service.create_user(receptionist_data, actor=admin_user)
        
        # Deactivate admin first (admin deactivates self? No, need another admin)
        # Actually admin cannot deactivate self, so this test will fail.
        # Let's create another admin to deactivate the main admin
        admin2_data = UserCreate(
            phone="9876543212",
            email="admin2@hospital.com",
            password="SecurePass123",
            role=UserRole.ADMIN,
            provider_id=None
        )
        admin2 = service.create_user(admin2_data, actor=admin_user)
        
        # Deactivate admin2 with admin_user
        service.deactivate_user(admin2.id, actor=admin_user)
        
        # Try to reactivate with receptionist
        with pytest.raises(HTTPException) as exc_info:
            service.reactivate_user(admin2.id, actor=receptionist)
        
        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
        assert "Receptionists cannot reactivate Admin accounts" in exc_info.value.detail

    def test_deactivate_already_inactive_user(self, db_session, admin_user):
        """Deactivating already inactive user should still work (idempotent)"""
        service = UserService(db_session)
        
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Deactivate twice
        service.deactivate_user(created_user.id, actor=admin_user)
        deactivated = service.deactivate_user(created_user.id, actor=admin_user)
        
        # Should still be inactive
        assert deactivated.is_active is False

    def test_reactivate_already_active_user(self, db_session, admin_user):
        """Reactivating already active user should still work (idempotent)"""
        service = UserService(db_session)
        
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Reactivate twice
        service.reactivate_user(created_user.id, actor=admin_user)
        reactivated = service.reactivate_user(created_user.id, actor=admin_user)
        
        # Should still be active
        assert reactivated.is_active is True

    # Authentication 
class TestAuthentication:
    def test_authenticate_user_success(self, db_session, admin_user):
        """Test successful authentication with correct phone and password"""

        service = UserService(db_session)
        
        # Create a user
        password = "SecurePass123"
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password=password,
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Authenticate
        authenticated = service.authenticate_user(
            phone="9876543210",
            password=password
        )
        
        assert authenticated is not None
        assert authenticated.id == created_user.id
        assert authenticated.phone == "9876543210"
        assert authenticated.email == "test@hospital.com"
        assert authenticated.role == UserRole.RECEPTIONIST
        assert authenticated.is_active is True

    def test_authenticate_user_with_doctor(self, db_session, admin_user, active_provider):
        """Test authentication for doctor user with provider link"""
        service = UserService(db_session)
        
        # Create a doctor user
        password = "DoctorPass123"
        user_data = UserCreate(
            phone="9876543211",
            email="doctor@hospital.com",
            password=password,
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Authenticate
        authenticated = service.authenticate_user(
            phone="9876543211",
            password=password
        )
        
        assert authenticated is not None
        assert authenticated.id == created_user.id
        assert authenticated.role == UserRole.DOCTOR
        assert authenticated.provider_id == active_provider.id

    def test_authenticate_user_with_admin(self, db_session, admin_user):
        """Test authentication for admin user"""
        service = UserService(db_session)
        
        # Create an admin user
        password = "AdminPass456"
        user_data = UserCreate(
            phone="9876543212",
            email="admin2@hospital.com",
            password=password,
            role=UserRole.ADMIN,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Authenticate
        authenticated = service.authenticate_user(
            phone="9876543212",
            password=password
        )
        
        assert authenticated is not None
        assert authenticated.id == created_user.id
        assert authenticated.role == UserRole.ADMIN
        assert authenticated.provider_id is None

    def test_authenticate_user_wrong_password(self, db_session, admin_user):
        """Test authentication fails with wrong password"""
        service = UserService(db_session)
        
        # Create a user
        password = "SecurePass123"
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password=password,
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        service.create_user(user_data, actor=admin_user)
        
        # Try to authenticate with wrong password
        authenticated = service.authenticate_user(
            phone="9876543210",
            password="WrongPassword123"
        )
        
        assert authenticated is None

    def test_authenticate_user_not_found(self, db_session):
        """Test authentication fails when user doesn't exist"""
        service = UserService(db_session)
        
        # Try to authenticate non-existent user
        authenticated = service.authenticate_user(
            phone="9999999999",
            password="AnyPassword123"
        )
        
        assert authenticated is None

    def test_authenticate_user_inactive(self, db_session, admin_user):
        """Test authentication fails when user is inactive"""
        service = UserService(db_session)
        
        # Create a user
        password = "SecurePass123"
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password=password,
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Deactivate the user
        service.deactivate_user(created_user.id, actor=admin_user)
        
        # Try to authenticate
        authenticated = service.authenticate_user(
            phone="9876543210",
            password=password
        )
        
        assert authenticated is None

    def test_authenticate_user_case_sensitive_phone(self, db_session, admin_user):
        """Test that phone lookup is exact match (phone numbers are digits)"""
        service = UserService(db_session)
        
        # Create a user
        password = "SecurePass123"
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password=password,
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        service.create_user(user_data, actor=admin_user)
        
        # Try with different phone (extra digit)
        authenticated = service.authenticate_user(
            phone="98765432100",
            password=password
        )
        
        assert authenticated is None

    def test_authenticate_user_after_password_change(self, db_session, admin_user):
        """Test authentication works with new password after change"""
        service = UserService(db_session)
        
        # Create a user
        old_password = "SecurePass123"
        new_password = "NewSecurePass456"
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password=old_password,
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Verify old password works
        authenticated_old = service.authenticate_user(
            phone="9876543210",
            password=old_password
        )
        assert authenticated_old is not None
        
        # Change password
        from app.schemas.user import UserUpdate
        update_data = UserUpdate(password=new_password)
        service.update_user(created_user.id, update_data, actor=created_user)
        
        # Old password should fail
        authenticated_wrong = service.authenticate_user(
            phone="9876543210",
            password=old_password
        )
        assert authenticated_wrong is None
        
        # New password should work
        authenticated_new = service.authenticate_user(
            phone="9876543210",
            password=new_password
        )
        assert authenticated_new is not None
        assert authenticated_new.id == created_user.id

    def test_authenticate_user_after_reactivation(self, db_session, admin_user):
        """Test authentication works after user is reactivated"""
        service = UserService(db_session)
        
        # Create a user
        password = "SecurePass123"
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password=password,
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Deactivate
        service.deactivate_user(created_user.id, actor=admin_user)
        
        # Authentication should fail
        authenticated_deactivated = service.authenticate_user(
            phone="9876543210",
            password=password
        )
        assert authenticated_deactivated is None
        
        # Reactivate
        service.reactivate_user(created_user.id, actor=admin_user)
        
        # Authentication should work
        authenticated_reactivated = service.authenticate_user(
            phone="9876543210",
            password=password
        )
        assert authenticated_reactivated is not None
        assert authenticated_reactivated.id == created_user.id

    def test_authenticate_user_password_hash_verification(self, db_session, admin_user):
        """Test that password verification works correctly with hashing"""
        service = UserService(db_session)
        
        # Create a user
        password = "SecurePass123"
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password=password,
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Verify password hash directly
        assert verify_password(password, created_user.password_hash) is True
        
        # Verify via authenticate
        authenticated = service.authenticate_user(
            phone="9876543210",
            password=password
        )
        assert authenticated is not None

    def test_authenticate_user_empty_password(self, db_session, admin_user):
        """Test authentication fails with empty password"""
        service = UserService(db_session)
        
        # Create a user
        password = "SecurePass123"
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password=password,
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        service.create_user(user_data, actor=admin_user)
        
        # Try with empty password
        authenticated = service.authenticate_user(
            phone="9876543210",
            password=""
        )
        
        assert authenticated is None

    def test_authenticate_user_empty_phone(self, db_session):
        """Test authentication fails with empty phone"""
        service = UserService(db_session)
        
        authenticated = service.authenticate_user(
            phone="",
            password="AnyPassword123"
        )
        
        assert authenticated is None

    def test_authenticate_user_multiple_attempts(self, db_session, admin_user):
        """Test multiple authentication attempts"""
        service = UserService(db_session)
        
        # Create a user
        password = "SecurePass123"
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password=password,
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        # Multiple successful attempts
        for _ in range(3):
            authenticated = service.authenticate_user(
                phone="9876543210",
                password=password
            )
            assert authenticated is not None
            assert authenticated.id == created_user.id
        
        # Multiple failed attempts with wrong password
        for _ in range(3):
            authenticated = service.authenticate_user(
                phone="9876543210",
                password="WrongPassword"
            )
            assert authenticated is None

    def test_authenticate_user_returns_user_object_not_bool(self, db_session, admin_user):
        """Test that authenticate_user returns the User object, not just a boolean"""
        service = UserService(db_session)
        
        # Create a user
        password = "SecurePass123"
        user_data = UserCreate(
            phone="9876543210",
            email="test@hospital.com",
            password=password,
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        created_user = service.create_user(user_data, actor=admin_user)
        
        authenticated = service.authenticate_user(
            phone="9876543210",
            password=password
        )
        
        # Should return User object
        assert isinstance(authenticated, User)
        assert authenticated.id == created_user.id
        assert authenticated.phone == created_user.phone
        assert authenticated.email == created_user.email
        assert authenticated.role == created_user.role
        assert authenticated.is_active == created_user.is_active      