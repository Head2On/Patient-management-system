from fastapi import status


def test_create_patient_success(client, sample_patient_data, auth_headers, admin_user):
    """Test successful patient creation (Admin/Receptionist)"""
    response = client.post("/api/v1/patients", json=sample_patient_data, headers=auth_headers)
    
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["name"] == sample_patient_data["name"]
    assert data["phone"] == sample_patient_data["phone"]
    assert "patient_number" in data
    assert data["patient_number"].startswith("PDC-")
    assert data["created_by_id"] == admin_user.id
    assert data["updated_by_id"] == admin_user.id

def test_create_patient_duplicate_aadhaar(client, sample_patient_data, auth_headers):
    """Test duplicate aadhaar number should fail"""
    # First patient with aadhaar
    client.post("/api/v1/patients", json=sample_patient_data, headers=auth_headers)
    
    # Second patient with SAME aadhaar but different phone
    duplicate_data = sample_patient_data.copy()
    duplicate_data["phone"] = "9998887777"  # Different phone
    
    response = client.post("/api/v1/patients", json=duplicate_data, headers=auth_headers)
    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_get_patient_by_number(client, sample_patient_data, auth_headers):
    # Create patient first
    create_response = client.post("/api/v1/patients", json=sample_patient_data, headers=auth_headers)
    patient_number = create_response.json()["patient_number"]
    
    # Get by patient_number
    response = client.get(f"/api/v1/patients/{patient_number}", headers=auth_headers)
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["name"] == sample_patient_data["name"]


def test_get_patient_not_found(client, auth_headers):
    """Test getting non-existent patient"""
    response = client.get("/api/v1/patients/NONEXISTENT", headers=auth_headers)
    
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert "not found" in response.json()["detail"].lower()


def test_list_all_patients(client, sample_patient_data, auth_headers):
    # Create 3 patients
    for i in range(3):
        patient_data = sample_patient_data.copy()
        patient_data["phone"] = f"987654321{i}"
        patient_data["aadhaar"] = f"12345678901{i}"
        client.post("/api/v1/patients", json=patient_data, headers=auth_headers)
    
    response = client.get("/api/v1/patients", headers=auth_headers)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) >= 3


def test_list_patients_with_pagination(client, sample_patient_data, auth_headers):
    """Test pagination"""
    # Create 15 patients with valid 10-digit phone and 12-digit aadhaar
    for i in range(15):
        patient_data = sample_patient_data.copy()
        patient_data["phone"] = f"987654{i:04d}"
        patient_data["aadhaar"] = f"12345678{i:04d}"
        client.post("/api/v1/patients", json=patient_data, headers=auth_headers)
    
    # Get first page (limit 10)
    response = client.get("/api/v1/patients?page=1&limit=10", headers=auth_headers)
    assert response.status_code == status.HTTP_200_OK
    assert len(response.json()) == 10
    
    # Get second page
    response = client.get("/api/v1/patients?page=2&limit=10", headers=auth_headers)
    assert response.status_code == status.HTTP_200_OK
    assert len(response.json()) == 5


def test_search_patients(client, sample_patient_data, auth_headers):
    """Test search functionality"""
    client.post("/api/v1/patients", json=sample_patient_data, headers=auth_headers)
    
    response = client.get("/api/v1/patients?search=Test", headers=auth_headers)
    assert response.status_code == status.HTTP_200_OK
    assert len(response.json()) >= 1
    
    response = client.get("/api/v1/patients?search=NonExistent", headers=auth_headers)
    assert response.status_code == status.HTTP_200_OK
    assert len(response.json()) == 0


def test_update_patient_success(client, sample_patient_data, auth_headers, admin_user):
    """Test updating a patient"""
    create_response = client.post("/api/v1/patients", json=sample_patient_data, headers=auth_headers)
    patient_number = create_response.json()["patient_number"]
    
    # Update patient
    update_data = {"name": "Updated Name", "phone": "9998887777"}
    response = client.patch(f"/api/v1/patients/{patient_number}", json=update_data, headers=auth_headers)
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["name"] == "Updated Name"
    assert data["phone"] == "9998887777"
    assert data["patient_number"] == patient_number
    assert data["created_by_id"] == admin_user.id
    assert data["updated_by_id"] == admin_user.id


def test_delete_patient(client, sample_patient_data, auth_headers):
    """Test soft deleting a patient"""
    create_response = client.post("/api/v1/patients", json=sample_patient_data, headers=auth_headers)
    patient_number = create_response.json()["patient_number"]
    
    # Delete patient
    response = client.delete(f"/api/v1/patients/{patient_number}", headers=auth_headers)
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["status"] == "inactive"
    
    # Try to get deleted patient (by patient_number)
    get_response = client.get(f"/api/v1/patients/{patient_number}", headers=auth_headers)
    assert get_response.status_code == status.HTTP_404_NOT_FOUND


def test_delete_already_deleted_patient(client, sample_patient_data, auth_headers):
    """Test deleting already deleted patient"""
    create_response = client.post("/api/v1/patients", json=sample_patient_data, headers=auth_headers)
    patient_number = create_response.json()["patient_number"]
    
    # First delete
    client.delete(f"/api/v1/patients/{patient_number}", headers=auth_headers)
    
    # Second delete
    response = client.delete(f"/api/v1/patients/{patient_number}", headers=auth_headers)
    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_reactivate_patient(client, sample_patient_data, auth_headers, admin_user):
    """Test reactivating a patient"""
    create_response = client.post("/api/v1/patients", json=sample_patient_data, headers=auth_headers)
    patient_number = create_response.json()["patient_number"]
    
    # Delete
    client.delete(f"/api/v1/patients/{patient_number}", headers=auth_headers)
    
    # Reactivate
    response = client.patch(f"/api/v1/patients/{patient_number}/reactivate", headers=auth_headers)
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["is_active"] == True
    assert response.json()["updated_by_id"] == admin_user.id


# ============= RBAC & AUTHENTICATION TESTS =============

def test_unauthenticated_cannot_create_patient(client, sample_patient_data):
    """Security Test: Anonymous user cannot register patient"""
    response = client.post("/api/v1/patients", json=sample_patient_data)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_unauthenticated_cannot_list_patients(client):
    """Security Test: Anonymous user cannot list patients"""
    response = client.get("/api/v1/patients")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_doctor_cannot_create_patient(client, doctor_auth_headers, sample_patient_data):
    """Security Test: Doctor role cannot register new patients"""
    response = client.post(
        "/api/v1/patients",
        json=sample_patient_data,
        headers=doctor_auth_headers
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert "Not enough permissions" in response.json()["detail"]


def test_doctor_cannot_deactivate_patient(client, doctor_auth_headers, auth_headers, sample_patient_data):
    """Security Test: Doctor role cannot deactivate patients"""
    # Create patient via admin
    create_res = client.post("/api/v1/patients", json=sample_patient_data, headers=auth_headers)
    patient_number = create_res.json()["patient_number"]

    # Doctor tries to delete
    response = client.delete(
        f"/api/v1/patients/{patient_number}",
        headers=doctor_auth_headers
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert "Not enough permissions" in response.json()["detail"]


def test_doctor_cannot_reactivate_patient(client, doctor_auth_headers, auth_headers, sample_patient_data):
    """Security Test: Doctor role cannot reactivate patients"""
    # Create and deactivate via admin
    create_res = client.post("/api/v1/patients", json=sample_patient_data, headers=auth_headers)
    patient_number = create_res.json()["patient_number"]
    client.delete(f"/api/v1/patients/{patient_number}", headers=auth_headers)

    # Doctor tries to reactivate
    response = client.patch(
        f"/api/v1/patients/{patient_number}/reactivate",
        headers=doctor_auth_headers
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert "Not enough permissions" in response.json()["detail"]


def test_doctor_can_view_patient(client, doctor_auth_headers, auth_headers, sample_patient_data):
    """Clinical Flow: Doctor can view patient"""
    create_res = client.post("/api/v1/patients", json=sample_patient_data, headers=auth_headers)
    patient_number = create_res.json()["patient_number"]

    # Doctor views patient
    get_res = client.get(f"/api/v1/patients/{patient_number}", headers=doctor_auth_headers)
    assert get_res.status_code == status.HTTP_200_OK
    assert get_res.json()["name"] == sample_patient_data["name"]


def test_doctor_cannot_update_patient(client, doctor_auth_headers, auth_headers, sample_patient_data):
    """Security Test: Doctor role cannot update patients"""
    create_res = client.post("/api/v1/patients", json=sample_patient_data, headers=auth_headers)
    patient_number = create_res.json()["patient_number"]

    # Doctor tries to update patient
    update_res = client.patch(
        f"/api/v1/patients/{patient_number}",
        json={"chief_complaint": "Acute bronchitis diagnosed"},
        headers=doctor_auth_headers
    )
    assert update_res.status_code == status.HTTP_403_FORBIDDEN
    assert "Not enough permissions" in update_res.json()["detail"]


def test_receptionist_can_create_and_deactivate_patient(client, receptionist_auth_headers, sample_patient_data, receptionist_user):
    """Front Desk Flow: Receptionist can register and deactivate patients"""
    # Create
    create_res = client.post("/api/v1/patients", json=sample_patient_data, headers=receptionist_auth_headers)
    assert create_res.status_code == status.HTTP_201_CREATED
    data = create_res.json()
    patient_number = data["patient_number"]
    assert data["created_by_id"] == receptionist_user.id
    assert data["updated_by_id"] == receptionist_user.id

    # Deactivate
    del_res = client.delete(f"/api/v1/patients/{patient_number}", headers=receptionist_auth_headers)
    assert del_res.status_code == status.HTTP_200_OK
    assert del_res.json()["status"] == "inactive"


def test_admin_create_receptionist_update_audit(client, auth_headers, receptionist_auth_headers, sample_patient_data, admin_user, receptionist_user):
    """Audit Trail: Admin creates patient, Receptionist updates, audit IDs track both actors"""
    create_res = client.post("/api/v1/patients", json=sample_patient_data, headers=auth_headers)
    assert create_res.status_code == status.HTTP_201_CREATED
    patient_number = create_res.json()["patient_number"]
    assert create_res.json()["created_by_id"] == admin_user.id
    assert create_res.json()["updated_by_id"] == admin_user.id

    update_res = client.patch(
        f"/api/v1/patients/{patient_number}",
        json={"name": "Updated by Receptionist"},
        headers=receptionist_auth_headers
    )
    assert update_res.status_code == status.HTTP_200_OK
    assert update_res.json()["name"] == "Updated by Receptionist"
    assert update_res.json()["created_by_id"] == admin_user.id
    assert update_res.json()["updated_by_id"] == receptionist_user.id


def test_admin_can_list_inactive_patients(client, auth_headers, sample_patient_data):
    """Lifecycle Discoverability: Admin can list inactive patients via is_active=false"""
    create_res = client.post("/api/v1/patients", json=sample_patient_data, headers=auth_headers)
    patient_number = create_res.json()["patient_number"]

    # Soft delete patient
    del_res = client.delete(f"/api/v1/patients/{patient_number}", headers=auth_headers)
    assert del_res.status_code == status.HTTP_200_OK

    # Query active patients (default) - should NOT include deactivated patient
    active_res = client.get("/api/v1/patients", headers=auth_headers)
    assert active_res.status_code == status.HTTP_200_OK
    active_numbers = [p["patient_number"] for p in active_res.json()]
    assert patient_number not in active_numbers

    # Query inactive patients with is_active=false - MUST include deactivated patient
    inactive_res = client.get("/api/v1/patients?is_active=false", headers=auth_headers)
    assert inactive_res.status_code == status.HTTP_200_OK
    inactive_patients = inactive_res.json()
    assert len(inactive_patients) >= 1
    target = next((p for p in inactive_patients if p["patient_number"] == patient_number), None)
    assert target is not None
    assert target["is_active"] is False


def test_receptionist_can_list_inactive_patients(client, auth_headers, receptionist_auth_headers, sample_patient_data):
    """Lifecycle Discoverability: Receptionist can list inactive patients for reactivation workflow"""
    create_res = client.post("/api/v1/patients", json=sample_patient_data, headers=auth_headers)
    patient_number = create_res.json()["patient_number"]
    client.delete(f"/api/v1/patients/{patient_number}", headers=auth_headers)

    # Receptionist queries is_active=false
    res = client.get("/api/v1/patients?is_active=false", headers=receptionist_auth_headers)
    assert res.status_code == status.HTTP_200_OK
    inactive_numbers = [p["patient_number"] for p in res.json()]
    assert patient_number in inactive_numbers


def test_doctor_cannot_list_inactive_patients(client, doctor_auth_headers):
    """Security Test: Doctor role is forbidden from querying inactive patient records"""
    res = client.get("/api/v1/patients?is_active=false", headers=doctor_auth_headers)
    assert res.status_code == status.HTTP_403_FORBIDDEN
    assert "Not authorized to view inactive patient records" in res.json()["detail"]


def test_doctor_can_list_active_patients_default_and_explicit(client, doctor_auth_headers):
    """Clinical Flow: Doctor can list active patients by default and with is_active=true"""
    res_default = client.get("/api/v1/patients", headers=doctor_auth_headers)
    assert res_default.status_code == status.HTTP_200_OK

    res_explicit = client.get("/api/v1/patients?is_active=true", headers=doctor_auth_headers)
    assert res_explicit.status_code == status.HTTP_200_OK


def test_unauthenticated_cannot_list_inactive_patients(client):
    """Security Test: Anonymous user cannot query inactive patients"""
    res = client.get("/api/v1/patients?is_active=false")
    assert res.status_code == status.HTTP_401_UNAUTHORIZED


# ================================================================================
# STAGE 11.4.2B: INPUT VALIDATION REGRESSION TESTS (PHONE, AADHAAR & DOB BOUNDARIES)
# ================================================================================

def test_create_patient_phone_below_10_digits_rejected(client, auth_headers, sample_patient_data, db_session):
    """Regression: Backend Pydantic rejects phone below 10 digits with 422; no DB row created"""
    from app.models.patient import Patient
    invalid_data = sample_patient_data.copy()
    invalid_data["phone"] = "123456789"
    count_before = db_session.query(Patient).count()

    res = client.post("/api/v1/patients", json=invalid_data, headers=auth_headers)
    assert res.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "at least 10 digits" in res.text

    count_after = db_session.query(Patient).count()
    assert count_after == count_before


def test_create_patient_phone_above_15_digits_rejected(client, auth_headers, sample_patient_data, db_session):
    """Regression: Backend Pydantic rejects phone above 15 digits with 422; no DB row created"""
    from app.models.patient import Patient
    invalid_data = sample_patient_data.copy()
    invalid_data["phone"] = "1234567890123456"
    count_before = db_session.query(Patient).count()

    res = client.post("/api/v1/patients", json=invalid_data, headers=auth_headers)
    assert res.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "cannot exceed 15 digits" in res.text

    count_after = db_session.query(Patient).count()
    assert count_after == count_before


def test_create_patient_phone_letters_rejected(client, auth_headers, sample_patient_data, db_session):
    """Regression: Backend Pydantic rejects letters in phone with 422; no DB row created"""
    from app.models.patient import Patient
    invalid_data = sample_patient_data.copy()
    invalid_data["phone"] = "98765abcde"
    count_before = db_session.query(Patient).count()

    res = client.post("/api/v1/patients", json=invalid_data, headers=auth_headers)
    assert res.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "must contain only digits" in res.text

    count_after = db_session.query(Patient).count()
    assert count_after == count_before


def test_create_patient_phone_symbols_rejected(client, auth_headers, sample_patient_data, db_session):
    """Regression: Backend Pydantic rejects symbols (+ and -) in phone with 422; no DB row created"""
    from app.models.patient import Patient
    invalid_data = sample_patient_data.copy()
    invalid_data["phone"] = "+91-98765-43210"
    count_before = db_session.query(Patient).count()

    res = client.post("/api/v1/patients", json=invalid_data, headers=auth_headers)
    assert res.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "must contain only digits" in res.text

    count_after = db_session.query(Patient).count()
    assert count_after == count_before


def test_create_patient_phone_internal_spaces_rejected(client, auth_headers, sample_patient_data, db_session):
    """Regression: Backend Pydantic rejects internal spaces in phone with 422; no DB row created"""
    from app.models.patient import Patient
    invalid_data = sample_patient_data.copy()
    invalid_data["phone"] = "98765 43210"
    count_before = db_session.query(Patient).count()

    res = client.post("/api/v1/patients", json=invalid_data, headers=auth_headers)
    assert res.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "must contain only digits" in res.text

    count_after = db_session.query(Patient).count()
    assert count_after == count_before


def test_create_patient_phone_padded_whitespace_stripped(client, auth_headers, sample_patient_data, db_session):
    """Regression: Backend Pydantic strips leading/trailing whitespace and stores clean digits"""
    from app.models.patient import Patient
    data = sample_patient_data.copy()
    data["phone"] = "  9876543210  "
    data["aadhaar"] = "998877665544"

    res = client.post("/api/v1/patients", json=data, headers=auth_headers)
    assert res.status_code == status.HTTP_201_CREATED
    patient_number = res.json()["patient_number"]

    db_patient = db_session.query(Patient).filter(Patient.patient_number == patient_number).first()
    assert db_patient is not None
    assert db_patient.phone == "9876543210"  # Normalized without whitespace


def test_create_patient_aadhaar_11_digits_rejected(client, auth_headers, sample_patient_data, db_session):
    """Regression: Backend Pydantic rejects 11-digit Aadhaar with 422; no DB row created"""
    from app.models.patient import Patient
    invalid_data = sample_patient_data.copy()
    invalid_data["aadhaar"] = "12345678901"
    count_before = db_session.query(Patient).count()

    res = client.post("/api/v1/patients", json=invalid_data, headers=auth_headers)
    assert res.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "exactly 12 digits" in res.text

    count_after = db_session.query(Patient).count()
    assert count_after == count_before


def test_create_patient_aadhaar_13_digits_rejected(client, auth_headers, sample_patient_data, db_session):
    """Regression: Backend Pydantic rejects 13-digit Aadhaar with 422; no DB row created"""
    from app.models.patient import Patient
    invalid_data = sample_patient_data.copy()
    invalid_data["aadhaar"] = "1234567890123"
    count_before = db_session.query(Patient).count()

    res = client.post("/api/v1/patients", json=invalid_data, headers=auth_headers)
    assert res.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "exactly 12 digits" in res.text

    count_after = db_session.query(Patient).count()
    assert count_after == count_before


def test_create_patient_aadhaar_letters_rejected(client, auth_headers, sample_patient_data, db_session):
    """Regression: Backend Pydantic rejects alphanumeric Aadhaar with 422; no DB row created"""
    from app.models.patient import Patient
    invalid_data = sample_patient_data.copy()
    invalid_data["aadhaar"] = "12345678901A"
    count_before = db_session.query(Patient).count()

    res = client.post("/api/v1/patients", json=invalid_data, headers=auth_headers)
    assert res.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "exactly 12 digits" in res.text

    count_after = db_session.query(Patient).count()
    assert count_after == count_before


def test_create_patient_aadhaar_empty_and_whitespace_normalized_to_none(client, auth_headers, sample_patient_data, db_session):
    """Regression: Empty string and whitespace-only Aadhaar normalize to None, allowing multiple entries without 400 unique constraint collision"""
    from app.models.patient import Patient
    # 1. First patient with empty string
    p1_data = sample_patient_data.copy()
    p1_data["phone"] = "9876500001"
    p1_data["aadhaar"] = ""
    res1 = client.post("/api/v1/patients", json=p1_data, headers=auth_headers)
    assert res1.status_code == status.HTTP_201_CREATED
    p1_num = res1.json()["patient_number"]

    # 2. Second patient with whitespace-only
    p2_data = sample_patient_data.copy()
    p2_data["phone"] = "9876500002"
    p2_data["aadhaar"] = "   "
    res2 = client.post("/api/v1/patients", json=p2_data, headers=auth_headers)
    assert res2.status_code == status.HTTP_201_CREATED
    p2_num = res2.json()["patient_number"]

    # 3. Third patient with another empty string (would fail with 400 if not normalized to None!)
    p3_data = sample_patient_data.copy()
    p3_data["phone"] = "9876500003"
    p3_data["aadhaar"] = ""
    res3 = client.post("/api/v1/patients", json=p3_data, headers=auth_headers)
    assert res3.status_code == status.HTTP_201_CREATED
    p3_num = res3.json()["patient_number"]

    # Verify PostgreSQL state: all three have NULL in aadhaar column
    db_p1 = db_session.query(Patient).filter(Patient.patient_number == p1_num).first()
    db_p2 = db_session.query(Patient).filter(Patient.patient_number == p2_num).first()
    db_p3 = db_session.query(Patient).filter(Patient.patient_number == p3_num).first()
    assert db_p1.aadhaar is None
    assert db_p2.aadhaar is None
    assert db_p3.aadhaar is None


def test_create_patient_aadhaar_spaced_format_normalized(client, auth_headers, sample_patient_data, db_session):
    """Regression: 4-digit spaced Aadhaar format ('1234 5678 9012') is stripped and stored as pure 12 digits"""
    from app.models.patient import Patient
    data = sample_patient_data.copy()
    data["phone"] = "9876500004"
    data["aadhaar"] = "5544 3322 1100"

    res = client.post("/api/v1/patients", json=data, headers=auth_headers)
    assert res.status_code == status.HTTP_201_CREATED
    patient_number = res.json()["patient_number"]

    db_patient = db_session.query(Patient).filter(Patient.patient_number == patient_number).first()
    assert db_patient is not None
    assert db_patient.aadhaar == "554433221100"


def test_create_patient_dob_future_date_rejected(client, auth_headers, sample_patient_data, db_session):
    """Regression: Backend Pydantic rejects future date of birth with 422; no DB row created"""
    from app.models.patient import Patient
    invalid_data = sample_patient_data.copy()
    invalid_data["dob"] = "2099-01-01"
    count_before = db_session.query(Patient).count()

    res = client.post("/api/v1/patients", json=invalid_data, headers=auth_headers)
    assert res.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "cannot be in the future" in res.text

    count_after = db_session.query(Patient).count()
    assert count_after == count_before


def test_create_patient_dob_leap_day_validation(client, auth_headers, sample_patient_data):
    """Regression: Valid leap day is accepted (201); invalid calendar date is rejected (422)"""
    # 1. Valid leap day: 2024-02-29
    valid_data = sample_patient_data.copy()
    valid_data["phone"] = "9876500005"
    valid_data["aadhaar"] = "665544332211"
    valid_data["dob"] = "2024-02-29"
    res_valid = client.post("/api/v1/patients", json=valid_data, headers=auth_headers)
    assert res_valid.status_code == status.HTTP_201_CREATED

    # 2. Invalid leap day (non-leap year): 2026-02-29
    invalid_data = sample_patient_data.copy()
    invalid_data["phone"] = "9876500006"
    invalid_data["aadhaar"] = "776655443322"
    invalid_data["dob"] = "2026-02-29"
    res_invalid = client.post("/api/v1/patients", json=invalid_data, headers=auth_headers)
    assert res_invalid.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
