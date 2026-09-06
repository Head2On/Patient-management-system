from app.models.provider import Provider
from fastapi.testclient import TestClient
from fastapi import status
from app.models.user import User, UserRole
from app.schemas.user import UserCreate
from app.core.security import create_access_token, get_password_hash


class TestUserAPI:
    """User API endpoint tests"""

    # ============= HELPER FUNCTIONS =============
    
    def _get_admin_token(self, db_session):
        """Get admin user token for authentication"""
        admin = db_session.query(User).filter(User.role == UserRole.ADMIN).first()
        if not admin:
            # Create admin if doesn't exist
            admin = User(
                phone="9999999999",
                password_hash=get_password_hash("AdminPass123"),
                role=UserRole.ADMIN,
                is_active=True
            )
            db_session.add(admin)
            db_session.commit()
            db_session.refresh(admin)
        
        token = create_access_token(data={"sub": str(admin.id), "role": admin.role.value})
        return token

    def _get_doctor_token(self, db_session, *args, **kwargs):
        """Get doctor user token for authentication"""
        active_provider = kwargs.get("active_provider")
        if not active_provider:
            for arg in args:
                if isinstance(arg, Provider):
                    active_provider = arg
                    break
        if not active_provider:
            active_provider = db_session.query(Provider).filter(Provider.is_active == True).first()
        if not active_provider:
            active_provider = Provider(
                name="Dr. Test Doctor",
                doc_number="TD1234",
                phone="7777777777",
                email="testdoctor@hospital.com",
                specialization="Cardiology",
                post="MD",
                is_active=True
            )
            db_session.add(active_provider)
            db_session.commit()
            db_session.refresh(active_provider)

        doctor = db_session.query(User).filter(User.role == UserRole.DOCTOR).first()
        if not doctor:
            doctor = User(
                phone="8888888888",
                password_hash=get_password_hash("DoctorPass123"),
                role=UserRole.DOCTOR,
                provider_id=active_provider.id,
                is_active=True
            )
            db_session.add(doctor)
            db_session.commit()
            db_session.refresh(doctor)
        
        token = create_access_token(data={"sub": str(doctor.id), "role": doctor.role.value})
        return token, doctor

    def _get_receptionist_token(self, db_session, *args, **kwargs):
        """Get receptionist user token for authentication"""
        receptionist = db_session.query(User).filter(User.role == UserRole.RECEPTIONIST).first()
        if not receptionist:
            # Create receptionist if doesn't exist
            receptionist = User(
                phone="7777777777",
                password_hash=get_password_hash("ReceptionPass123"),
                role=UserRole.RECEPTIONIST,
                is_active=True
            )
            db_session.add(receptionist)
            db_session.commit()
            db_session.refresh(receptionist)
        
        token = create_access_token(data={"sub": str(receptionist.id), "role": receptionist.role.value})
        return token, receptionist

    def _get_auth_headers(self, token: str):
        """Get authorization headers"""
        return {"Authorization": f"Bearer {token}"}

    # ============= CREATE USER TESTS =============
    
    def test_create_user_success(self, client: TestClient, db_session):
        """Test: Admin creates a new user successfully"""
        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        response = client.post(
            "/api/v1/users",
            headers=headers,
            json={
                "phone": "9876543210",
                "email": "test@hospital.com",
                "password": "SecurePass123",
                "role": "RECEPTIONIST",
                "provider_id":None
            }
        )
        
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["phone"] == "9876543210"
        assert data["email"] == "test@hospital.com"
        assert data["role"] == "RECEPTIONIST"
        assert data["provider_id"] is None
        assert data["is_active"] is True
        assert "id" in data
        assert "created_at" in data

    def test_create_user_doctor_with_provider(self, client: TestClient, db_session, active_provider):
        """Test: Admin creates a doctor with provider link"""
        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        response = client.post(
            "/api/v1/users",
            headers=headers,
            json={
                "phone": "9876543211",
                "email": "doctor@hospital.com",
                "password": "SecurePass123",
                "role": "DOCTOR",
                "provider_id": active_provider.id
            }
        )
        
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["phone"] == "9876543211"
        assert data["role"] == "DOCTOR"
        assert data["provider_id"] == active_provider.id

    def test_create_user_non_admin_fails(self, client: TestClient, db_session, active_provider):
        """Test: Non-admin cannot create user"""
        token, doctor = self._get_doctor_token(db_session, active_provider)
        headers = self._get_auth_headers(token)
        
        response = client.post(
            "/api/v1/users",
            headers=headers,
            json={
                "phone": "9876543212",
                "email": "test@hospital.com",
                "password": "SecurePass123",
                "role": "RECEPTIONIST",
                "provider_id": None
            }
        )
        
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "Not enough permissions" in response.json()["detail"]

    def test_create_user_duplicate_phone_fails(self, client: TestClient, db_session, existing_user):
        """Test: Duplicate phone number fails"""
        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        response = client.post(
            "/api/v1/users",
            headers=headers,
            json={
                "phone": existing_user.phone,
                "email": "new@hospital.com",
                "password": "SecurePass123",
                "role": "RECEPTIONIST",
                "provider_id": None
            }
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Phone number already registered" in response.json()["detail"]

    def test_create_user_doctor_without_provider_fails(self, client: TestClient, db_session):
        """Test: Doctor without provider_id fails schema validation (422)"""
        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        response = client.post(
            "/api/v1/users",
            headers=headers,
            json={
                "phone": "9876543213",
                "email": "doctor@hospital.com",
                "password": "SecurePass123",
                "role": "DOCTOR"
            }
        )
        
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_create_user_doctor_already_linked_provider_fails(self, client: TestClient, db_session, existing_doctor_user, active_provider):
        """Test: Doctor with already linked provider fails (400)"""
        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        response = client.post(
            "/api/v1/users",
            headers=headers,
            json={
                "phone": "9876543299",
                "email": "doctor2@hospital.com",
                "password": "SecurePass123",
                "role": "DOCTOR",
                "provider_id": active_provider.id
            }
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "already linked" in response.json()["detail"]

    def test_create_user_doctor_nonexistent_provider_fails(self, client: TestClient, db_session):
        """Test: Doctor with non-existent provider fails (400)"""

        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        response = client.post(
            "/api/v1/users",
            headers=headers,
            json={
                "phone": "9876543213",
                "email": "doctor@hospital.com",
                "password": "SecurePass123",
                "role": "DOCTOR",
                "provider_id": 99999
            }
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Provider must exist and be active" in response.json()["detail"]

    def test_create_user_admin_with_provider_fails(self, client: TestClient, db_session, admin_user, active_provider):
        """Test: Admin cannot have provider_id fails validation (422)"""
        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        response = client.post(
            "/api/v1/users/",
            headers=headers,
            json={
                "phone": "9876543214",
                "email": "admin@hospital.com",
                "password": "SecurePass123",
                "role": "ADMIN",
                "provider_id": active_provider.id
            }
        )
        
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    # ============= GET CURRENT USER PROFILE TESTS =============
    
    def test_get_current_user_profile_success(self, client: TestClient, db_session, admin_user):
        """Test: Get current authenticated user profile"""
        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        response = client.get("/api/v1/users/me", headers=headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == admin_user.id
        assert data["phone"] == admin_user.phone
        assert data["role"] == admin_user.role.value

    def test_get_current_user_profile_unauthorized(self, client: TestClient):
        """Test: Unauthorized access to /me fails"""
        response = client.get("/api/v1/users/me")
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.json()["detail"] in ["Missing authorization header", "Invalid authentication credentials"]

    # ============= LOGIN TESTS =============
    
    def test_login_success(self, client: TestClient, db_session, admin_user):
        """Test: User logs in successfully with phone and password"""
        response = client.post(
            "/api/v1/users/login",
            json={
                "phone": admin_user.phone,
                "password": "AdminPass123"
            }
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["id"] == admin_user.id
        assert data["user"]["phone"] == admin_user.phone

    def test_login_wrong_password(self, client: TestClient, db_session, admin_user):
        """Test: Login fails with wrong password"""
        response = client.post(
            "/api/v1/users/login",
            json={
                "phone": admin_user.phone,
                "password": "WrongPassword123"
            }
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert "Invalid phone or password" in response.json()["detail"]

    def test_login_user_not_found(self, client: TestClient):
        """Test: Login fails for non-existent user"""
        response = client.post(
            "/api/v1/users/login",
            json={
                "phone": "9999999999",
                "password": "SomePass123"
            }
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert "Invalid phone or password" in response.json()["detail"]

    def test_login_inactive_user(self, client: TestClient, db_session, admin_user):
        """Test: Login fails for inactive user"""
        # Deactivate admin user
        admin_user.is_active = False
        db_session.commit()
        
        response = client.post(
            "/api/v1/users/login",
            json={
                "phone": admin_user.phone,
                "password": "AdminPass123"
            }
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert "Invalid phone or password" in response.json()["detail"]
        
        # Reactivate for other tests
        admin_user.is_active = True
        db_session.commit()

    # ============= GET USER BY ID TESTS =============
    
    def test_get_user_by_id_success(self, client: TestClient, db_session, admin_user):
        """Test: Get user by ID returns correct user"""
        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        response = client.get(f"/api/v1/users/{admin_user.id}", headers=headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == admin_user.id
        assert data["phone"] == admin_user.phone

    def test_get_user_by_id_not_found(self, client: TestClient, db_session, admin_user):
        """Test: Get non-existent user returns 404"""
        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        response = client.get("/api/v1/users/99999", headers=headers)
        
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "User not found" in response.json()["detail"]

    def test_get_user_by_id_unauthorized(self, client: TestClient, db_session, admin_user, active_provider):
        """Test: Doctor cannot view other users"""
        token, doctor = self._get_doctor_token(db_session, admin_user, active_provider)
        headers = self._get_auth_headers(token)
        
        # Try to view admin user
        response = client.get(f"/api/v1/users/{admin_user.id}", headers=headers)
        
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "Not authorized to view this user" in response.json()["detail"]

    def test_get_user_by_id_own_profile(self, client: TestClient, db_session, admin_user, active_provider):
        """Test: User can view own profile"""
        token, doctor = self._get_doctor_token(db_session, admin_user, active_provider)
        headers = self._get_auth_headers(token)
        
        response = client.get(f"/api/v1/users/{doctor.id}", headers=headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == doctor.id
        assert data["phone"] == doctor.phone

    # ============= GET USER BY PHONE TESTS =============
    
    def test_get_user_by_phone_success(self, client: TestClient, db_session, admin_user):
        """Test: Get user by phone returns correct user (Admin only)"""
        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        response = client.get(f"/api/v1/users/phone/{admin_user.phone}", headers=headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == admin_user.id
        assert data["phone"] == admin_user.phone

    def test_get_user_by_phone_not_found(self, client: TestClient, db_session, admin_user):
        """Test: Get non-existent phone returns 404"""
        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        response = client.get("/api/v1/users/phone/0000000000", headers=headers)
        
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "User not found" in response.json()["detail"]

    def test_get_user_by_phone_unauthorized(self, client: TestClient, db_session, admin_user, active_provider):
        """Test: Non-admin cannot get user by phone"""
        token, doctor = self._get_doctor_token(db_session, admin_user, active_provider)
        headers = self._get_auth_headers(token)
        
        response = client.get(f"/api/v1/users/phone/{admin_user.phone}", headers=headers)
        
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "Not enough permissions" in response.json()["detail"]

    # ============= LIST USERS TESTS =============
    
    def test_list_users_success(self, client: TestClient, db_session, admin_user):
        """Test: List all users returns paginated results (Admin only)"""
        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        response = client.get("/api/v1/users/", headers=headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1  # At least admin user

    def test_list_users_pagination(self, client: TestClient, db_session, admin_user):
        """Test: List users with pagination parameters"""
        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        response = client.get("/api/v1/users/?skip=0&limit=1", headers=headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1

    def test_list_users_unauthorized(self, client: TestClient, db_session, admin_user, active_provider):
        """Test: Non-admin cannot list all users"""
        token, doctor = self._get_doctor_token(db_session, admin_user, active_provider)
        headers = self._get_auth_headers(token)
        
        response = client.get("/api/v1/users/", headers=headers)
        
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "Not enough permissions" in response.json()["detail"]

    # ============= UPDATE USER TESTS =============
    
    def test_update_user_own_phone_success(self, client: TestClient, db_session, admin_user, active_provider):
        """Test: User updates own phone number"""
        token, doctor = self._get_doctor_token(db_session, admin_user, active_provider)
        headers = self._get_auth_headers(token)
        
        response = client.patch(
            f"/api/v1/users/{doctor.id}",
            headers=headers,
            json={"phone": "9876543299"}
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["phone"] == "9876543299"
        assert data["id"] == doctor.id

    def test_update_user_own_email_success(self, client: TestClient, db_session, admin_user, active_provider):
        """Test: User updates own email"""
        token, doctor = self._get_doctor_token(db_session, admin_user, active_provider)
        headers = self._get_auth_headers(token)
        
        response = client.patch(
            f"/api/v1/users/{doctor.id}",
            headers=headers,
            json={"email": "newemail@hospital.com"}
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["email"] == "newemail@hospital.com"

    def test_update_user_admin_updates_other(self, client: TestClient, db_session, admin_user, active_provider):
        """Test: Admin updates another user's profile"""
        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        # Create a user to update
        token2, doctor = self._get_doctor_token(db_session, admin_user, active_provider)
        
        response = client.patch(
            f"/api/v1/users/{doctor.id}",
            headers=headers,
            json={"phone": "9876543288"}
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["phone"] == "9876543288"
        assert data["id"] == doctor.id

    def test_update_user_unauthorized_tries_other(self, client: TestClient, db_session, admin_user, active_provider):
        """Test: User cannot update another user"""
        token, doctor = self._get_doctor_token(db_session, admin_user, active_provider)
        headers = self._get_auth_headers(token)
        
        # Try to update admin
        response = client.patch(
            f"/api/v1/users/{admin_user.id}",
            headers=headers,
            json={"phone": "9876543211"}
        )
        
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "Not authorized to update another user's profile" in response.json()["detail"]

    def test_update_user_not_found(self, client: TestClient, db_session, admin_user):
        """Test: Update non-existent user returns 404"""
        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        response = client.patch(
            "/api/v1/users/99999",
            headers=headers,
            json={"phone": "9876543211"}
        )
        
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "User not found" in response.json()["detail"]

    def test_update_user_duplicate_phone_fails(self, client: TestClient, db_session, admin_user):
        """Test: Updating to existing phone fails"""
        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        # Create two users
        from app.schemas.user import UserCreate
        from app.services.user import UserService
        service = UserService(db_session)
        
        user1 = User(
            phone="9876543210",
            password_hash=get_password_hash("Pass123"),
            role=UserRole.RECEPTIONIST,
            is_active=True
        )
        db_session.add(user1)
        
        user2 = User(
            phone="9876543211",
            password_hash=get_password_hash("Pass123"),
            role=UserRole.RECEPTIONIST,
            is_active=True
        )
        db_session.add(user2)
        db_session.commit()
        db_session.refresh(user1)
        db_session.refresh(user2)
        
        # Try to update user2 to user1's phone
        response = client.patch(
            f"/api/v1/users/{user2.id}",
            headers=headers,
            json={"phone": user1.phone}
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Phone number already taken" in response.json()["detail"]

    # ============= ADMIN UPDATE USER TESTS =============
    
    def test_admin_update_user_role_to_doctor(self, client: TestClient, db_session, admin_user, active_provider):
        """Test: Admin updates user role to DOCTOR with provider"""
        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        # Create a receptionist
        from app.services.user import UserService
        service = UserService(db_session)
        user_data = UserCreate(
            phone="9876543215",
            email="user@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        user = service.create_user(user_data, actor=admin_user)
        
        response = client.patch(
            f"/api/v1/users/{user.id}/admin",
            headers=headers,
            json={
                "role": "DOCTOR",
                "provider_id": active_provider.id
            }
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["role"] == "DOCTOR"
        assert data["provider_id"] == active_provider.id

    def test_admin_update_user_role_to_receptionist(self, client: TestClient, db_session, admin_user, active_provider):
        """Test: Admin updates DOCTOR to RECEPTIONIST (clears provider)"""
        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        # Create a doctor
        from app.services.user import UserService
        service = UserService(db_session)
        user_data = UserCreate(
            phone="9876543216",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        user = service.create_user(user_data, actor=admin_user)
        
        response = client.patch(
            f"/api/v1/users/{user.id}/admin",
            headers=headers,
            json={"role": "RECEPTIONIST"}
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["role"] == "RECEPTIONIST"
        assert data["provider_id"] is None

    def test_admin_update_user_role_to_admin(self, client: TestClient, db_session, admin_user, active_provider):
        """Test: Admin updates user to ADMIN (clears provider)"""
        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        # Create a doctor
        from app.services.user import UserService
        service = UserService(db_session)
        user_data = UserCreate(
            phone="9876543217",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        user = service.create_user(user_data, actor=admin_user)
        
        response = client.patch(
            f"/api/v1/users/{user.id}/admin",
            headers=headers,
            json={"role": "ADMIN"}
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["role"] == "ADMIN"
        assert data["provider_id"] is None

    def test_non_admin_cannot_admin_update(self, client: TestClient, db_session, admin_user, active_provider):
        """Test: Non-admin cannot use admin update"""
        token, doctor = self._get_doctor_token(db_session, admin_user, active_provider)
        headers = self._get_auth_headers(token)
        
        response = client.patch(
            f"/api/v1/users/{admin_user.id}/admin",
            headers=headers,
            json={"role": "DOCTOR"}
        )
        
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "Not enough permissions" in response.json()["detail"]

    # ============= UPDATE ROLE ONLY TESTS =============
    
    def test_update_role_only_success(self, client: TestClient, db_session, admin_user, active_provider):
        """Test: Admin updates user role only"""
        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        # Create a receptionist
        from app.services.user import UserService
        service = UserService(db_session)
        user_data = UserCreate(
            phone="9876543218",
            email="user@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        user = service.create_user(user_data, actor=admin_user)
        
        response = client.patch(
            f"/api/v1/users/{user.id}/role",
            headers=headers,
            json={"role": "DOCTOR"}
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        # Should fail because DOCTOR needs provider
        assert "DOCTOR must have a provider_id" in response.json()["detail"]

    # ============= UPDATE PROVIDER LINK TESTS =============
    
    def test_update_provider_link_success(self, client: TestClient, db_session, admin_user, active_provider, sample_provider):
        """Test: Admin updates provider link for doctor"""
        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        # Create a doctor with first provider
        from app.services.user import UserService
        service = UserService(db_session)
        user_data = UserCreate(
            phone="9876543219",
            email="doctor@hospital.com",
            password="SecurePass123",
            role=UserRole.DOCTOR,
            provider_id=active_provider.id
        )
        user = service.create_user(user_data, actor=admin_user)
        
        # Change to different provider
        response = client.patch(
            f"/api/v1/users/{user.id}/provider",
            headers=headers,
            json={"provider_id": sample_provider.id}
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["provider_id"] == sample_provider.id

    # ============= DEACTIVATE USER TESTS =============
    
    def test_admin_deactivates_user_success(self, client: TestClient, db_session, admin_user):
        """Test: Admin deactivates a user"""
        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        # Create a user
        from app.services.user import UserService
        service = UserService(db_session)
        user_data = UserCreate(
            phone="9876543220",
            email="user@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        user = service.create_user(user_data, actor=admin_user)
        
        response = client.delete(
            f"/api/v1/users/{user.id}/deactivate",
            headers=headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["is_active"] is False

    def test_receptionist_deactivates_user_success(self, client: TestClient, db_session, admin_user):
        """Test: Receptionist deactivates a user"""
        token, receptionist = self._get_receptionist_token(db_session, admin_user)
        headers = self._get_auth_headers(token)
        
        # Create a user
        from app.services.user import UserService
        service = UserService(db_session)
        user_data = UserCreate(
            phone="9876543221",
            email="user@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        user = service.create_user(user_data, actor=admin_user)
        
        response = client.delete(
            f"/api/v1/users/{user.id}/deactivate",
            headers=headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["is_active"] is False

    def test_doctor_cannot_deactivate_user(self, client: TestClient, db_session, admin_user, active_provider):
        """Test: Doctor cannot deactivate user"""
        token, doctor = self._get_doctor_token(db_session, admin_user, active_provider)
        headers = self._get_auth_headers(token)
        
        # Try to deactivate admin
        response = client.delete(
            f"/api/v1/users/{admin_user.id}/deactivate",
            headers=headers
        )
        
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert any(msg in response.json()["detail"] for msg in ["Not enough permissions", "Doctors do not have user-management permissions"])

    # ============= REACTIVATE USER TESTS =============
    
    def test_admin_reactivates_user_success(self, client: TestClient, db_session, admin_user):
        """Test: Admin reactivates a user"""
        token = self._get_admin_token(db_session)
        headers = self._get_auth_headers(token)
        
        # Create and deactivate a user
        from app.services.user import UserService
        service = UserService(db_session)
        user_data = UserCreate(
            phone="9876543222",
            email="user@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        user = service.create_user(user_data, actor=admin_user)
        service.deactivate_user(user.id, actor=admin_user)
        
        response = client.post(
            f"/api/v1/users/{user.id}/reactivate",
            headers=headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["is_active"] is True

    def test_receptionist_reactivates_user_success(self, client: TestClient, db_session, admin_user):
        """Test: Receptionist reactivates a user"""
        token, receptionist = self._get_receptionist_token(db_session, admin_user)
        headers = self._get_auth_headers(token)
        
        # Create and deactivate a user
        from app.services.user import UserService
        service = UserService(db_session)
        user_data = UserCreate(
            phone="9876543223",
            email="user@hospital.com",
            password="SecurePass123",
            role=UserRole.RECEPTIONIST,
            provider_id=None
        )
        user = service.create_user(user_data, actor=admin_user)
        service.deactivate_user(user.id, actor=admin_user)
        
        response = client.post(
            f"/api/v1/users/{user.id}/reactivate",
            headers=headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["is_active"] is True

    def test_receptionist_cannot_reactivate_admin(self, client: TestClient, db_session, admin_user):
        """Test: Receptionist cannot reactivate Admin"""
        token, receptionist = self._get_receptionist_token(db_session, admin_user)
        headers = self._get_auth_headers(token)
        
        # Create another admin and deactivate it
        from app.services.user import UserService
        service = UserService(db_session)
        admin2_data = UserCreate(
            phone="9876543224",
            email="admin2@hospital.com",
            password="SecurePass123",
            role=UserRole.ADMIN,
            provider_id=None
        )
        admin2 = service.create_user(admin2_data, actor=admin_user)
        service.deactivate_user(admin2.id, actor=admin_user)
        
        # Try to reactivate with receptionist
        response = client.post(
            f"/api/v1/users/{admin2.id}/reactivate",
            headers=headers
        )
        
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "Receptionists cannot reactivate Admin accounts" in response.json()["detail"]