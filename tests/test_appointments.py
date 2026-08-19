import pytest
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session

from app.services.appointment import AppointmentServices
from app.models.patient import Patient
from app.models.appointment import Appointment, AppointmentStatus
from app.schemas.appointment import AppointmentCreate, AppointmentUpdate


class TestAppointmentCreate:
    """Tests for creating appointments"""
    
    def test_create_appointment_success(self, db_session, sample_patient, sample_appointment_data):
        """Test #1: Valid active patient → appointment created successfully"""
        service = AppointmentServices(db_session)
        appointment = service.create_appointment(sample_appointment_data)
        
        assert appointment.id is not None
        assert appointment.patient_id == sample_patient.id
        assert appointment.status == AppointmentStatus.SCHEDULED.value
        assert appointment.created_at is not None
        assert appointment.updated_at is not None
    
    def test_create_appointment_nonexistent_patient(self, db_session):
        """Test #2: Nonexistent patient → rejected"""
        start_time = datetime.now(timezone.utc) + timedelta(days=1)
        end_time = start_time + timedelta(hours=1)
        
        appointment_data = AppointmentCreate(
            patient_id=99999,
            start_time=start_time,
            end_time=end_time,
            reason_for_visit="Annual checkup",
            internal_notes="Patient is new"
        )
        
        service = AppointmentServices(db_session)
        
        with pytest.raises(ValueError) as exc_info:
            service.create_appointment(appointment_data)
        
        assert "Patient with id 99999 not found" in str(exc_info.value)
    
    def test_create_appointment_inactive_patient(self, db_session):
        """Test #3: Inactive patient → rejected"""
        inactive_patient = Patient(
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
        db_session.add(inactive_patient)
        db_session.commit()
        db_session.refresh(inactive_patient)
        
        start_time = datetime.now(timezone.utc) + timedelta(days=1)
        end_time = start_time + timedelta(hours=1)
        
        appointment_data = AppointmentCreate(
            patient_id=inactive_patient.id,
            start_time=start_time,
            end_time=end_time,
            reason_for_visit="Annual checkup",
            internal_notes="Patient is new"
        )
        
        service = AppointmentServices(db_session)
        
        with pytest.raises(ValueError) as exc_info:
            service.create_appointment(appointment_data)
        
        assert f"Patient with id {inactive_patient.id} is inactive" in str(exc_info.value)
    
    def test_create_appointment_overlapping_time(self, db_session, sample_patient):
        """Test #4: Same patient + overlapping time → rejected"""
        # 1. Create first appointment
        start_time_1 = datetime.now(timezone.utc) + timedelta(days=1)
        end_time_1 = start_time_1 + timedelta(hours=2)
        
        appointment_data_1 = AppointmentCreate(
            patient_id=sample_patient.id,
            start_time=start_time_1,
            end_time=end_time_1,
            reason_for_visit="First appointment",
            internal_notes="Test"
        )
        
        service = AppointmentServices(db_session)
        service.create_appointment(appointment_data_1)
        
        # 2. Try to create overlapping appointment (starts in middle of first)
        start_time_2 = start_time_1 + timedelta(minutes=30)
        end_time_2 = start_time_1 + timedelta(hours=1, minutes=30)
        
        appointment_data_2 = AppointmentCreate(
            patient_id=sample_patient.id,
            start_time=start_time_2,
            end_time=end_time_2,
            reason_for_visit="Overlapping appointment",
            internal_notes="Test"
        )
        
        # 3. Should raise ValueError
        with pytest.raises(ValueError) as exc_info:
            service.create_appointment(appointment_data_2)
        
        assert "Patient already has an appointment in this time slot" in str(exc_info.value)
    
    def test_create_appointment_adjacent_time(self, db_session, sample_patient):
        """Test #5: Same patient + adjacent time → allowed"""
        # 1. Create first appointment (10:00 - 11:00)
        start_time_1 = datetime.now(timezone.utc) + timedelta(days=1)
        end_time_1 = start_time_1 + timedelta(hours=1)
        
        appointment_data_1 = AppointmentCreate(
            patient_id=sample_patient.id,
            start_time=start_time_1,
            end_time=end_time_1,
            reason_for_visit="First appointment",
            internal_notes="Test"
        )
        
        service = AppointmentServices(db_session)
        service.create_appointment(appointment_data_1)
        
        # 2. Create adjacent appointment (11:00 - 12:00)
        start_time_2 = end_time_1  # Exactly adjacent
        end_time_2 = start_time_2 + timedelta(hours=1)
        
        appointment_data_2 = AppointmentCreate(
            patient_id=sample_patient.id,
            start_time=start_time_2,
            end_time=end_time_2,
            reason_for_visit="Adjacent appointment",
            internal_notes="Test"
        )
        
        # 3. Should succeed
        appointment_2 = service.create_appointment(appointment_data_2)
        
        assert appointment_2.id is not None
        assert appointment_2.patient_id == sample_patient.id
        assert appointment_2.start_time == start_time_2
        assert appointment_2.end_time == end_time_2
        assert appointment_2.status == AppointmentStatus.SCHEDULED.value


    def test_create_appointment_cancelled_overlap_allowed(self, db_session, sample_patient):
        """Test #6: Existing cancelled appointment + same time → allowed"""
        # 1. Create first appointment
        start_time = datetime.now(timezone.utc) + timedelta(days=1)
        end_time = start_time + timedelta(hours=1)
        
        appointment_data_1 = AppointmentCreate(
            patient_id=sample_patient.id,
            start_time=start_time,
            end_time=end_time,
            reason_for_visit="First appointment",
            internal_notes="Test"
        )
        
        service = AppointmentServices(db_session)
        appointment_1 = service.create_appointment(appointment_data_1)
        
        # 2. Cancel the first appointment
        appointment_1.status = AppointmentStatus.CANCELLED.value
        db_session.commit()
        db_session.refresh(appointment_1)
        
        # 3. Try to create new appointment at same time
        appointment_data_2 = AppointmentCreate(
            patient_id=sample_patient.id,
            start_time=start_time,
            end_time=end_time,
            reason_for_visit="New appointment after cancellation",
            internal_notes="Test"
        )
        
        # 4. Should succeed
        appointment_2 = service.create_appointment(appointment_data_2)
        
        assert appointment_2.id is not None
        assert appointment_2.patient_id == sample_patient.id
        assert appointment_2.start_time == start_time
        assert appointment_2.end_time == end_time
        assert appointment_2.status == AppointmentStatus.SCHEDULED.value
        assert appointment_2.id != appointment_1.id

    def test_create_appointment_completed_overlap_allowed(self, db_session, sample_patient):
        """Test #7: Existing completed appointment + same time → allowed"""
        # 1. Create first appointment
        start_time = datetime.now(timezone.utc) + timedelta(days=1)
        end_time = start_time + timedelta(hours=1)
        
        appointment_data_1 = AppointmentCreate(
            patient_id=sample_patient.id,
            start_time=start_time,
            end_time=end_time,
            reason_for_visit="First appointment",
            internal_notes="Test"
        )
        
        service = AppointmentServices(db_session)
        appointment_1 = service.create_appointment(appointment_data_1)
        
        # 2. Mark first appointment as completed
        appointment_1.status = AppointmentStatus.COMPLETED.value
        db_session.commit()
        db_session.refresh(appointment_1)
        
        # 3. Try to create new appointment at same time
        appointment_data_2 = AppointmentCreate(
            patient_id=sample_patient.id,
            start_time=start_time,
            end_time=end_time,
            reason_for_visit="New appointment after completion",
            internal_notes="Test"
        )
        
        # 4. Should succeed
        appointment_2 = service.create_appointment(appointment_data_2)
        
        assert appointment_2.id is not None
        assert appointment_2.patient_id == sample_patient.id
        assert appointment_2.start_time == start_time
        assert appointment_2.end_time == end_time
        assert appointment_2.status == AppointmentStatus.SCHEDULED.value
        assert appointment_2.id != appointment_1.id

    def test_create_appointment_status_defaults_to_scheduled(self, db_session, sample_patient):
        """Test #8: New appointment starts as scheduled"""
        # 1. Create appointment data
        start_time = datetime.now(timezone.utc) + timedelta(days=1)
        end_time = start_time + timedelta(hours=1)
            
        appointment_data = AppointmentCreate(
            patient_id=sample_patient.id,
            start_time=start_time,
            end_time=end_time,
            reason_for_visit="Annual checkup",
            internal_notes="Patient is new"
            )
            
        # 2. Create appointment via service
        service = AppointmentServices(db_session)
        appointment = service.create_appointment(appointment_data)
            
        # 3. Assert status is SCHEDULED
        assert appointment.status == AppointmentStatus.SCHEDULED.value
            
        # 4. Verify in database
        db_appointment = db_session.query(Appointment).filter(Appointment.id == appointment.id).first()
        assert db_appointment.status == AppointmentStatus.SCHEDULED.value

    
    def test_get_appointment_by_id_success(self, db_session, sample_patient):
        """Test: Get existing appointment by ID"""
        # 1. Create an appointment
        start_time = datetime.now(timezone.utc) + timedelta(days=1)
        end_time = start_time + timedelta(hours=1)
        
        appointment_data = AppointmentCreate(
            patient_id=sample_patient.id,
            start_time=start_time,
            end_time=end_time,
            reason_for_visit="Annual checkup",
            internal_notes="Patient is new"
        )
        
        service = AppointmentServices(db_session)
        created_appointment = service.create_appointment(appointment_data)
        
        # 2. Get appointment by ID
        retrieved_appointment = service.get_appointment_by_id(created_appointment.id)
        
        # 3. Assertions
        assert retrieved_appointment is not None
        assert retrieved_appointment.id == created_appointment.id
        assert retrieved_appointment.patient_id == sample_patient.id
        assert retrieved_appointment.start_time == start_time
        assert retrieved_appointment.end_time == end_time
        assert retrieved_appointment.status == AppointmentStatus.SCHEDULED.value
        assert retrieved_appointment.reason_for_visit == "Annual checkup"
        assert retrieved_appointment.internal_notes == "Patient is new"
    
    def test_get_appointment_by_id_not_found(self, db_session):
        """Test: Get non-existent appointment by ID"""
        service = AppointmentServices(db_session)
        appointment = service.get_appointment_by_id(99999)
        
        assert appointment is None

    def test_get_patient_appointments_success(self, db_session, sample_patient):
        """Test: Get all appointments for a patient"""
        # 1. Create multiple appointments
        service = AppointmentServices(db_session)
        
        # Appointment 1: Today + 1 day
        start_time_1 = datetime.now(timezone.utc) + timedelta(days=1)
        end_time_1 = start_time_1 + timedelta(hours=1)
        appointment_data_1 = AppointmentCreate(
            patient_id=sample_patient.id,
            start_time=start_time_1,
            end_time=end_time_1,
            reason_for_visit="First appointment",
            internal_notes="Test"
        )
        appointment_1 = service.create_appointment(appointment_data_1)
        
        # Appointment 2: Today + 2 days
        start_time_2 = datetime.now(timezone.utc) + timedelta(days=2)
        end_time_2 = start_time_2 + timedelta(hours=1)
        appointment_data_2 = AppointmentCreate(
            patient_id=sample_patient.id,
            start_time=start_time_2,
            end_time=end_time_2,
            reason_for_visit="Second appointment",
            internal_notes="Test"
        )
        appointment_2 = service.create_appointment(appointment_data_2)
        
        # 2. Get all appointments for patient
        appointments = service.get_patient_appointments(sample_patient.id)
        
        # 3. Assertions
        assert len(appointments) == 2
        assert appointments[0].id == appointment_1.id
        assert appointments[1].id == appointment_2.id
        assert appointments[0].patient_id == sample_patient.id
        assert appointments[1].patient_id == sample_patient.id
    
    def test_get_patient_appointments_with_status_filter(self, db_session, sample_patient):
        """Test: Get patient appointments filtered by status"""
        # 1. Create appointments with different statuses
        service = AppointmentServices(db_session)
        
        # Appointment 1: Scheduled
        start_time_1 = datetime.now(timezone.utc) + timedelta(days=1)
        end_time_1 = start_time_1 + timedelta(hours=1)
        appointment_data_1 = AppointmentCreate(
            patient_id=sample_patient.id,
            start_time=start_time_1,
            end_time=end_time_1,
            reason_for_visit="Scheduled appointment",
            internal_notes="Test"
        )
        appointment_1 = service.create_appointment(appointment_data_1)
        
        # Appointment 2: Completed
        start_time_2 = datetime.now(timezone.utc) + timedelta(days=2)
        end_time_2 = start_time_2 + timedelta(hours=1)
        appointment_data_2 = AppointmentCreate(
            patient_id=sample_patient.id,
            start_time=start_time_2,
            end_time=end_time_2,
            reason_for_visit="Completed appointment",
            internal_notes="Test"
        )
        appointment_2 = service.create_appointment(appointment_data_2)
        appointment_2.status = AppointmentStatus.COMPLETED.value
        db_session.commit()
        
        # 2. Get only SCHEDULED appointments
        appointments = service.get_patient_appointments(
            sample_patient.id, 
            status=AppointmentStatus.SCHEDULED
        )
        
        # 3. Assertions
        assert len(appointments) == 1
        assert appointments[0].id == appointment_1.id
        assert appointments[0].status == AppointmentStatus.SCHEDULED.value
        
        # 4. Get only COMPLETED appointments
        appointments = service.get_patient_appointments(
            sample_patient.id, 
            status=AppointmentStatus.COMPLETED
        )
        
        assert len(appointments) == 1
        assert appointments[0].id == appointment_2.id
        assert appointments[0].status == AppointmentStatus.COMPLETED.value
    
    def test_get_patient_appointments_empty(self, db_session, sample_patient):
        """Test: Patient with no appointments returns empty list"""
        service = AppointmentServices(db_session)
        appointments = service.get_patient_appointments(sample_patient.id)
        
        assert appointments == []
    
    def test_get_patient_appointments_nonexistent_patient(self, db_session):
        """Test: Nonexistent patient returns empty list"""
        service = AppointmentServices(db_session)
        appointments = service.get_patient_appointments(99999)
        
        assert appointments == []
    
    def test_get_patient_appointments_inactive_patient(self, db_session):
        """Test: Inactive patient returns empty list"""
        # 1. Create inactive patient
        inactive_patient = Patient(
            patient_number="PDC-000003",
            name="Inactive Patient",
            phone="1234567890",
            dob=datetime.now().date() - timedelta(days=365*25),
            aadhaar="111111111111",
            gender="Male",
            address="789 Test Street",
            chief_complaint="Test",
            is_active=False
        )
        db_session.add(inactive_patient)
        db_session.commit()
        db_session.refresh(inactive_patient)
        
        # 2. Try to get appointments
        service = AppointmentServices(db_session)
        appointments = service.get_patient_appointments(inactive_patient.id)
        
        assert appointments == [] 

    def test_get_all_appointments_success(self, db_session, sample_patient):
        """Test: Get all appointments with default pagination"""
        # 1. Create multiple appointments
        service = AppointmentServices(db_session)
        
        # Create 3 appointments for same patient
        for i in range(3):
            start_time = datetime.now(timezone.utc) + timedelta(days=i+1)
            end_time = start_time + timedelta(hours=1)
            appointment_data = AppointmentCreate(
                patient_id=sample_patient.id,
                start_time=start_time,
                end_time=end_time,
                reason_for_visit=f"Appointment {i+1}",
                internal_notes="Test"
            )
            service.create_appointment(appointment_data)
        
        # 2. Get all appointments
        appointments = service.get_all_appointments()
        
        # 3. Assertions
        assert len(appointments) == 3
        assert appointments[0].reason_for_visit == "Appointment 1"
        assert appointments[1].reason_for_visit == "Appointment 2"
        assert appointments[2].reason_for_visit == "Appointment 3"
    
    def test_get_all_appointments_pagination(self, db_session, sample_patient):
        """Test: Get all appointments with pagination"""
        # 1. Create 5 appointments
        service = AppointmentServices(db_session)
        
        for i in range(5):
            start_time = datetime.now(timezone.utc) + timedelta(days=i+1)
            end_time = start_time + timedelta(hours=1)
            appointment_data = AppointmentCreate(
                patient_id=sample_patient.id,
                start_time=start_time,
                end_time=end_time,
                reason_for_visit=f"Appointment {i+1}",
                internal_notes="Test"
            )
            service.create_appointment(appointment_data)
        
        # 2. Get first 2 appointments (skip=0, limit=2)
        appointments_page_1 = service.get_all_appointments(skip=0, limit=2)
        
        assert len(appointments_page_1) == 2
        assert appointments_page_1[0].reason_for_visit == "Appointment 1"
        assert appointments_page_1[1].reason_for_visit == "Appointment 2"
        
        # 3. Get next 2 appointments (skip=2, limit=2)
        appointments_page_2 = service.get_all_appointments(skip=2, limit=2)
        
        assert len(appointments_page_2) == 2
        assert appointments_page_2[0].reason_for_visit == "Appointment 3"
        assert appointments_page_2[1].reason_for_visit == "Appointment 4"
        
        # 4. Get last appointment (skip=4, limit=2)
        appointments_page_3 = service.get_all_appointments(skip=4, limit=2)
        
        assert len(appointments_page_3) == 1
        assert appointments_page_3[0].reason_for_visit == "Appointment 5"
    
    def test_get_all_appointments_empty(self, db_session):
        """Test: No appointments returns empty list"""
        service = AppointmentServices(db_session)
        appointments = service.get_all_appointments()
        
        assert appointments == []
    
    def test_get_all_appointments_with_limit(self, db_session, sample_patient):
        """Test: Limit results to specific number"""
        # 1. Create 10 appointments
        service = AppointmentServices(db_session)
        
        for i in range(10):
            start_time = datetime.now(timezone.utc) + timedelta(days=i+1)
            end_time = start_time + timedelta(hours=1)
            appointment_data = AppointmentCreate(
                patient_id=sample_patient.id,
                start_time=start_time,
                end_time=end_time,
                reason_for_visit=f"Appointment {i+1}",
                internal_notes="Test"
            )
            service.create_appointment(appointment_data)
        
        # 2. Get only 5 appointments
        appointments = service.get_all_appointments(limit=5)
        
        assert len(appointments) == 5
        assert appointments[0].reason_for_visit == "Appointment 1"
        assert appointments[4].reason_for_visit == "Appointment 5"
    
    def test_get_all_appointments_multiple_patients(self, db_session):
        """Test: Get appointments from multiple patients"""
        # 1. Create two patients
        patient1 = Patient(
            patient_number="PDC-000001",
            name="Patient One",
            phone="1234567890",
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
            patient_number="PDC-000002",
            name="Patient Two",
            phone="0987654321",
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
        service = AppointmentServices(db_session)
        
        # Patient 1: 2 appointments
        for i in range(2):
            start_time = datetime.now(timezone.utc) + timedelta(days=i+1)
            end_time = start_time + timedelta(hours=1)
            appointment_data = AppointmentCreate(
                patient_id=patient1.id,
                start_time=start_time,
                end_time=end_time,
                reason_for_visit=f"Patient1 App {i+1}",
                internal_notes="Test"
            )
            service.create_appointment(appointment_data)
        
        # Patient 2: 3 appointments
        for i in range(3):
            start_time = datetime.now(timezone.utc) + timedelta(days=i+3)
            end_time = start_time + timedelta(hours=1)
            appointment_data = AppointmentCreate(
                patient_id=patient2.id,
                start_time=start_time,
                end_time=end_time,
                reason_for_visit=f"Patient2 App {i+1}",
                internal_notes="Test"
            )
            service.create_appointment(appointment_data)
        
        # 3. Get all appointments
        appointments = service.get_all_appointments()
        
        # 4. Assertions
        assert len(appointments) == 5
        # Should include appointments from both patients
        patient1_apps = [a for a in appointments if a.patient_id == patient1.id]
        patient2_apps = [a for a in appointments if a.patient_id == patient2.id]
        assert len(patient1_apps) == 2
        assert len(patient2_apps) == 3

    def test_update_appointment_status_scheduled_to_confirmed(self, db_session, sample_patient):
        """Test: scheduled → confirmed (allowed)"""
        service = AppointmentServices(db_session)
        
        start_time = datetime.now(timezone.utc) + timedelta(days=1)
        end_time = start_time + timedelta(hours=1)
        
        appointment_data = AppointmentCreate(
            patient_id=sample_patient.id,
            start_time=start_time,
            end_time=end_time,
            reason_for_visit="Annual checkup",
            internal_notes="Test"
        )
        appointment = service.create_appointment(appointment_data)
        
        # Update to CONFIRMED
        update_data = AppointmentUpdate(status=AppointmentStatus.CONFIRMED)
        updated = service.update_appointment(appointment.id, update_data)
        
        assert updated.status == AppointmentStatus.CONFIRMED.value

    def test_update_appointment_status_confirmed_to_checked_in(self, db_session, sample_patient):
        """Test: confirmed → checked_in (allowed)"""
        service = AppointmentServices(db_session)
        
        start_time = datetime.now(timezone.utc) + timedelta(days=1)
        end_time = start_time + timedelta(hours=1)
        
        appointment_data = AppointmentCreate(
            patient_id=sample_patient.id,
            start_time=start_time,
            end_time=end_time,
            reason_for_visit="Annual checkup",
            internal_notes="Test"
        )
        appointment = service.create_appointment(appointment_data)
        
        # First confirm
        update_data = AppointmentUpdate(status=AppointmentStatus.CONFIRMED)
        service.update_appointment(appointment.id, update_data)
        
        # Then check in
        update_data = AppointmentUpdate(status=AppointmentStatus.CHECKED_IN)
        updated = service.update_appointment(appointment.id, update_data)
        
        assert updated.status == AppointmentStatus.CHECKED_IN.value

    def test_update_appointment_status_checked_in_to_in_progress(self, db_session, sample_patient):
        """Test: checked_in → in_progress (allowed)"""
        service = AppointmentServices(db_session)
        
        start_time = datetime.now(timezone.utc) + timedelta(days=1)
        end_time = start_time + timedelta(hours=1)
        
        appointment_data = AppointmentCreate(
            patient_id=sample_patient.id,
            start_time=start_time,
            end_time=end_time,
            reason_for_visit="Annual checkup",
            internal_notes="Test"
        )
        appointment = service.create_appointment(appointment_data)
        
        # Confirm and check in
        service.update_appointment(appointment.id, AppointmentUpdate(status=AppointmentStatus.CONFIRMED))
        service.update_appointment(appointment.id, AppointmentUpdate(status=AppointmentStatus.CHECKED_IN))
        
        # Then in_progress
        update_data = AppointmentUpdate(status=AppointmentStatus.IN_PROGRESS)
        updated = service.update_appointment(appointment.id, update_data)
        
        assert updated.status == AppointmentStatus.IN_PROGRESS.value

    def test_update_appointment_status_in_progress_to_completed(self, db_session, sample_patient):
        """Test: in_progress → completed (allowed)"""
        service = AppointmentServices(db_session)
        
        start_time = datetime.now(timezone.utc) + timedelta(days=1)
        end_time = start_time + timedelta(hours=1)
        
        appointment_data = AppointmentCreate(
            patient_id=sample_patient.id,
            start_time=start_time,
            end_time=end_time,
            reason_for_visit="Annual checkup",
            internal_notes="Test"
        )
        appointment = service.create_appointment(appointment_data)
        
        # Move through statuses
        service.update_appointment(appointment.id, AppointmentUpdate(status=AppointmentStatus.CONFIRMED))
        service.update_appointment(appointment.id, AppointmentUpdate(status=AppointmentStatus.CHECKED_IN))
        service.update_appointment(appointment.id, AppointmentUpdate(status=AppointmentStatus.IN_PROGRESS))
        
        # Then complete
        update_data = AppointmentUpdate(status=AppointmentStatus.COMPLETED)
        updated = service.update_appointment(appointment.id, update_data)
        
        assert updated.status == AppointmentStatus.COMPLETED.value

    def test_update_appointment_status_completed_to_scheduled_blocked(self, db_session, sample_patient):
        """Test: completed → scheduled (blocked)"""
        service = AppointmentServices(db_session)
        
        start_time = datetime.now(timezone.utc) + timedelta(days=1)
        end_time = start_time + timedelta(hours=1)
        
        appointment_data = AppointmentCreate(
            patient_id=sample_patient.id,
            start_time=start_time,
            end_time=end_time,
            reason_for_visit="Annual checkup",
            internal_notes="Test"
        )
        appointment = service.create_appointment(appointment_data)
        
        # Move to completed
        service.update_appointment(appointment.id, AppointmentUpdate(status=AppointmentStatus.CONFIRMED))
        service.update_appointment(appointment.id, AppointmentUpdate(status=AppointmentStatus.CHECKED_IN))
        service.update_appointment(appointment.id, AppointmentUpdate(status=AppointmentStatus.IN_PROGRESS))
        service.update_appointment(appointment.id, AppointmentUpdate(status=AppointmentStatus.COMPLETED))
        
        # Try to change from completed
        update_data = AppointmentUpdate(status=AppointmentStatus.SCHEDULED)
        
        with pytest.raises(ValueError) as exc_info:
            service.update_appointment(appointment.id, update_data)
        
        assert "Invalid status transition" in str(exc_info.value)
        assert "completed" in str(exc_info.value)
        assert "scheduled" in str(exc_info.value)

    def test_update_appointment_status_cancelled_to_anything_blocked(self, db_session, sample_patient):
        """Test: cancelled → anything (blocked)"""
        service = AppointmentServices(db_session)
        
        start_time = datetime.now(timezone.utc) + timedelta(days=1)
        end_time = start_time + timedelta(hours=1)
        
        appointment_data = AppointmentCreate(
            patient_id=sample_patient.id,
            start_time=start_time,
            end_time=end_time,
            reason_for_visit="Annual checkup",
            internal_notes="Test"
        )
        appointment = service.create_appointment(appointment_data)
        
        # Cancel the appointment
        service.update_appointment(appointment.id, AppointmentUpdate(status=AppointmentStatus.CANCELLED))
        
        # Try to change from cancelled
        update_data = AppointmentUpdate(status=AppointmentStatus.CONFIRMED)
        
        with pytest.raises(ValueError) as exc_info:
            service.update_appointment(appointment.id, update_data)
        
        assert "Invalid status transition" in str(exc_info.value)
        assert "cancelled" in str(exc_info.value)

    def test_update_appointment_status_scheduled_to_cancelled_allowed(self, db_session, sample_patient):
        """Test: scheduled → cancelled (allowed)"""
        service = AppointmentServices(db_session)
        
        start_time = datetime.now(timezone.utc) + timedelta(days=1)
        end_time = start_time + timedelta(hours=1)
        
        appointment_data = AppointmentCreate(
            patient_id=sample_patient.id,
            start_time=start_time,
            end_time=end_time,
            reason_for_visit="Annual checkup",
            internal_notes="Test"
        )
        appointment = service.create_appointment(appointment_data)
        
        # Cancel directly from scheduled
        update_data = AppointmentUpdate(status=AppointmentStatus.CANCELLED)
        updated = service.update_appointment(appointment.id, update_data)
        
        assert updated.status == AppointmentStatus.CANCELLED.value

    def test_update_appointment_status_same_status_allowed(self, db_session, sample_patient):
        """Test: same status update is allowed (no change)"""
        service = AppointmentServices(db_session)
        
        start_time = datetime.now(timezone.utc) + timedelta(days=1)
        end_time = start_time + timedelta(hours=1)
        
        appointment_data = AppointmentCreate(
            patient_id=sample_patient.id,
            start_time=start_time,
            end_time=end_time,
            reason_for_visit="Annual checkup",
            internal_notes="Test"
        )
        appointment = service.create_appointment(appointment_data)
        
        # Update with same status
        update_data = AppointmentUpdate(status=AppointmentStatus.SCHEDULED)
        updated = service.update_appointment(appointment.id, update_data)
        
        assert updated.status == AppointmentStatus.SCHEDULED.value