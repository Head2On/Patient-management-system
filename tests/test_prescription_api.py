from datetime import datetime, timedelta, timezone, date
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.patient import Patient
from app.models.provider import Provider, PostType
from app.models.appointment import Appointment, AppointmentStatus
from app.models.user import User, UserRole
from app.models.prescription import Prescription
from app.core.security import create_access_token


@pytest.fixture
def api_setup(db_session: Session):
    # Patient
    patient = Patient(
        patient_number="PDC-222222",
        name="Rx Endpoint Patient",
        phone="9876543210",
        dob=date(1995, 3, 10),
        aadhaar="111122223333",
        gender="Female",
        address="200 Clinic Lane",
        chief_complaint="Severe migraine and nausea",
        is_active=True,
    )
    db_session.add(patient)
    db_session.commit()
    db_session.refresh(patient)

    # Provider 1 (Assigned)
    provider1 = Provider(
        doc_number="DR3003",
        name="Dr. Rajesh Sen",
        specialization="Neurology",
        phone="9988776655",
        post=PostType.MD,
        is_active=True,
    )
    db_session.add(provider1)
    db_session.commit()
    db_session.refresh(provider1)

    # Doctor 1 User
    doc1_user = User(
        phone="9988776655",
        password_hash="hash1",
        role=UserRole.DOCTOR,
        provider_id=provider1.id,
        is_active=True,
    )
    db_session.add(doc1_user)

    # Provider 2 (Unassigned)
    provider2 = Provider(
        doc_number="DR4004",
        name="Dr. Sneha Paul",
        specialization="Dermatology",
        phone="9988776656",
        post=PostType.MS,
        is_active=True,
    )
    db_session.add(provider2)
    db_session.commit()
    db_session.refresh(provider2)

    # Doctor 2 User
    doc2_user = User(
        phone="9988776656",
        password_hash="hash2",
        role=UserRole.DOCTOR,
        provider_id=provider2.id,
        is_active=True,
    )
    db_session.add(doc2_user)

    # Receptionist User
    recept_user = User(
        phone="8888777766",
        password_hash="hash3",
        role=UserRole.RECEPTIONIST,
        is_active=True,
    )
    db_session.add(recept_user)

    # Admin User
    admin_user = User(
        phone="9999888877",
        password_hash="hash4",
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(admin_user)
    db_session.commit()

    # Appointment assigned to Provider 1
    start_time = datetime.now(timezone.utc) + timedelta(hours=2)
    end_time = start_time + timedelta(minutes=30)
    appointment = Appointment(
        patient_id=patient.id,
        provider_id=provider1.id,
        start_time=start_time,
        end_time=end_time,
        status=AppointmentStatus.IN_PROGRESS.value,
        reason_for_visit="Migraine evaluation",
    )
    db_session.add(appointment)
    db_session.commit()
    db_session.refresh(appointment)

    # Auth Headers
    def get_headers(user: User):
        token = create_access_token(data={"sub": str(user.id), "role": user.role.value})
        return {"Authorization": f"Bearer {token}"}

    return {
        "patient": patient,
        "provider1": provider1,
        "provider2": provider2,
        "appointment": appointment,
        "doc1_headers": get_headers(doc1_user),
        "doc2_headers": get_headers(doc2_user),
        "recept_headers": get_headers(recept_user),
        "admin_headers": get_headers(admin_user),
    }


class TestPrescriptionAPI:
    def test_create_prescription_assigned_doctor_success(self, client: TestClient, api_setup):
        payload = {
            "appointment_id": api_setup["appointment"].id,
            "diagnosis": "Acute Migraine with Aura",
            "symptoms": "Throbbing unilateral headache, photophobia, nausea",
            "vitals": {
                "blood_pressure": "118/78",
                "pulse": 72,
                "temperature": "98.4 F",
                "weight": "62 kg",
                "spo2": 99,
            },
            "medications": [
                {
                    "name": "Sumatriptan 50mg",
                    "dosage": "1 tablet",
                    "frequency": "SOS",
                    "duration": "At onset of headache",
                    "instructions": "Max 2 tabs in 24 hours",
                },
                {
                    "name": "Domperidone 10mg",
                    "dosage": "1 tablet",
                    "frequency": "1-0-0",
                    "duration": "3 days",
                    "instructions": "Before breakfast",
                },
            ],
            "advice": "Rest in a quiet, dark room. Maintain hydration.",
            "follow_up_date": "2026-11-20",
        }

        res = client.post("/api/v1/prescriptions/", json=payload, headers=api_setup["doc1_headers"])
        assert res.status_code == 201
        data = res.json()
        assert data["id"] is not None
        assert data["diagnosis"] == "Acute Migraine with Aura"
        assert len(data["medications"]) == 2
        assert data["patient"]["name"] == "Rx Endpoint Patient"
        assert data["provider"]["doc_number"] == "DR3003"

    def test_create_prescription_receptionist_blocked(self, client: TestClient, api_setup):
        payload = {
            "appointment_id": api_setup["appointment"].id,
            "diagnosis": "General Checkup",
            "medications": [{"name": "Med A", "dosage": "1", "frequency": "1-0-0", "duration": "3d"}],
        }

        res = client.post("/api/v1/prescriptions/", json=payload, headers=api_setup["recept_headers"])
        assert res.status_code == 403
        assert "only doctors" in res.json()["detail"].lower()

    def test_create_prescription_unassigned_doctor_blocked(self, client: TestClient, api_setup):
        payload = {
            "appointment_id": api_setup["appointment"].id,
            "diagnosis": "General Checkup",
            "medications": [{"name": "Med A", "dosage": "1", "frequency": "1-0-0", "duration": "3d"}],
        }

        res = client.post("/api/v1/prescriptions/", json=payload, headers=api_setup["doc2_headers"])
        assert res.status_code == 403
        assert "assigned" in res.json()["detail"].lower()

    def test_create_prescription_duplicate_conflict(self, client: TestClient, api_setup):
        payload = {
            "appointment_id": api_setup["appointment"].id,
            "diagnosis": "Diagnosis 1",
            "medications": [{"name": "Med A", "dosage": "1", "frequency": "1-0-0", "duration": "3d"}],
        }

        res1 = client.post("/api/v1/prescriptions/", json=payload, headers=api_setup["doc1_headers"])
        assert res1.status_code == 201

        res2 = client.post("/api/v1/prescriptions/", json=payload, headers=api_setup["doc1_headers"])
        assert res2.status_code == 409
        assert "already exists" in res2.json()["detail"].lower()

    def test_get_prescription_endpoints(self, client: TestClient, api_setup):
        # Create Rx first
        payload = {
            "appointment_id": api_setup["appointment"].id,
            "diagnosis": "Tension Headache",
            "medications": [{"name": "Paracetamol 650mg", "dosage": "1 tab", "frequency": "1-0-1", "duration": "3d"}],
        }
        create_res = client.post("/api/v1/prescriptions/", json=payload, headers=api_setup["doc1_headers"])
        rx_id = create_res.json()["id"]

        # 1. GET by ID (accessible by Receptionist as well to print)
        get_res = client.get(f"/api/v1/prescriptions/{rx_id}", headers=api_setup["recept_headers"])
        assert get_res.status_code == 200
        assert get_res.json()["diagnosis"] == "Tension Headache"

        # 2. GET by Appointment ID
        appt_res = client.get(
            f"/api/v1/prescriptions/appointment/{api_setup['appointment'].id}",
            headers=api_setup["doc1_headers"],
        )
        assert appt_res.status_code == 200
        assert appt_res.json()["id"] == rx_id

        # 3. GET by Patient ID
        pat_res = client.get(
            f"/api/v1/prescriptions/patient/{api_setup['patient'].id}",
            headers=api_setup["admin_headers"],
        )
        assert pat_res.status_code == 200
        assert len(pat_res.json()) == 1
        assert pat_res.json()[0]["id"] == rx_id

    def test_update_prescription_rbac(self, client: TestClient, api_setup):
        payload = {
            "appointment_id": api_setup["appointment"].id,
            "diagnosis": "Initial",
            "medications": [{"name": "Med A", "dosage": "1", "frequency": "1-0-0", "duration": "3d"}],
        }
        rx_id = client.post("/api/v1/prescriptions/", json=payload, headers=api_setup["doc1_headers"]).json()["id"]

        # Doctor 2 blocked
        update_doc2 = client.patch(
            f"/api/v1/prescriptions/{rx_id}",
            json={"diagnosis": "Hacked"},
            headers=api_setup["doc2_headers"],
        )
        assert update_doc2.status_code == 403

        # Receptionist blocked
        update_recept = client.patch(
            f"/api/v1/prescriptions/{rx_id}",
            json={"diagnosis": "Receptionist Edit"},
            headers=api_setup["recept_headers"],
        )
        assert update_recept.status_code == 403

        # Assigned Doctor 1 succeeds
        update_doc1 = client.patch(
            f"/api/v1/prescriptions/{rx_id}",
            json={"diagnosis": "Doctor Updated Diagnosis"},
            headers=api_setup["doc1_headers"],
        )
        assert update_doc1.status_code == 200
        assert update_doc1.json()["diagnosis"] == "Doctor Updated Diagnosis"

    def test_delete_prescription_admin_only(self, client: TestClient, api_setup):
        payload = {
            "appointment_id": api_setup["appointment"].id,
            "diagnosis": "To Delete",
            "medications": [{"name": "Med A", "dosage": "1", "frequency": "1-0-0", "duration": "3d"}],
        }
        rx_id = client.post("/api/v1/prescriptions/", json=payload, headers=api_setup["doc1_headers"]).json()["id"]

        # Doctor cannot delete
        del_doc = client.delete(f"/api/v1/prescriptions/{rx_id}", headers=api_setup["doc1_headers"])
        assert del_doc.status_code == 403

        # Admin deletes successfully
        del_admin = client.delete(f"/api/v1/prescriptions/{rx_id}", headers=api_setup["admin_headers"])
        assert del_admin.status_code == 200
        assert del_admin.json()["message"] == "Prescription successfully deleted"
