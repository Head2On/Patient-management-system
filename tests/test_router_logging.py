import logging
import pytest

from datetime import datetime, timedelta, timezone
from app.main import app
from app.models.patient import Patient
from app.models.user import User, UserRole
from app.core.security import get_password_hash, create_access_token


@pytest.fixture
def admin_headers(db_session):
    admin = db_session.query(User).filter(User.role == UserRole.ADMIN).first()
    if not admin:
        admin = User(
            phone="9999999999",
            password_hash=get_password_hash("AdminPass123"),
            role=UserRole.ADMIN,
            is_active=True,
        )
        db_session.add(admin)
        db_session.commit()
        db_session.refresh(admin)

    token = create_access_token(data={"sub": str(admin.id), "role": admin.role.value})
    return {"Authorization": f"Bearer {token}"}


class TestLoginLogging:

    def test_login_success_logs(self, client, db_session, disable_rate_limiter, caplog):
        db_session.query(User).delete()
        db_session.commit()
        admin = User(
            phone="9999999999",
            password_hash=get_password_hash("AdminPass123"),
            role=UserRole.ADMIN,
            is_active=True,
        )
        db_session.add(admin)
        db_session.commit()

        with caplog.at_level(logging.INFO, logger="app.api.routes.user"):
            response = client.post(
                "/api/v1/users/login",
                json={"phone": "9999999999", "password": "AdminPass123"},
            )

        assert response.status_code == 200
        assert "Login success" in caplog.text

    def test_login_failure_logs(self, client, disable_rate_limiter, caplog):
        with caplog.at_level(logging.WARNING, logger="app.api.routes.user"):
            response = client.post(
                "/api/v1/users/login",
                json={"phone": "1111111111", "password": "WrongPass123"},
            )

        assert response.status_code == 401
        assert "Login failed" in caplog.text


class TestUserCreationLogging:

    def test_create_user_success_logs(self, client, admin_headers, caplog):
        with caplog.at_level(logging.INFO, logger="app.api.routes.user"):
            response = client.post(
                "/api/v1/users/",
                headers=admin_headers,
                json={
                    "phone": "9876543210",
                    "email": "test@hospital.com",
                    "password": "SecurePass123",
                    "role": "RECEPTIONIST",
                    "provider_id": None,
                },
            )

        assert response.status_code == 201
        assert "User created" in caplog.text


class TestUnauthorizedLogging:

    def test_unauthorized_view_logs(self, client, db_session, caplog):
        from app.models.provider import Provider

        provider = Provider(
            doc_number="TD1234",
            name="Test Doctor",
            specialization="Cardiology",
            phone="7777777777",
            post="MD",
            is_active=True,
        )
        db_session.add(provider)
        db_session.commit()
        db_session.refresh(provider)

        doctor = User(
            phone="8888888888",
            password_hash=get_password_hash("DoctorPass123"),
            role=UserRole.DOCTOR,
            provider_id=provider.id,
            is_active=True,
        )
        db_session.add(doctor)
        db_session.commit()
        db_session.refresh(doctor)

        admin = db_session.query(User).filter(User.role == UserRole.ADMIN).first()
        if not admin:
            admin = User(
                phone="9999999999",
                password_hash=get_password_hash("AdminPass123"),
                role=UserRole.ADMIN,
                is_active=True,
            )
            db_session.add(admin)
            db_session.commit()
            db_session.refresh(admin)

        from app.core.security import create_access_token
        token = create_access_token(data={"sub": str(doctor.id), "role": doctor.role.value})
        headers = {"Authorization": f"Bearer {token}"}

        with caplog.at_level(logging.WARNING, logger="app.api.routes.user"):
            response = client.get(f"/api/v1/users/{admin.id}", headers=headers)

        assert response.status_code == 403
        assert "Unauthorized user view" in caplog.text


class TestPatientCreationLogging:

    def test_create_patient_success_logs(self, client, receptionist_auth_headers, caplog):
        payload = {
            "name": "Test Patient",
            "phone": "9876543210",
            "dob": "1990-01-15",
            "gender": "Male",
            "address": "123 Test Street",
            "chief_complaint": "Fever",
            "aadhaar": "123456789012",
        }

        with caplog.at_level(logging.INFO, logger="app.api.routes.patients"):
            response = client.post(
                "/api/v1/patients/",
                headers=receptionist_auth_headers,
                json=payload,
            )

        assert response.status_code == 201
        assert "Patient created" in caplog.text

    def test_create_patient_failure_logs(self, client, receptionist_auth_headers, caplog):
        payload = {
            "name": "Test Patient",
            "phone": "9876543210",
            "dob": "1990-01-15",
            "gender": "Male",
            "address": "123 Test Street",
            "chief_complaint": "Fever",
            "aadhaar": "123456789012",
        }

        client.post(
            "/api/v1/patients/",
            headers=receptionist_auth_headers,
            json=payload,
        )

        with caplog.at_level(logging.WARNING, logger="app.api.routes.patients"):
            response = client.post(
                "/api/v1/patients/",
                headers=receptionist_auth_headers,
                json=payload,
            )

        assert response.status_code == 400
        assert "Patient creation failed" in caplog.text


class TestPatientUpdateLogging:

    def test_update_patient_success_logs(self, client, receptionist_auth_headers, caplog):
        payload = {
            "name": "Test Patient",
            "phone": "9876543210",
            "dob": "1990-01-15",
            "gender": "Male",
            "address": "123 Test Street",
            "chief_complaint": "Fever",
            "aadhaar": "123456789012",
        }

        create_response = client.post(
            "/api/v1/patients/",
            headers=receptionist_auth_headers,
            json=payload,
        )
        patient_number = create_response.json()["patient_number"]

        with caplog.at_level(logging.INFO, logger="app.api.routes.patients"):
            response = client.patch(
                f"/api/v1/patients/{patient_number}",
                headers=receptionist_auth_headers,
                json={"chief_complaint": "Cough"},
            )

        assert response.status_code == 200
        assert "Patient updated" in caplog.text


class TestPatientDeactivationLogging:

    def test_deactivate_patient_success_logs(self, client, receptionist_auth_headers, caplog):
        payload = {
            "name": "Test Patient",
            "phone": "9876543210",
            "dob": "1990-01-15",
            "gender": "Male",
            "address": "123 Test Street",
            "chief_complaint": "Fever",
            "aadhaar": "123456789012",
        }

        create_response = client.post(
            "/api/v1/patients/",
            headers=receptionist_auth_headers,
            json=payload,
        )
        patient_number = create_response.json()["patient_number"]

        with caplog.at_level(logging.INFO, logger="app.api.routes.patients"):
            response = client.delete(
                f"/api/v1/patients/{patient_number}",
                headers=receptionist_auth_headers,
            )

        assert response.status_code == 200
        assert "Patient deactivated" in caplog.text


class TestProviderCreationLogging:

    def test_create_provider_success_logs(self, client, admin_headers, caplog):
        payload = {
            "name": "Aman Sharma",
            "specialization": "Cardiology",
            "phone": "9876500001",
            "email": "aman@hospital.com",
            "post": "MD",
        }

        with caplog.at_level(logging.INFO, logger="app.api.routes.provider"):
            response = client.post(
                "/api/v1/providers/",
                headers=admin_headers,
                json=payload,
            )

        assert response.status_code == 201
        assert "Provider created" in caplog.text

    def test_create_provider_failure_logs(self, client, admin_headers, caplog):
        payload = {
            "name": "Aman Sharma",
            "specialization": "Cardiology",
            "phone": "9876500002",
            "email": "aman@hospital.com",
            "post": "MD",
        }

        client.post(
            "/api/v1/providers/",
            headers=admin_headers,
            json=payload,
        )

        with caplog.at_level(logging.WARNING, logger="app.api.routes.provider"):
            response = client.post(
                "/api/v1/providers/",
                headers=admin_headers,
                json=payload,
            )

        assert response.status_code == 400
        assert "Provider creation failed" in caplog.text


class TestProviderUpdateLogging:

    def test_update_provider_success_logs(self, client, admin_headers, caplog):
        payload = {
            "name": "Aman Sharma",
            "specialization": "Cardiology",
            "phone": "9876500003",
            "email": "aman@hospital.com",
            "post": "MD",
        }

        create_response = client.post(
            "/api/v1/providers/",
            headers=admin_headers,
            json=payload,
        )
        doc_number = create_response.json()["doc_number"]

        with caplog.at_level(logging.INFO, logger="app.api.routes.provider"):
            response = client.put(
                f"/api/v1/providers/{doc_number}",
                headers=admin_headers,
                json={"specialization": "Interventional Cardiology"},
            )

        assert response.status_code == 200
        assert "Provider updated" in caplog.text


class TestProviderDeactivationLogging:

    def test_deactivate_provider_success_logs(self, client, admin_headers, caplog):
        payload = {
            "name": "Aman Sharma",
            "specialization": "Cardiology",
            "phone": "9876500004",
            "email": "aman@hospital.com",
            "post": "MD",
        }

        create_response = client.post(
            "/api/v1/providers/",
            headers=admin_headers,
            json=payload,
        )
        doc_number = create_response.json()["doc_number"]

        with caplog.at_level(logging.INFO, logger="app.api.routes.provider"):
            response = client.delete(
                f"/api/v1/providers/{doc_number}",
                headers=admin_headers,
            )

        assert response.status_code == 200
        assert "Provider deactivated" in caplog.text


class TestAppointmentCreationLogging:

    def test_create_appointment_success_logs(
        self, client, db_session, receptionist_auth_headers, admin_headers, caplog
    ):
        patient_payload = {
            "name": "Appt Patient",
            "phone": "9876511111",
            "dob": "1990-01-15",
            "gender": "Male",
            "address": "123 Test Street",
            "chief_complaint": "Fever",
            "aadhaar": "111222333444",
        }
        patient_response = client.post(
            "/api/v1/patients/",
            headers=receptionist_auth_headers,
            json=patient_payload,
        )
        patient_number = patient_response.json()["patient_number"]
        patient = (
            db_session.query(Patient)
            .filter(Patient.patient_number == patient_number)
            .first()
        )
        patient_id = patient.id

        provider_payload = {
            "name": "Appt Doctor",
            "specialization": "Cardiology",
            "phone": "9876522222",
            "email": "appt@hospital.com",
            "post": "MD",
        }
        provider_response = client.post(
            "/api/v1/providers/",
            headers=admin_headers,
            json=provider_payload,
        )
        provider_doc_number = provider_response.json()["doc_number"]

        start = datetime.now(timezone.utc) + timedelta(days=1)
        end = start + timedelta(hours=1)

        with caplog.at_level(logging.INFO, logger="app.api.routes.appointment"):
            response = client.post(
                "/api/v1/appointments/",
                headers=receptionist_auth_headers,
                json={
                    "patient_id": patient_id,
                    "provider_id": provider_doc_number,
                    "start_time": start.isoformat(),
                    "end_time": end.isoformat(),
                    "reason_for_visit": "Checkup",
                },
            )

        assert response.status_code == 201
        assert "Appointment created" in caplog.text

    def test_create_appointment_failure_logs(self, client, receptionist_auth_headers, caplog):
        start = datetime.now(timezone.utc) + timedelta(days=1)
        end = start + timedelta(hours=1)

        with caplog.at_level(logging.WARNING, logger="app.api.routes.appointment"):
            response = client.post(
                "/api/v1/appointments/",
                headers=receptionist_auth_headers,
                json={
                    "patient_id": 99999,
                    "provider_id": "DOC9999",
                    "start_time": start.isoformat(),
                    "end_time": end.isoformat(),
                    "reason_for_visit": "Checkup",
                },
            )

        assert response.status_code == 404
        assert "Appointment creation failed" in caplog.text


class TestAppointmentUpdateLogging:

    def test_update_appointment_success_logs(
        self, client, db_session, receptionist_auth_headers, admin_headers, caplog
    ):
        patient_payload = {
            "name": "Appt Upd Patient",
            "phone": "9876533333",
            "dob": "1990-01-15",
            "gender": "Male",
            "address": "123 Test Street",
            "chief_complaint": "Fever",
            "aadhaar": "555666777888",
        }
        patient_response = client.post(
            "/api/v1/patients/",
            headers=receptionist_auth_headers,
            json=patient_payload,
        )
        patient_number = patient_response.json()["patient_number"]
        patient = (
            db_session.query(Patient)
            .filter(Patient.patient_number == patient_number)
            .first()
        )
        patient_id = patient.id

        provider_payload = {
            "name": "Appt Upd Doctor",
            "specialization": "Cardiology",
            "phone": "9876544444",
            "email": "apptupd@hospital.com",
            "post": "MD",
        }
        provider_response = client.post(
            "/api/v1/providers/",
            headers=admin_headers,
            json=provider_payload,
        )
        provider_doc_number = provider_response.json()["doc_number"]

        start = datetime.now(timezone.utc) + timedelta(days=2)
        end = start + timedelta(hours=1)

        create_response = client.post(
            "/api/v1/appointments/",
            headers=receptionist_auth_headers,
            json={
                "patient_id": patient_id,
                "provider_id": provider_doc_number,
                "start_time": start.isoformat(),
                "end_time": end.isoformat(),
                "reason_for_visit": "Checkup",
            },
        )
        appointment_id = create_response.json()["id"]

        with caplog.at_level(logging.INFO, logger="app.api.routes.appointment"):
            response = client.patch(
                f"/api/v1/appointments/{appointment_id}",
                headers=receptionist_auth_headers,
                json={"reason_for_visit": "Follow up"},
            )

        assert response.status_code == 200
        assert "Appointment updated" in caplog.text