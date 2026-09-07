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
    # Create 15 patients
    for i in range(15):
        patient_data = sample_patient_data.copy()
        patient_data["phone"] = f"987654321{i}"
        patient_data["aadhaar"] = f"12345678901{i}"
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
