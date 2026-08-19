from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional, List
from sqlalchemy.orm import Session
from datetime import timedelta, timezone, datetime
from app.db.database import get_db
from app.models.patient import Patient,Appointment
from fastapi.testclient import TestClient
from app.schemas.appointment import AppointmentCreate, AppointmentResponse
from app.services.appointment import AppointmentServices
from app.models.appointment import AppointmentStatus

router = APIRouter()  # ← This should exist


class TestAppointmentAPI:
    """Tests for Appointment API endpoints"""
    
    def test_create_appointment_success(self, client: TestClient, db_session: Session):
        """Test: POST /api/v1/appointments/ → 201 Created"""
        # 1. Create a patient first
        patient = Patient(
            patient_number="PDC-000001",
            name="Test Patient",
            phone="9876543210",
            dob=datetime.now().date() - timedelta(days=365*25),
            aadhaar="123456789012",
            gender="Male",
            address="123 Test Street",
            chief_complaint="Test complaint",
            is_active=True
        )
        db_session.add(patient)
        db_session.commit()
        db_session.refresh(patient)
        
        # 2. Prepare appointment data
        start_time = datetime.now(timezone.utc) + timedelta(days=1)
        end_time = start_time + timedelta(hours=1)
        
        appointment_data = {
            "patient_id": patient.id,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "reason_for_visit": "Annual checkup",
            "internal_notes": "Patient is new"
        }
        
        # 3. Make API request
        response = client.post("/api/v1/appointments/", json=appointment_data)
        
        # 4. Assertions
        assert response.status_code == 201
        data = response.json()
        assert data["id"] is not None
        assert data["patient_id"] == patient.id
        assert datetime.fromisoformat(data["start_time"]) == start_time
        assert datetime.fromisoformat(data["end_time"]) == end_time 
        assert data["status"] == AppointmentStatus.SCHEDULED.value
        assert data["reason_for_visit"] == "Annual checkup"
        assert data["internal_notes"] == "Patient is new"
        assert data["created_at"] is not None
        assert data["updated_at"] is not None
    
    def test_create_appointment_patient_not_found(self, client: TestClient):
        """Test: POST /api/v1/appointments/ with non-existent patient → 404"""
        start_time = datetime.now(timezone.utc) + timedelta(days=1)
        end_time = start_time + timedelta(hours=1)
        
        appointment_data = {
            "patient_id": 99999,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "reason_for_visit": "Annual checkup",
            "internal_notes": "Patient is new"
        }
        
        response = client.post("/api/v1/appointments/", json=appointment_data)
        
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()
    
    def test_create_appointment_inactive_patient(self, client: TestClient, db_session: Session):
        """Test: POST /api/v1/appointments/ with inactive patient → 404"""
        # 1. Create inactive patient
        patient = Patient(
            patient_number="PDC-000002",
            name="Inactive Patient",
            phone="1234567890",
            dob=datetime.now().date() - timedelta(days=365*25),
            aadhaar="987654321098",
            gender="Female",
            address="456 Test Street",
            chief_complaint="Test complaint",
            is_active=False
        )
        db_session.add(patient)
        db_session.commit()
        db_session.refresh(patient)
        
        # 2. Prepare appointment data
        start_time = datetime.now(timezone.utc) + timedelta(days=1)
        end_time = start_time + timedelta(hours=1)
        
        appointment_data = {
            "patient_id": patient.id,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "reason_for_visit": "Annual checkup",
            "internal_notes": "Patient is new"
        }
        
        # 3. Make API request
        response = client.post("/api/v1/appointments/", json=appointment_data)
        
        assert response.status_code == 404
        assert "inactive" in response.json()["detail"].lower()
    
    def test_create_appointment_overlapping_time(self, client: TestClient, db_session: Session):
        """Test: POST /api/v1/appointments/ with overlapping time → 409"""
        # 1. Create patient
        patient = Patient(
            patient_number="PDC-000003",
            name="Test Patient",
            phone="5555555555",
            dob=datetime.now().date() - timedelta(days=365*25),
            aadhaar="555555555555",
            gender="Male",
            address="789 Test Street",
            chief_complaint="Test",
            is_active=True
        )
        db_session.add(patient)
        db_session.commit()
        db_session.refresh(patient)
        
        # 2. Create first appointment
        start_time = datetime.now(timezone.utc) + timedelta(days=1)
        end_time = start_time + timedelta(hours=2)
        
        appointment_data_1 = {
            "patient_id": patient.id,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "reason_for_visit": "First appointment",
            "internal_notes": "Test"
        }
        
        response1 = client.post("/api/v1/appointments/", json=appointment_data_1)
        assert response1.status_code == 201
        
        # 3. Try to create overlapping appointment
        start_time_2 = start_time + timedelta(minutes=30)
        end_time_2 = start_time + timedelta(hours=1, minutes=30)
        
        appointment_data_2 = {
            "patient_id": patient.id,
            "start_time": start_time_2.isoformat(),
            "end_time": end_time_2.isoformat(),
            "reason_for_visit": "Overlapping appointment",
            "internal_notes": "Test"
        }
        
        response2 = client.post("/api/v1/appointments/", json=appointment_data_2)
        
        assert response2.status_code == 409
        assert "already has an appointment" in response2.json()["detail"].lower()


    def test_get_appointment_by_id_success(self, client: TestClient, db_session: Session):
            """Test: GET /api/v1/appointments/{id} → 200 OK"""
            # 1. Create a patient
            patient = Patient(
                patient_number="PDC-000004",
                name="Test Patient",
                phone="1111111111",
                dob=datetime.now().date() - timedelta(days=365*25),
                aadhaar="111111111111",
                gender="Male",
                address="123 Test Street",
                chief_complaint="Test",
                is_active=True
            )
            db_session.add(patient)
            db_session.commit()
            db_session.refresh(patient)
            
            # 2. Create an appointment
            start_time = datetime.now(timezone.utc) + timedelta(days=1)
            end_time = start_time + timedelta(hours=1)
            
            appointment_data = {
                "patient_id": patient.id,
                "start_time": start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "reason_for_visit": "Annual checkup",
                "internal_notes": "Test notes"
            }
            
            create_response = client.post("/api/v1/appointments/", json=appointment_data)
            assert create_response.status_code == 201
            created_appointment = create_response.json()
            appointment_id = created_appointment["id"]
            
            # 3. Get the appointment by ID
            get_response = client.get(f"/api/v1/appointments/{appointment_id}")
            
            # 4. Assertions
            assert get_response.status_code == 200
            data = get_response.json()
            assert data["id"] == appointment_id
            assert data["patient_id"] == patient.id
            assert data["reason_for_visit"] == "Annual checkup"
            assert data["internal_notes"] == "Test notes"
            assert data["status"] == AppointmentStatus.SCHEDULED.value
        
    def test_get_appointment_by_id_not_found(self, client: TestClient):
        """Test: GET /api/v1/appointments/{id} with non-existent ID → 404"""
        response = client.get("/api/v1/appointments/99999")
            
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


    def test_get_patient_appointments_success(self, client: TestClient, db_session: Session):
        """Test: GET /api/v1/appointments/patient/{patient_id}/appointments → 200 with appointments"""
        # 1. Create a patient
        patient = Patient(
            patient_number="PDC-000005",
            name="Test Patient",
            phone="2222222222",
            dob=datetime.now().date() - timedelta(days=365*25),
            aadhaar="222222222222",
            gender="Male",
            address="123 Test Street",
            chief_complaint="Test",
            is_active=True
        )
        db_session.add(patient)
        db_session.commit()
        db_session.refresh(patient)
        
        # 2. Create 2 appointments
        start_time_1 = datetime.now(timezone.utc) + timedelta(days=1)
        end_time_1 = start_time_1 + timedelta(hours=1)
        
        appointment_data_1 = {
            "patient_id": patient.id,
            "start_time": start_time_1.isoformat(),
            "end_time": end_time_1.isoformat(),
            "reason_for_visit": "First appointment",
            "internal_notes": "Test"
        }
        
        response1 = client.post("/api/v1/appointments/", json=appointment_data_1)
        assert response1.status_code == 201
        
        start_time_2 = datetime.now(timezone.utc) + timedelta(days=2)
        end_time_2 = start_time_2 + timedelta(hours=1)
        
        appointment_data_2 = {
            "patient_id": patient.id,
            "start_time": start_time_2.isoformat(),
            "end_time": end_time_2.isoformat(),
            "reason_for_visit": "Second appointment",
            "internal_notes": "Test"
        }
        
        response2 = client.post("/api/v1/appointments/", json=appointment_data_2)
        assert response2.status_code == 201
        
        # 3. Get patient appointments
        response = client.get(f"/api/v1/appointments/patient/{patient.id}/appointments")
        
        # 4. Assertions
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["reason_for_visit"] == "First appointment"
        assert data[1]["reason_for_visit"] == "Second appointment"
        assert data[0]["patient_id"] == patient.id
        assert data[1]["patient_id"] == patient.id

    def test_get_patient_appointments_empty(self, client: TestClient, db_session: Session):
        """Test: GET /api/v1/appointments/patient/{patient_id}/appointments → 200 with empty list"""
        # 1. Create a patient with no appointments
        patient = Patient(
            patient_number="PDC-000006",
            name="Empty Patient",
            phone="3333333333",
            dob=datetime.now().date() - timedelta(days=365*25),
            aadhaar="333333333333",
            gender="Female",
            address="456 Test Street",
            chief_complaint="Test",
            is_active=True
        )
        db_session.add(patient)
        db_session.commit()
        db_session.refresh(patient)
        
        # 2. Get patient appointments
        response = client.get(f"/api/v1/appointments/patient/{patient.id}/appointments")
        
        # 3. Assertions
        assert response.status_code == 200
        data = response.json()
        assert data == []

    def test_get_patient_appointments_with_status_filter(self, client: TestClient, db_session: Session):
        """Test: GET /api/v1/appointments/patient/{patient_id}/appointments?status=confirmed → 200 filtered"""
        # 1. Create a patient
        patient = Patient(
            patient_number="PDC-000007",
            name="Filter Patient",
            phone="4444444444",
            dob=datetime.now().date() - timedelta(days=365*25),
            aadhaar="444444444444",
            gender="Male",
            address="789 Test Street",
            chief_complaint="Test",
            is_active=True
        )
        db_session.add(patient)
        db_session.commit()
        db_session.refresh(patient)
        
        # 2. Create Appointment 1: Scheduled (default)
        start_time_1 = datetime.now(timezone.utc) + timedelta(days=1)
        end_time_1 = start_time_1 + timedelta(hours=1)
        
        appointment_data_1 = {
            "patient_id": patient.id,
            "start_time": start_time_1.isoformat(),
            "end_time": end_time_1.isoformat(),
            "reason_for_visit": "Scheduled appointment",
            "internal_notes": "Test"
        }
        
        response1 = client.post("/api/v1/appointments/", json=appointment_data_1)
        assert response1.status_code == 201
        
        # 3. Create Appointment 2: Will be CONFIRMED
        start_time_2 = datetime.now(timezone.utc) + timedelta(days=2)
        end_time_2 = start_time_2 + timedelta(hours=1)
        
        appointment_data_2 = {
            "patient_id": patient.id,
            "start_time": start_time_2.isoformat(),
            "end_time": end_time_2.isoformat(),
            "reason_for_visit": "Confirmed appointment",
            "internal_notes": "Test"
        }
        
        response2 = client.post("/api/v1/appointments/", json=appointment_data_2)
        assert response2.status_code == 201
        appointment_2 = response2.json()
        
        # 4. Update status to CONFIRMED directly in database 
        appointment_db = db_session.query(Appointment).filter(Appointment.id == appointment_2["id"]).first()
        appointment_db.status = AppointmentStatus.CONFIRMED.value
        db_session.commit()
        
        # 5. Get only CONFIRMED appointments
        response = client.get(
            f"/api/v1/appointments/patient/{patient.id}/appointments?status=confirmed"
        )
        
        assert response.status_code == 200
        
        # 6. Get only SCHEDULED appointments
        response = client.get(
            f"/api/v1/appointments/patient/{patient.id}/appointments?status=scheduled"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["status"] == "scheduled"
        assert data[0]["reason_for_visit"] == "Scheduled appointment"

    def test_get_patient_appointments_nonexistent_patient(self, client: TestClient):
        """Test: GET /api/v1/appointments/patient/{patient_id}/appointments with non-existent patient → 200 empty list"""
        # Service returns empty list for non-existent patient
        response = client.get("/api/v1/appointments/patient/99999/appointments")
        
        assert response.status_code == 200
        data = response.json()
        assert data == []

    def test_get_patient_appointments_inactive_patient(self, client: TestClient, db_session: Session):
        """Test: GET /api/v1/appointments/patient/{patient_id}/appointments with inactive patient → 200 empty list"""
        # 1. Create inactive patient
        patient = Patient(
            patient_number="PDC-000008",
            name="Inactive Patient",
            phone="5555555555",
            dob=datetime.now().date() - timedelta(days=365*25),
            aadhaar="555555555555",
            gender="Female",
            address="123 Test Street",
            chief_complaint="Test",
            is_active=False
        )
        db_session.add(patient)
        db_session.commit()
        db_session.refresh(patient)
        
        # 2. Get appointments for inactive patient
        response = client.get(f"/api/v1/appointments/patient/{patient.id}/appointments")
        
        # 3. Assertions
        assert response.status_code == 200
        data = response.json()
        assert data == []


    def test_get_all_appointments_success(self, client: TestClient, db_session: Session):
        """Test: GET /api/v1/appointments/ → 200 with appointments"""
        # 1. Create a patient
        patient = Patient(
            patient_number="PDC-000009",
            name="Test Patient",
            phone="6666666666",
            dob=datetime.now().date() - timedelta(days=365*25),
            aadhaar="666666666666",
            gender="Male",
            address="123 Test Street",
            chief_complaint="Test",
            is_active=True
        )
        db_session.add(patient)
        db_session.commit()
        db_session.refresh(patient)
        
        # 2. Create 3 appointments
        for i in range(3):
            start_time = datetime.now(timezone.utc) + timedelta(days=i+1)
            end_time = start_time + timedelta(hours=1)
            
            appointment_data = {
                "patient_id": patient.id,
                "start_time": start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "reason_for_visit": f"Appointment {i+1}",
                "internal_notes": "Test"
            }
            
            response = client.post("/api/v1/appointments/", json=appointment_data)
            assert response.status_code == 201
        
        # 3. Get all appointments
        response = client.get("/api/v1/appointments/")
        
        # 4. Assertions
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3
        assert data[0]["reason_for_visit"] == "Appointment 1"
        assert data[1]["reason_for_visit"] == "Appointment 2"
        assert data[2]["reason_for_visit"] == "Appointment 3"

    def test_get_all_appointments_empty(self, client: TestClient):
        """Test: GET /api/v1/appointments/ with empty database → 200 + []"""
        response = client.get("/api/v1/appointments/")
        
        assert response.status_code == 200
        data = response.json()
        assert data == []

    def test_get_all_appointments_pagination(self, client: TestClient, db_session: Session):
        """Test: GET /api/v1/appointments/?skip=0&limit=2 → pagination works"""
        # 1. Create a patient
        patient = Patient(
            patient_number="PDC-000010",
            name="Pagination Patient",
            phone="7777777777",
            dob=datetime.now().date() - timedelta(days=365*25),
            aadhaar="777777777777",
            gender="Female",
            address="456 Test Street",
            chief_complaint="Test",
            is_active=True
        )
        db_session.add(patient)
        db_session.commit()
        db_session.refresh(patient)
        
        # 2. Create 5 appointments
        for i in range(5):
            start_time = datetime.now(timezone.utc) + timedelta(days=i+1)
            end_time = start_time + timedelta(hours=1)
            
            appointment_data = {
                "patient_id": patient.id,
                "start_time": start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "reason_for_visit": f"Appointment {i+1}",
                "internal_notes": "Test"
            }
            
            response = client.post("/api/v1/appointments/", json=appointment_data)
            assert response.status_code == 201
        
        # 3. Get first 2 appointments (skip=0, limit=2)
        response = client.get("/api/v1/appointments/?skip=0&limit=2")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["reason_for_visit"] == "Appointment 1"
        assert data[1]["reason_for_visit"] == "Appointment 2"
        
        # 4. Get next 2 appointments (skip=2, limit=2)
        response = client.get("/api/v1/appointments/?skip=2&limit=2")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["reason_for_visit"] == "Appointment 3"
        assert data[1]["reason_for_visit"] == "Appointment 4"
        
        # 5. Get last appointment (skip=4, limit=2)
        response = client.get("/api/v1/appointments/?skip=4&limit=2")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["reason_for_visit"] == "Appointment 5"

    def test_get_all_appointments_limit(self, client: TestClient, db_session: Session):
        """Test: GET /api/v1/appointments/?limit=3 → respects limit"""
        # 1. Create a patient
        patient = Patient(
            patient_number="PDC-000011",
            name="Limit Patient",
            phone="8888888888",
            dob=datetime.now().date() - timedelta(days=365*25),
            aadhaar="888888888888",
            gender="Male",
            address="789 Test Street",
            chief_complaint="Test",
            is_active=True
        )
        db_session.add(patient)
        db_session.commit()
        db_session.refresh(patient)
        
        # 2. Create 5 appointments
        for i in range(5):
            start_time = datetime.now(timezone.utc) + timedelta(days=i+1)
            end_time = start_time + timedelta(hours=1)
            
            appointment_data = {
                "patient_id": patient.id,
                "start_time": start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "reason_for_visit": f"Appointment {i+1}",
                "internal_notes": "Test"
            }
            
            response = client.post("/api/v1/appointments/", json=appointment_data)
            assert response.status_code == 201
        
        # 3. Get only 3 appointments
        response = client.get("/api/v1/appointments/?limit=3")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3
        assert data[0]["reason_for_visit"] == "Appointment 1"
        assert data[1]["reason_for_visit"] == "Appointment 2"
        assert data[2]["reason_for_visit"] == "Appointment 3"

    def test_get_all_appointments_multiple_patients(self, client: TestClient, db_session: Session):
        """Test: GET /api/v1/appointments/ returns appointments from multiple patients"""
        # 1. Create two patients
        patient1 = Patient(
            patient_number="PDC-000012",
            name="Patient One",
            phone="1111111111",
            dob=datetime.now().date() - timedelta(days=365*25),
            aadhaar="111111111111",
            gender="Male",
            address="123 Test Street",
            chief_complaint="Test",
            is_active=True
        )
        db_session.add(patient1)
        db_session.commit()
        db_session.refresh(patient1)
        
        patient2 = Patient(
            patient_number="PDC-000013",
            name="Patient Two",
            phone="2222222222",
            dob=datetime.now().date() - timedelta(days=365*30),
            aadhaar="222222222222",
            gender="Female",
            address="456 Test Street",
            chief_complaint="Test",
            is_active=True
        )
        db_session.add(patient2)
        db_session.commit()
        db_session.refresh(patient2)
        
        # 2. Create appointments for both patients
        # Patient 1: 2 appointments
        for i in range(2):
            start_time = datetime.now(timezone.utc) + timedelta(days=i+1)
            end_time = start_time + timedelta(hours=1)
            
            appointment_data = {
                "patient_id": patient1.id,
                "start_time": start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "reason_for_visit": f"Patient1 App {i+1}",
                "internal_notes": "Test"
            }
            
            response = client.post("/api/v1/appointments/", json=appointment_data)
            assert response.status_code == 201
        
        # Patient 2: 3 appointments
        for i in range(3):
            start_time = datetime.now(timezone.utc) + timedelta(days=i+3)
            end_time = start_time + timedelta(hours=1)
            
            appointment_data = {
                "patient_id": patient2.id,
                "start_time": start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "reason_for_visit": f"Patient2 App {i+1}",
                "internal_notes": "Test"
            }
            
            response = client.post("/api/v1/appointments/", json=appointment_data)
            assert response.status_code == 201
        
        # 3. Get all appointments
        response = client.get("/api/v1/appointments/")
        
        # 4. Assertions
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 5
        
        # Check both patients have appointments
        patient1_apps = [a for a in data if a["patient_id"] == patient1.id]
        patient2_apps = [a for a in data if a["patient_id"] == patient2.id]
        assert len(patient1_apps) == 2
        assert len(patient2_apps) == 3

    def test_update_appointment_success(self, client: TestClient, db_session: Session):
        """Test: PATCH /api/v1/appointments/{id} → 200 OK"""
        # 1. Create a patient
        patient = Patient(
            patient_number="PDC-000014",
            name="Test Patient",
            phone="9999999999",
            dob=datetime.now().date() - timedelta(days=365*25),
            aadhaar="999999999999",
            gender="Male",
            address="123 Test Street",
            chief_complaint="Test",
            is_active=True
        )
        db_session.add(patient)
        db_session.commit()
        db_session.refresh(patient)
        
        # 2. Create an appointment
        start_time = datetime.now(timezone.utc) + timedelta(days=1)
        end_time = start_time + timedelta(hours=1)
        
        appointment_data = {
            "patient_id": patient.id,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "reason_for_visit": "Original visit",
            "internal_notes": "Original notes"
        }
        
        create_response = client.post("/api/v1/appointments/", json=appointment_data)
        assert create_response.status_code == 201
        appointment = create_response.json()
        appointment_id = appointment["id"]
        
        # 3. Update the appointment
        new_start = start_time + timedelta(hours=2)
        new_end = new_start + timedelta(hours=1)
        
        update_data = {
            "start_time": new_start.isoformat(),
            "end_time": new_end.isoformat(),
            "reason_for_visit": "Updated visit",
            "internal_notes": "Updated notes"
        }
        
        response = client.patch(f"/api/v1/appointments/{appointment_id}", json=update_data)
        
        # 4. Assertions
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == appointment_id
        assert datetime.fromisoformat(data["start_time"]) == new_start
        assert datetime.fromisoformat(data["end_time"]) == new_end
        assert data["reason_for_visit"] == "Updated visit"
        assert data["internal_notes"] == "Updated notes"
        assert data["status"] == "scheduled"

    def test_update_appointment_status(self, client: TestClient, db_session: Session):
        """Test: PATCH /api/v1/appointments/{id} update status → 200 OK"""
        # 1. Create a patient
        patient = Patient(
            patient_number="PDC-000015",
            name="Status Patient",
            phone="8888888888",
            dob=datetime.now().date() - timedelta(days=365*25),
            aadhaar="888888888888",
            gender="Female",
            address="456 Test Street",
            chief_complaint="Test",
            is_active=True
        )
        db_session.add(patient)
        db_session.commit()
        db_session.refresh(patient)
        
        # 2. Create an appointment
        start_time = datetime.now(timezone.utc) + timedelta(days=1)
        end_time = start_time + timedelta(hours=1)
        
        appointment_data = {
            "patient_id": patient.id,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "reason_for_visit": "Annual checkup",
            "internal_notes": "Test"
        }
        
        create_response = client.post("/api/v1/appointments/", json=appointment_data)
        assert create_response.status_code == 201
        appointment = create_response.json()
        appointment_id = appointment["id"]
        
        # 3. Update status to CONFIRMED
        update_data = {"status": "confirmed"}
        response = client.patch(f"/api/v1/appointments/{appointment_id}", json=update_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "confirmed"
        
        # 4. Update status to CHECKED_IN
        update_data = {"status": "checked_in"}
        response = client.patch(f"/api/v1/appointments/{appointment_id}", json=update_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "checked_in"

    def test_update_appointment_not_found(self, client: TestClient):
        """Test: PATCH /api/v1/appointments/{id} with non-existent ID → 404"""
        update_data = {"reason_for_visit": "Updated visit"}
        response = client.patch("/api/v1/appointments/99999", json=update_data)
        
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_update_appointment_invalid_status_transition(self, client: TestClient, db_session: Session):
        """Test: PATCH /api/v1/appointments/{id} with invalid status transition → 400"""
        # 1. Create a patient
        patient = Patient(
            patient_number="PDC-000016",
            name="Invalid Patient",
            phone="7777777777",
            dob=datetime.now().date() - timedelta(days=365*25),
            aadhaar="777777777777",
            gender="Male",
            address="789 Test Street",
            chief_complaint="Test",
            is_active=True
        )
        db_session.add(patient)
        db_session.commit()
        db_session.refresh(patient)
        
        # 2. Create an appointment
        start_time = datetime.now(timezone.utc) + timedelta(days=1)
        end_time = start_time + timedelta(hours=1)
        
        appointment_data = {
            "patient_id": patient.id,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "reason_for_visit": "Annual checkup",
            "internal_notes": "Test"
        }
        
        create_response = client.post("/api/v1/appointments/", json=appointment_data)
        assert create_response.status_code == 201
        appointment = create_response.json()
        appointment_id = appointment["id"]
        
        # 3. Try invalid transition: scheduled → completed (skip steps)
        update_data = {"status": "completed"}
        response = client.patch(f"/api/v1/appointments/{appointment_id}", json=update_data)
        
        assert response.status_code == 400
        assert "invalid status transition" in response.json()["detail"].lower()

    def test_update_appointment_overlapping_time(self, client: TestClient, db_session: Session):
        """Test: PATCH /api/v1/appointments/{id} with overlapping time → 409"""
        # 1. Create a patient
        patient = Patient(
            patient_number="PDC-000017",
            name="Overlap Patient",
            phone="6666666666",
            dob=datetime.now().date() - timedelta(days=365*25),
            aadhaar="666666666666",
            gender="Female",
            address="123 Test Street",
            chief_complaint="Test",
            is_active=True
        )
        db_session.add(patient)
        db_session.commit()
        db_session.refresh(patient)
        
        # 2. Create first appointment: 10:00 - 11:00
        start_time_1 = datetime.now(timezone.utc) + timedelta(days=1)
        end_time_1 = start_time_1 + timedelta(hours=1)
        
        appointment_data_1 = {
            "patient_id": patient.id,
            "start_time": start_time_1.isoformat(),
            "end_time": end_time_1.isoformat(),
            "reason_for_visit": "First appointment",
            "internal_notes": "Test"
        }
        
        response1 = client.post("/api/v1/appointments/", json=appointment_data_1)
        assert response1.status_code == 201
        appointment_1 = response1.json()
        
        # 3. Create second appointment: 12:00 - 13:00 (non-overlapping)
        start_time_2 = end_time_1 + timedelta(hours=1)
        end_time_2 = start_time_2 + timedelta(hours=1)
        
        appointment_data_2 = {
            "patient_id": patient.id,
            "start_time": start_time_2.isoformat(),
            "end_time": end_time_2.isoformat(),
            "reason_for_visit": "Second appointment",
            "internal_notes": "Test"
        }
        
        response2 = client.post("/api/v1/appointments/", json=appointment_data_2)
        assert response2.status_code == 201
        appointment_2 = response2.json()
        
        # 4. Try to update second appointment to overlap with first (10:30 - 11:30)
        new_start = start_time_1 + timedelta(minutes=30)
        new_end = end_time_1 + timedelta(minutes=30)
        
        update_data = {
            "start_time": new_start.isoformat(),
            "end_time": new_end.isoformat()
        }
        
        response = client.patch(f"/api/v1/appointments/{appointment_2['id']}", json=update_data)
        
        assert response.status_code == 409
        assert "already has an appointment" in response.json()["detail"].lower()