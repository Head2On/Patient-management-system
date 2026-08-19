from fastapi import status

def test_create_patient_success(client, sample_patient_data):
    """Test successful patient creation"""
    response = client.post("/api/v1/patients", json=sample_patient_data)
    
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["name"] == sample_patient_data["name"]
    assert data["phone"] == sample_patient_data["phone"]
    assert "patient_number" in data
    assert data["patient_number"].startswith("PDC-")


def test_create_patient_duplicate_aadhaar(client, sample_patient_data):
    """Test duplicate aadhaar number should fail"""
    # First patient with aadhaar
    client.post("/api/v1/patients", json=sample_patient_data)
    
    # Second patient with SAME aadhaar but different phone
    duplicate_data = sample_patient_data.copy()
    duplicate_data["phone"] = "9998887777"  # Different phone
    # Keep same aadhaar
    
    response = client.post("/api/v1/patients", json=duplicate_data)
    assert response.status_code == status.HTTP_400_BAD_REQUEST

def test_get_patient_by_number(client, sample_patient_data):
    # Create patient first
    create_response = client.post("/api/v1/patients", json=sample_patient_data)
    print(create_response.status_code)
    print(create_response.json())
    
    patient_number = create_response.json()["patient_number"]
    
    # Get the database ID by fetching all patients and finding the one with our patient_number
    list_response = client.get("/api/v1/patients")
    patients = list_response.json()
    
    # Find the patient with matching patient_number to get its database ID
    patient = next((p for p in patients if p["patient_number"] == patient_number), None)
    
    response = client.get(f"/api/v1/patients/{patient_number}")
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["name"] == sample_patient_data["name"]
    


def test_get_patient_not_found(client):
    """Test getting non-existent patient"""
    # Try a non-existent patient_number
    response = client.get("/api/v1/patients/NONEXISTENT")
    
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert "not found" in response.json()["detail"].lower()


def test_list_all_patients(client, sample_patient_data):
    # Check how many patients exist BEFORE creating new ones
    response = client.get("/api/v1/patients")
    print(f"Before: {len(response.json())} patients exist")
    
    # Create 3 patients
    for i in range(3):
        patient_data = sample_patient_data.copy()
        patient_data["phone"] = f"987654321{i}"
        patient_data["aadhaar"] = f"12345678901{i}"
        response = client.post("/api/v1/patients", json=patient_data)
        print(f"Created patient {i}: {response.status_code}")
    
    # Check after creation
    response = client.get("/api/v1/patients")
    print(f"After: {len(response.json())} patients exist")
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) >= 3


def test_list_patients_with_pagination(client, sample_patient_data):
    """Test pagination"""
    # Create 15 patients
    for i in range(15):
        patient_data = sample_patient_data.copy()
        patient_data["phone"] = f"987654321{i}"
        patient_data["aadhaar"] = f"12345678901{i}"
        client.post("/api/v1/patients", json=patient_data)
    
    # Get first page (limit 10)
    response = client.get("/api/v1/patients?page=1&limit=10")
    assert response.status_code == status.HTTP_200_OK
    assert len(response.json()) == 10
    
    # Get second page
    response = client.get("/api/v1/patients?page=2&limit=10")
    assert response.status_code == status.HTTP_200_OK
    assert len(response.json()) == 5


def test_search_patients(client, sample_patient_data):
    """Test search functionality"""
    client.post("/api/v1/patients", json=sample_patient_data)
    
    response = client.get("/api/v1/patients?search=Test")
    assert response.status_code == status.HTTP_200_OK
    assert len(response.json()) >= 1
    
    response = client.get("/api/v1/patients?search=NonExistent")
    assert response.status_code == status.HTTP_200_OK
    assert len(response.json()) == 0


def test_update_patient_success(client, sample_patient_data):
    """Test updating a patient"""
    # Create patient
    create_response = client.post("/api/v1/patients", json=sample_patient_data)
    print("Status Code:", create_response.status_code)
    print("Response JSON:", create_response.json())
    patient_number = create_response.json()["patient_number"]
    
    # Update patient
    update_data = {"name": "Updated Name", "phone": "9998887777"}
    response = client.patch(f"/api/v1/patients/{patient_number}", json=update_data)
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["name"] == "Updated Name"
    assert data["phone"] == "9998887777"
    assert data["patient_number"] == patient_number


def test_delete_patient(client, sample_patient_data):
    """Test soft deleting a patient"""
    # Create patient
    create_response = client.post("/api/v1/patients", json=sample_patient_data)
    patient_number = create_response.json()["patient_number"]
    
    # Delete patient
    response = client.delete(f"/api/v1/patients/{patient_number}")
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["status"] == "inactive"
    
    # Try to get deleted patient (by patient_number)
    get_response = client.get(f"/api/v1/patients/{patient_number}")
    assert get_response.status_code == status.HTTP_404_NOT_FOUND


def test_delete_already_deleted_patient(client, sample_patient_data):
    """Test deleting already deleted patient"""
    # Create patient
    create_response = client.post("/api/v1/patients", json=sample_patient_data)
    patient_number = create_response.json()["patient_number"]
    
    # First delete
    client.delete(f"/api/v1/patients/{patient_number}")
    
    # Second delete
    response = client.delete(f"/api/v1/patients/{patient_number}")
    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_reactivate_patient(client, sample_patient_data):
    """Test reactivating a patient"""
    # Create patient
    create_response = client.post("/api/v1/patients", json=sample_patient_data)
    patient_number = create_response.json()["patient_number"]
    
    # Delete
    client.delete(f"/api/v1/patients/{patient_number}")
    
    # Reactivate
    response = client.patch(f"/api/v1/patients/{patient_number}/reactivate")
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["is_active"] == True