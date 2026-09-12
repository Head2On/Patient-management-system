import os
os.environ["ALEMBIC_ENV"] = "test"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from alembic import command
from alembic.config import Config

from app.main import app
from app.db.database import get_db, Base
from app.core.config import settings
from app.core.security import get_password_hash
from app.core.rate_limiter import rate_limit_dependency

from datetime import datetime, timedelta, timezone
from app.models.patient import Patient
from app.schemas.appointment import AppointmentCreate
from app.services.appointment import AppointmentServices
from app.models.provider import Provider 
from app.models.user import User, UserRole
from app.core.security import get_password_hash, create_access_token



SQLALCHEMY_DATABASE_URL = settings.test_database_url
engine = create_engine(SQLALCHEMY_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture
def disable_rate_limiter():
    """Bypass rate limiter for user unit tests to prevent Redis event-loop clashes."""
    async def dummy_rate_limit():
        return {}
    
    app.dependency_overrides[rate_limit_dependency] = dummy_rate_limit
    yield
    app.dependency_overrides.pop(rate_limit_dependency, None)

@pytest.fixture(scope="session", autouse=True)
def apply_migrations():
    alembic_cfg = Config("alembic.ini")
    command.upgrade(alembic_cfg, "head")
    yield
    command.downgrade(alembic_cfg, "base")

@pytest.fixture(autouse=True)
def db_session():
    db = TestingSessionLocal()
    
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(table.delete())
    db.commit()
    
    def override_get_db():
        try:
            yield db
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    
    yield db
    
    db.rollback()
    db.close()
    app.dependency_overrides.pop(get_db, None)

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def sample_patient_data():
    return {
        "name": "Test Patient",
        "phone": "9876543210",
        "dob": "1990-01-15",
        "gender": "Male",
        "address": "123 Test Street",
        "chief_complaint": "Test complaint",
        "aadhaar": "123456789012"
    }


# ============= APPOINTMENT FIXTURES =============

@pytest.fixture
def sample_patient(db_session):
    patient_data = {
        "patient_number": "PDC-000001",
        "name": "Test Patient",
        "phone": "9876543210",
        "dob": datetime.now().date() - timedelta(days=365*25),
        "aadhaar": "123456789012",
        "gender": "Male",
        "address": "123 Test Street",
        "chief_complaint": "Test complaint",
        "is_active": True
    }
    patient = Patient(**patient_data)
    db_session.add(patient)
    db_session.commit()
    db_session.refresh(patient)
    return patient

@pytest.fixture
def sample_appointment_data(sample_patient, sample_provider):
    start_time = datetime.now(timezone.utc) + timedelta(days=1)
    end_time = start_time + timedelta(hours=1)
    return AppointmentCreate(
        patient_id=sample_patient.id,
        provider_id=sample_provider.doc_number,
        start_time=start_time,
        end_time=end_time,
        reason_for_visit="Annual checkup",
        internal_notes="Patient is new"
    )

@pytest.fixture
def appointment_service(db_session):
    return AppointmentServices(db_session)


# ============= PROVIDER FIXTURES =============

@pytest.fixture
def sample_provider(db_session):
    provider = Provider(
        doc_number="JD9876",
        name="John Doe",
        specialization="Cardiology",
        phone="9876543210",
        email="john@hospital.com",
        post="MD",
        is_active=True
    )
    db_session.add(provider)
    db_session.commit()
    db_session.refresh(provider)
    return provider

@pytest.fixture
def active_provider(db_session):
    """Create an active provider for user tests"""
    provider = Provider(
        name="Dr. Test Doctor",
        doc_number="TD1234",
        phone="7777777777",
        email="testdoctor@hospital.com",
        specialization="Cardiology",
        post="MD",
        is_active=True
    )
    db_session.add(provider)
    db_session.commit()
    db_session.refresh(provider)
    return provider

@pytest.fixture
def inactive_provider(db_session):
    """Create an inactive provider for user tests"""
    provider = Provider(
        name="Dr. Inactive Doctor",
        doc_number="ID1234",
        phone="6666666666",
        email="inactive@hospital.com",
        specialization="Neurology",
        post="MD",
        is_active=False
    )
    db_session.add(provider)
    db_session.commit()
    db_session.refresh(provider)
    return provider


# ============= USER FIXTURES =============

@pytest.fixture
def admin_user(db_session):
    user = User(
        phone="9999999999",
        password_hash=get_password_hash("AdminPass123"),
        role=UserRole.ADMIN,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture
def doctor_user(db_session):
    user = User(
        phone="8888888888",
        password_hash=get_password_hash("DoctorPass123"),
        role=UserRole.DOCTOR,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture
def receptionist_user(db_session):
    user = User(
        phone="7777777777",
        password_hash=get_password_hash("ReceptionPass123"),
        role=UserRole.RECEPTIONIST,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture
def existing_user(db_session):
    user = User(
        phone="5555555555",
        password_hash=get_password_hash("ExistingPass123"),
        role=UserRole.RECEPTIONIST,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture
def existing_doctor_user(db_session, active_provider):
    user = User(
        phone="4444444444",
        password_hash=get_password_hash("ExistingDoctorPass123"),
        role=UserRole.DOCTOR,
        provider_id=active_provider.id,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


# ============= AUTH TOKEN FIXTURES =============

@pytest.fixture
def auth_headers(admin_user):
    token = create_access_token(data={"sub": str(admin_user.id), "role": admin_user.role.value})
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
def receptionist_auth_headers(receptionist_user):
    token = create_access_token(data={"sub": str(receptionist_user.id), "role": receptionist_user.role.value})
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
def doctor_auth_headers(doctor_user):
    token = create_access_token(data={"sub": str(doctor_user.id), "role": doctor_user.role.value})
    return {"Authorization": f"Bearer {token}"}