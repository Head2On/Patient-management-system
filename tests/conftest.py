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

from datetime import datetime, timedelta, timezone
from app.models.patient import Patient
from app.schemas.appointment import AppointmentCreate
from app.services.appointment import AppointmentServices


SQLALCHEMY_DATABASE_URL = settings.test_database_url
engine = create_engine(SQLALCHEMY_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="session", autouse=True)
def apply_migrations():
    alembic_cfg = Config("alembic.ini")
    command.upgrade(alembic_cfg, "head")
    yield
    command.downgrade(alembic_cfg, "base")

@pytest.fixture(autouse=True)
def db_session():
    # Create session
    db = TestingSessionLocal()
    
    # Clean all tables
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(table.delete())
    db.commit()
    
    # Override dependency
    def override_get_db():
        try:
            yield db
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    
    yield db
    
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
    """Create a sample active patient for testing"""
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
def sample_appointment_data(sample_patient):
    """Create sample appointment data"""
    start_time = datetime.now(timezone.utc) + timedelta(days=1)
    end_time = start_time + timedelta(hours=1)
    return AppointmentCreate(
        patient_id=sample_patient.id,
        start_time=start_time,
        end_time=end_time,
        reason_for_visit="Annual checkup",
        internal_notes="Patient is new"
    )

@pytest.fixture
def appointment_service(db_session):
    """Return AppointmentService instance"""
    return AppointmentServices(db_session)