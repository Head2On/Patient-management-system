# tests/test_patient_service.py
import sys
from pathlib import Path

# Add project root to Python path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from datetime import date
from sqlalchemy import text
from app.db.database import SessionLocal, engine
from app.schemas.patient import PatientCreate
from app.services.patient import register_patient

def test_register_patient():
    # Create PatientCreate with fresh test data
    patient_data = PatientCreate(
        name="John Doe",
        phone="9876543210",
        dob=date(1990, 1, 15),
        gender="Male",
        address="123 Main Street, City",
        chief_complaint="Fever and cough",
        aadhaar="9999-8888-7777"
    )

    db = SessionLocal()

    try:
        # Service returns PatientResponse (has patient_number, NO id)
        result = register_patient(db, patient_data)
        
        # ASSERT patient_number exists and is generated
        assert result.patient_number is not None
        assert result.patient_number.startswith("PDC-")
        
        # Verify in database by patient_number
        with engine.connect() as conn:
            db_row = conn.execute(
                text("SELECT id, patient_number, name, aadhaar FROM patients WHERE patient_number = :patient_number"),
                {"patient_number": result.patient_number}
            ).fetchone()
        
        assert db_row is not None
        assert db_row[1] == result.patient_number
        assert db_row[2] == result.name
        assert db_row[3] == patient_data.aadhaar
        
        print("All tests passed!")

    finally:
        db.close()

if __name__ == "__main__":
    test_register_patient()