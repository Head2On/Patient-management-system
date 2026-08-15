import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from alembic import command
from alembic.config import Config

from app.main import app
from app.db.database import get_db, Base
from app.core.config import settings


SQLALCHEMY_DATABASE_URL = settings.test_database_url
engine = create_engine(SQLALCHEMY_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def apply_migrations():
    
    alembic_cfg = Config("alembic.ini")
    command.upgrade(alembic_cfg, "head")
    yield
    command.downgrade(alembic_cfg, "base")


@pytest.fixture
def db_session():

    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)


    for table in reversed(Base.metadata.sorted_tables):
        connection.execute(table.delete())
    yield session
    
    session.close()
    transaction.rollback()
    connection.close()


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


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