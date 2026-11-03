from datetime import datetime, timedelta, timezone, date
import pytest
from sqlalchemy.orm import Session

from app.models.patient import Patient
from app.models.provider import Provider, PostType
from app.models.appointment import Appointment, AppointmentStatus
from app.models.user import User, UserRole
from app.models.prescription import Prescription
from app.schemas.prescription import (
    PrescriptionCreate,
    PrescriptionUpdate,
    MedicationItem,
    Vitals,
)
from app.services.prescription import PrescriptionService


@pytest.fixture
def test_setup(db_session: Session):
    # 1. Create Patient
    patient = Patient(
        patient_number="PDC-111111",
        name="Clinical Test Patient",
        phone="9876543210",
        dob=date(1992, 5, 20),
        aadhaar="999988887777",
        gender="Male",
        address="100 Hospital Road",
        chief_complaint="Chest congestion and cough",
        is_active=True,
    )
    db_session.add(patient)
    db_session.commit()
    db_session.refresh(patient)

    # 2. Create Provider
    provider = Provider(
        doc_number="DR1001",
        name="Dr. Somnath Chatterjee",
        specialization="Pulmonology",
        phone="9123456789",
        email="dr.somnath@caredesk.com",
        post=PostType.MD,
        is_active=True,
    )
    db_session.add(provider)
    db_session.commit()
    db_session.refresh(provider)

    # 3. Create Doctor User linked to Provider
    doctor_user = User(
        phone="9123456789",
        password_hash="fakehash123",
        role=UserRole.DOCTOR,
        provider_id=provider.id,
        is_active=True,
    )
    db_session.add(doctor_user)

    # 4. Create Another Doctor User (unassigned)
    other_provider = Provider(
        doc_number="DR2002",
        name="Dr. Ananya Roy",
        specialization="Cardiology",
        phone="9123456790",
        post=PostType.MD,
        is_active=True,
    )
    db_session.add(other_provider)
    db_session.commit()
    db_session.refresh(other_provider)

    other_doctor = User(
        phone="9123456790",
        password_hash="fakehash123",
        role=UserRole.DOCTOR,
        provider_id=other_provider.id,
        is_active=True,
    )
    db_session.add(other_doctor)

    # 5. Create Receptionist User
    receptionist_user = User(
        phone="8888888888",
        password_hash="fakehash123",
        role=UserRole.RECEPTIONIST,
        is_active=True,
    )
    db_session.add(receptionist_user)

    # 6. Create Admin User
    admin_user = User(
        phone="9999999999",
        password_hash="fakehash123",
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(admin_user)
    db_session.commit()

    # 7. Create In-Progress Appointment
    start_time = datetime.now(timezone.utc) + timedelta(hours=1)
    end_time = start_time + timedelta(minutes=30)
    appointment = Appointment(
        patient_id=patient.id,
        provider_id=provider.id,
        start_time=start_time,
        end_time=end_time,
        status=AppointmentStatus.IN_PROGRESS.value,
        reason_for_visit="Severe cough and fever",
    )
    db_session.add(appointment)
    db_session.commit()
    db_session.refresh(appointment)

    return {
        "patient": patient,
        "provider": provider,
        "doctor_user": doctor_user,
        "other_doctor": other_doctor,
        "receptionist_user": receptionist_user,
        "admin_user": admin_user,
        "appointment": appointment,
    }


class TestPrescriptionService:
    def test_create_prescription_success(self, db_session: Session, test_setup):
        service = PrescriptionService(db_session)
        data = PrescriptionCreate(
            appointment_id=test_setup["appointment"].id,
            diagnosis="Acute Bronchitis",
            symptoms="Persistent dry cough, wheezing, mild chest soreness",
            vitals=Vitals(
                blood_pressure="120/80",
                pulse=76,
                temperature="99.2 F",
                weight="72 kg",
                spo2=98,
            ),
            medications=[
                MedicationItem(
                    name="Azithromycin 500mg",
                    dosage="1 tablet",
                    frequency="1-0-0",
                    duration="3 days",
                    instructions="1 hour before lunch",
                ),
                MedicationItem(
                    name="Levocetirizine 5mg",
                    dosage="1 tablet",
                    frequency="0-0-1",
                    duration="5 days",
                    instructions="Bedtime with water",
                ),
            ],
            advice="Steam inhalation twice daily. Avoid cold beverages.",
            follow_up_date=date(2026, 11, 15),
        )

        rx = service.create_prescription(data, actor=test_setup["doctor_user"])

        assert rx.id is not None
        assert rx.diagnosis == "Acute Bronchitis"
        assert rx.patient_id == test_setup["patient"].id
        assert rx.provider_id == test_setup["provider"].id
        assert len(rx.medications) == 2
        assert rx.medications[0]["name"] == "Azithromycin 500mg"
        assert rx.vitals["blood_pressure"] == "120/80"
        assert rx.created_by_id == test_setup["doctor_user"].id

    def test_create_prescription_duplicate_fails(self, db_session: Session, test_setup):
        service = PrescriptionService(db_session)
        data = PrescriptionCreate(
            appointment_id=test_setup["appointment"].id,
            diagnosis="Bronchitis",
            medications=[MedicationItem(name="Med A", dosage="1", frequency="1-0-1", duration="5d")],
        )

        service.create_prescription(data, actor=test_setup["doctor_user"])

        with pytest.raises(ValueError, match="already exists"):
            service.create_prescription(data, actor=test_setup["doctor_user"])

    def test_create_prescription_unassigned_doctor_fails(self, db_session: Session, test_setup):
        service = PrescriptionService(db_session)
        data = PrescriptionCreate(
            appointment_id=test_setup["appointment"].id,
            diagnosis="Hypertension",
            medications=[MedicationItem(name="Amlodipine 5mg", dosage="1", frequency="1-0-0", duration="30d")],
        )

        with pytest.raises(ValueError, match="assigned"):
            service.create_prescription(data, actor=test_setup["other_doctor"])

    def test_create_prescription_receptionist_fails(self, db_session: Session, test_setup):
        service = PrescriptionService(db_session)
        data = PrescriptionCreate(
            appointment_id=test_setup["appointment"].id,
            diagnosis="General",
            medications=[MedicationItem(name="Paracetamol", dosage="1", frequency="1-0-1", duration="3d")],
        )

        with pytest.raises(ValueError, match="Only doctors"):
            service.create_prescription(data, actor=test_setup["receptionist_user"])

    def test_create_prescription_cancelled_appointment_fails(self, db_session: Session, test_setup):
        service = PrescriptionService(db_session)
        test_setup["appointment"].status = AppointmentStatus.CANCELLED.value
        db_session.commit()

        data = PrescriptionCreate(
            appointment_id=test_setup["appointment"].id,
            diagnosis="General",
            medications=[MedicationItem(name="Paracetamol", dosage="1", frequency="1-0-1", duration="3d")],
        )

        with pytest.raises(ValueError, match="cancelled"):
            service.create_prescription(data, actor=test_setup["doctor_user"])

    def test_get_by_id_and_appointment(self, db_session: Session, test_setup):
        service = PrescriptionService(db_session)
        data = PrescriptionCreate(
            appointment_id=test_setup["appointment"].id,
            diagnosis="Sinusitis",
            medications=[MedicationItem(name="Fluticasone Spray", dosage="2 puffs", frequency="1-0-1", duration="10d")],
        )
        created = service.create_prescription(data, actor=test_setup["doctor_user"])

        fetched_by_id = service.get_prescription_by_id(created.id)
        assert fetched_by_id is not None
        assert fetched_by_id.diagnosis == "Sinusitis"
        assert fetched_by_id.patient.name == "Clinical Test Patient"
        assert fetched_by_id.provider.name == "Dr. Somnath Chatterjee"

        fetched_by_appt = service.get_by_appointment_id(test_setup["appointment"].id)
        assert fetched_by_appt is not None
        assert fetched_by_appt.id == created.id

    def test_get_patient_prescriptions(self, db_session: Session, test_setup):
        service = PrescriptionService(db_session)
        data = PrescriptionCreate(
            appointment_id=test_setup["appointment"].id,
            diagnosis="Clinical Review",
            medications=[MedicationItem(name="Vitamin C", dosage="500mg", frequency="1-0-0", duration="15d")],
        )
        service.create_prescription(data, actor=test_setup["doctor_user"])

        history = service.get_patient_prescriptions(test_setup["patient"].id)
        assert len(history) == 1
        assert history[0].diagnosis == "Clinical Review"

    def test_update_prescription_doctor_success(self, db_session: Session, test_setup):
        service = PrescriptionService(db_session)
        data = PrescriptionCreate(
            appointment_id=test_setup["appointment"].id,
            diagnosis="Initial Diagnosis",
            medications=[MedicationItem(name="Med A", dosage="1", frequency="1-0-0", duration="3d")],
        )
        rx = service.create_prescription(data, actor=test_setup["doctor_user"])

        update_payload = PrescriptionUpdate(
            diagnosis="Refined Diagnosis",
            advice="Updated clinical advice",
        )
        updated = service.update_prescription(rx.id, update_payload, actor=test_setup["doctor_user"])
        assert updated.diagnosis == "Refined Diagnosis"
        assert updated.advice == "Updated clinical advice"
        assert updated.updated_by_id == test_setup["doctor_user"].id

    def test_update_prescription_unauthorized_fails(self, db_session: Session, test_setup):
        service = PrescriptionService(db_session)
        data = PrescriptionCreate(
            appointment_id=test_setup["appointment"].id,
            diagnosis="Initial Diagnosis",
            medications=[MedicationItem(name="Med A", dosage="1", frequency="1-0-0", duration="3d")],
        )
        rx = service.create_prescription(data, actor=test_setup["doctor_user"])

        update_payload = PrescriptionUpdate(diagnosis="Hacked Diagnosis")
        with pytest.raises(ValueError, match="Not authorized"):
            service.update_prescription(rx.id, update_payload, actor=test_setup["other_doctor"])

    def test_delete_prescription_admin_only(self, db_session: Session, test_setup):
        service = PrescriptionService(db_session)
        data = PrescriptionCreate(
            appointment_id=test_setup["appointment"].id,
            diagnosis="Temporary Rx",
            medications=[MedicationItem(name="Med A", dosage="1", frequency="1-0-0", duration="3d")],
        )
        rx = service.create_prescription(data, actor=test_setup["doctor_user"])

        with pytest.raises(ValueError, match="Only administrators"):
            service.delete_prescription(rx.id, actor=test_setup["doctor_user"])

        deleted = service.delete_prescription(rx.id, actor=test_setup["admin_user"])
        assert deleted is True
        assert service.get_prescription_by_id(rx.id) is None
