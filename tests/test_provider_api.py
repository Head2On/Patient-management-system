from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.provider import Provider


import pytest
from fastapi import status


class TestProviderRouter:

    @pytest.fixture(autouse=True)
    def setup_admin_auth(self, client: TestClient, auth_headers: dict):
        client.headers.clear()
        client.headers.update(auth_headers)
        yield
        client.headers.clear()

    # POST ALL PROVIDERS TESTS

    def test_create_provider_success(self, client: TestClient, db_session: Session):
        """Test successful provider creation via API"""
        
        payload = {
            "name": "Dr. Aman Sharma",
            "specialization": "Cardiology",
            "phone": "9876543210",
            "email": "amansharma@hospital.com",
            "post": "MD"
        }
        
        response = client.post("/api/v1/providers/", json=payload)
        
        assert response.status_code == 201
        
        data = response.json()
        assert data["id"] is not None
        assert data["doc_number"] == "AS3210"
        assert data["name"] == "Dr. Aman Sharma"
        assert data["specialization"] == "Cardiology"
        assert data["phone"] == "9876543210"
        assert data["email"] == "amansharma@hospital.com"
        assert data["post"] == "MD"
        assert data["is_active"] is True
        
        # Verify in database
        db = db_session
        saved = db.query(Provider).filter(Provider.doc_number == "AS3210").first()
        assert saved is not None
        assert saved.name == "Dr. Aman Sharma"
    
    def test_create_provider_without_email(self, client: TestClient):
        """Test creating provider without email (optional)"""
        
        payload = {
            "name": "Riya Patel",
            "specialization": "Neurology",
            "phone": "9876549876",
            "post": "MS"
        }
        
        response = client.post("/api/v1/providers/", json=payload)
        
        assert response.status_code == 201
        
        data = response.json()
        assert data["doc_number"] == "RP9876"
        assert data["email"] is None
        assert data["post"] == "MS"
    
    def test_create_provider_duplicate_phone_same_doc_number(self, client: TestClient):
        """Test duplicate phone where doc_number also collides"""
        
        # Create first provider
        payload1 = {
            "name": "Dr. Aman Sharma",
            "specialization": "Cardiology",
            "phone": "9876543210",
            "email": "aman@hospital.com",
            "post": "MD"
        }
        client.post("/api/v1/providers/", json=payload1)
        
        # Try to create second with same phone AND same doc_number
        payload2 = {
            "name": "Dr. Amit Sharma",  # Same initial 'A'
            "specialization": "Cardiology",
            "phone": "9876543210",  # Same phone
            "email": "amit@hospital.com",
            "post": "MD"
        }
        
        response = client.post("/api/v1/providers/", json=payload2)
        
        assert response.status_code == 400
        # doc_number collision happens first
        assert "doc_number" in response.json()["detail"].lower()
        assert "AS3210" in response.json()["detail"]
    
    def test_create_provider_duplicate_phone_different_doc_number(self, client: TestClient):
        """Test duplicate phone where doc_number is different"""
        
        # Create first provider
        payload1 = {
            "name": "Dr. Aman Sharma",
            "specialization": "Cardiology",
            "phone": "9876543210",
            "email": "aman@hospital.com",
            "post": "MD"
        }
        client.post("/api/v1/providers/", json=payload1)
        # doc_number = AS3210
        
        # Try to create second with same phone but DIFFERENT doc_number
        payload2 = {
            "name": "Dr. Riya Sharma",
            "specialization": "Cardiology",
            "phone": "9876543210",  # Same phone
            "email": "riya@hospital.com",
            "post": "MD"
        }
        
        response = client.post("/api/v1/providers/", json=payload2)
        
        assert response.status_code == 400
        # Now it's a phone duplicate error
        assert "already registered" in response.json()["detail"].lower()
        assert "9876543210" in response.json()["detail"]
    
    def test_create_provider_missing_required_field(self, client: TestClient):
        """Test creating provider with missing required field returns 422"""
        
        payload = {
            "name": "Aman Sharma",
            "specialization": "Cardiology",
            # Missing phone
            "post": "MD"
        }
        
        response = client.post("/api/v1/providers/", json=payload)
        
        assert response.status_code == 422  # Validation error
        assert "phone" in response.text.lower()
    
    def test_create_provider_invalid_post(self, client: TestClient): 
        """Test creating provider with invalid post value returns 422"""
        
        payload = {
            "name": "Aman Sharma",
            "specialization": "Cardiology",
            "phone": "9876543210",
            "email": "aman@hospital.com",
            "post": "INVALID"  # Not MD or MS
        }
        
        response = client.post("/api/v1/providers/", json=payload)
        
        assert response.status_code == 422

    # GET ALL PROVIDERS TESTS

    def test_get_all_providers_empty(self, client: TestClient):
        """Test getting all providers when none exist"""
        
        response = client.get("/api/v1/providers/")
        
        assert response.status_code == 200
        assert response.json() == []
    
    def test_get_all_providers_single(self, client: TestClient):
        """Test getting all providers with one provider"""
        
        # Create a provider
        payload = {
            "name": "Dr. Aman Sharma",
            "specialization": "Cardiology",
            "phone": "9876543210",
            "email": "aman@hospital.com",
            "post": "MD"
        }
        client.post("/api/v1/providers/", json=payload)
        
        # Get all providers
        response = client.get("/api/v1/providers/")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["doc_number"] == "AS3210"
        assert data[0]["name"] == "Dr. Aman Sharma"
        assert data[0]["specialization"] == "Cardiology"
        assert data[0]["phone"] == "9876543210"
        assert data[0]["email"] == "aman@hospital.com"
        assert data[0]["post"] == "MD"
        assert data[0]["is_active"] is True
    
    def test_get_all_providers_multiple(self, client: TestClient):
        """Test getting all providers with multiple providers"""
        
        # Create multiple providers
        providers = [
            {
                "name": "Dr. Aman Sharma",
                "specialization": "Cardiology",
                "phone": "9876543210",
                "email": "aman@hospital.com",
                "post": "MD"
            },
            {
                "name": "Dr. Riya Patel",
                "specialization": "Neurology",
                "phone": "9876549876",
                "email": "riya@hospital.com",
                "post": "MS"
            },
            {
                "name": "Dr. John Doe",
                "specialization": "Dermatology",
                "phone": "9876541234",
                "email": "john@hospital.com",
                "post": "MD"
            }
        ]
        
        for provider in providers:
            client.post("/api/v1/providers/", json=provider)
        
        # Get all providers
        response = client.get("/api/v1/providers/")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3
        
        # Check ordering by doc_number
        doc_numbers = [p["doc_number"] for p in data]
        assert doc_numbers == ["AS3210", "JD1234", "RP9876"]  # Sorted alphabetically
    
    def test_get_all_providers_pagination_skip(self, client: TestClient):
        """Test pagination with skip parameter"""
        
        # Create 5 providers
        for i in range(1, 6):
            payload = {
                "name": f"Dr. Doctor{i}",
                "specialization": "Test",
                "phone": f"987654{i:04d}",
                "email": f"doctor{i}@hospital.com",
                "post": "MD"
            }
            client.post("/api/v1/providers/", json=payload)
        
        # Get with skip=2
        response = client.get("/api/v1/providers/?skip=2")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3  # 5 - 2 = 3
        # First should be D0003
        assert data[0]["doc_number"] == "D0003"
    
    def test_get_all_providers_pagination_limit(self, client: TestClient):
        """Test pagination with limit parameter"""
        
        # Create 5 providers
        for i in range(1, 6):
            payload = {
                "name": f"Dr. Doctor{i}",
                "specialization": "Test",
                "phone": f"987654{i:04d}",
                "email": f"doctor{i}@hospital.com",
                "post": "MD"
            }
            client.post("/api/v1/providers/", json=payload)
        
        # Get with limit=2
        response = client.get("/api/v1/providers/?limit=2")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["doc_number"] == "D0001"
        assert data[1]["doc_number"] == "D0002"
    
    def test_get_all_providers_pagination_skip_and_limit(self, client: TestClient):
        """Test pagination with both skip and limit"""
        
        # Create 10 providers
        for i in range(1, 11):
            payload = {
                "name": f"Dr. Doctor{i}",
                "specialization": "Test",
                "phone": f"987654{i:04d}",
                "email": f"doctor{i}@hospital.com",
                "post": "MD"
            }
            client.post("/api/v1/providers/", json=payload)
        
        # Get with skip=3, limit=4
        response = client.get("/api/v1/providers/?skip=3&limit=4")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 4
        assert data[0]["doc_number"] == "D0004"
        assert data[1]["doc_number"] == "D0005"
        assert data[2]["doc_number"] == "D0006"
        assert data[3]["doc_number"] == "D0007"
    
    def test_get_all_providers_limit_validation(self, client: TestClient):
        """Test that limit validation works (max 1000)"""
        
        # Try with limit > 1000
        response = client.get("/api/v1/providers/?limit=2000")
        
        assert response.status_code == 422  # Validation error
    
    def test_get_all_providers_includes_inactive(self, client: TestClient, db_session: Session):
        """Test that inactive providers are included in results"""
        
        # Create a provider
        payload = {
            "name": "Dr. Test Doctor",
            "specialization": "Test",
            "phone": "9876549999",
            "email": "test@hospital.com",
            "post": "MD"
        }
        client.post("/api/v1/providers/", json=payload)
        
        # Deactivate the provider
        # Since we haven't built the deactivate endpoint yet, we'll do it manually
        from app.services.provider import ProviderServices
        service = ProviderServices(db_session)
        service.deactivate_provider("TD9999")
        
        # Get all providers
        response = client.get("/api/v1/providers/")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["is_active"] is False 

    # GET PROVIDER BY DOC_NUMBER TESTS

    def test_get_provider_by_doc_number_success(self, client: TestClient):
        """Test successfully getting a provider by doc_number"""
        
        # Create a provider
        payload = {
            "name": "Dr. Aman Sharma",
            "specialization": "Cardiology",
            "phone": "9876543210",
            "email": "aman@hospital.com",
            "post": "MD"
        }
        client.post("/api/v1/providers/", json=payload)
        
        # Get by doc_number
        response = client.get("/api/v1/providers/AS3210")
        
        assert response.status_code == 200
        data = response.json()
        assert data["doc_number"] == "AS3210"
        assert data["name"] == "Dr. Aman Sharma"
        assert data["specialization"] == "Cardiology"
        assert data["phone"] == "9876543210"
        assert data["email"] == "aman@hospital.com"
        assert data["post"] == "MD"
        assert data["is_active"] is True
    
    def test_get_provider_by_doc_number_not_found(self, client: TestClient):
        """Test getting a provider that doesn't exist returns 404"""
        
        response = client.get("/api/v1/providers/AS9999")
        
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()
        assert "AS9999" in response.json()["detail"]
    
    def test_get_provider_by_doc_number_inactive(self, client: TestClient, db_session: Session):
        """Test getting an inactive provider still returns it"""
        
        # Create a provider
        payload = {
            "name": "Dr. Test Doctor",
            "specialization": "Test",
            "phone": "9876549999",
            "email": "test@hospital.com",
            "post": "MD"
        }
        client.post("/api/v1/providers/", json=payload)
        
        # Deactivate the provider
        from app.services.provider import ProviderServices
        service = ProviderServices(db_session)
        service.deactivate_provider("TD9999")
        
        # Get by doc_number
        response = client.get("/api/v1/providers/TD9999")
        
        assert response.status_code == 200
        data = response.json()
        assert data["doc_number"] == "TD9999"
        assert data["is_active"] is False  # Still returns even if inactive
    
    def test_get_provider_by_doc_number_with_spaces(self, client: TestClient):
        """Test getting a provider with spaces in doc_number (trim handling)"""
        
        # Create a provider
        payload = {
            "name": "Dr. Sam Lee",
            "specialization": "Orthopedics",
            "phone": "9876541234",
            "email": "sam@hospital.com",
            "post": "MS"
        }
        client.post("/api/v1/providers/", json=payload)
        
        # Get with spaces
        response = client.get("/api/v1/providers/SL1234 ")
        
        # Should work if router handles spaces in path param
        # FastAPI automatically strips path parameters
        assert response.status_code == 200
        data = response.json()
        assert data["doc_number"] == "SL1234"
    
    def test_get_provider_by_doc_number_case_sensitive(self, client: TestClient):
        """Test that doc_number lookup is case-sensitive"""
        
        # Create a provider
        payload = {
            "name": "Dr. Riya Patel",
            "specialization": "Neurology",
            "phone": "9876549876",
            "email": "riya@hospital.com",
            "post": "MS"
        }
        client.post("/api/v1/providers/", json=payload)
        
        # Try with lowercase
        response = client.get("/api/v1/providers/rp9876")
        
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_provider_by_doc_number_after_update(self, client: TestClient):
        """Test getting a provider after updating it"""
        
        # Create a provider
        payload = {
            "name": "Dr. Old Name",
            "specialization": "Old Specialty",
            "phone": "9876541111",
            "email": "old@hospital.com",
            "post": "MD"
        }
        client.post("/api/v1/providers/", json=payload)
        
        # Update the provider
        update_payload = {
            "name": "Dr. New Name",
            "specialization": "New Specialty",
            "phone": "9876542222",
            "email": "new@hospital.com",
            "post": "MS"
        }
        client.put("/api/v1/providers/ON1111", json=update_payload)
        
        # Get by doc_number
        response = client.get("/api/v1/providers/ON1111")
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Dr. New Name"
        assert data["specialization"] == "New Specialty"
        assert data["phone"] == "9876542222"
        assert data["email"] == "new@hospital.com"
        assert data["post"] == "MS"

    # UPDATE PROVIDER TESTS

    def test_update_provider_success(self, client: TestClient):
        """Test successfully updating a provider"""
        
        # Create a provider
        payload = {
            "name": "Dr. Aman Sharma",
            "specialization": "Cardiology",
            "phone": "9876543210",
            "email": "aman@hospital.com",
            "post": "MD"
        }
        client.post("/api/v1/providers/", json=payload)
        
        # Update the provider
        update_payload = {
            "name": "Dr. Aman Kumar Sharma",
            "specialization": "Interventional Cardiology",
            "phone": "9876549999",
            "email": "aman.kumar@hospital.com",
            "post": "MS"
        }
        
        response = client.put("/api/v1/providers/AS3210", json=update_payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["doc_number"] == "AS3210"  # Unchanged
        assert data["name"] == "Dr. Aman Kumar Sharma"
        assert data["specialization"] == "Interventional Cardiology"
        assert data["phone"] == "9876549999"
        assert data["email"] == "aman.kumar@hospital.com"
        assert data["post"] == "MS"
        assert data["is_active"] is True  # Unchanged
    
    def test_update_provider_partial_update(self, client: TestClient):
        """Test partial update (only some fields)"""
        
        # Create a provider
        payload = {
            "name": "Dr. Riya Patel",
            "specialization": "Neurology",
            "phone": "9876549876",
            "email": "riya@hospital.com",
            "post": "MS"
        }
        client.post("/api/v1/providers/", json=payload)
        
        # Update only name and specialization
        update_payload = {
            "name": "Dr. Riya Sharma Patel",
            "specialization": "Pediatric Neurology"
        }
        
        response = client.put("/api/v1/providers/RP9876", json=update_payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Dr. Riya Sharma Patel"
        assert data["specialization"] == "Pediatric Neurology"
        assert data["phone"] == "9876549876"  # Unchanged
        assert data["email"] == "riya@hospital.com"  # Unchanged
        assert data["post"] == "MS"  # Unchanged
    
    def test_update_provider_phone_already_exists(self, client: TestClient):
        """Test updating to an existing phone number returns 400"""
        
        # Create first provider
        payload1 = {
            "name": "Dr. Aman Sharma",
            "specialization": "Cardiology",
            "phone": "9876543210",
            "email": "aman@hospital.com",
            "post": "MD"
        }
        client.post("/api/v1/providers/", json=payload1)
        
        # Create second provider
        payload2 = {
            "name": "Dr. Riya Patel",
            "specialization": "Neurology",
            "phone": "9876549876",
            "email": "riya@hospital.com",
            "post": "MS"
        }
        client.post("/api/v1/providers/", json=payload2)
        
        # Try to update second provider with first provider's phone
        update_payload = {
            "phone": "9876543210"  # First provider's phone
        }
        
        response = client.put("/api/v1/providers/RP9876", json=update_payload)
        
        assert response.status_code == 400
        assert "already registered" in response.json()["detail"].lower()
        assert "9876543210" in response.json()["detail"]
    
    def test_update_provider_same_phone_no_error(self, client: TestClient):
        """Test updating with same phone (no change) doesn't error"""
        
        # Create a provider
        payload = {
            "name": "Dr. Aman Sharma",
            "specialization": "Cardiology",
            "phone": "9876543210",
            "email": "aman@hospital.com",
            "post": "MD"
        }
        client.post("/api/v1/providers/", json=payload)
        
        # Update with same phone
        update_payload = {
            "phone": "9876543210"  # Same phone
        }
        
        response = client.put("/api/v1/providers/AS3210", json=update_payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["phone"] == "9876543210"
    
    def test_update_provider_not_found(self, client: TestClient):
        """Test updating a provider that doesn't exist returns 404"""
        
        update_payload = {
            "name": "Dr. New Name"
        }
        
        response = client.put("/api/v1/providers/AS9999", json=update_payload)
        
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()
        assert "AS9999" in response.json()["detail"]
    
    def test_update_provider_duplicate_email_allowed(self, client: TestClient):
        """Test that multiple providers can share the same email"""
        
        # Create first provider
        payload1 = {
            "name": "Dr. Aman Sharma",
            "specialization": "Cardiology",
            "phone": "9876543210",
            "email": "shared@hospital.com",
            "post": "MD"
        }
        client.post("/api/v1/providers/", json=payload1)
        
        # Create second provider
        payload2 = {
            "name": "Dr. Riya Patel",
            "specialization": "Neurology",
            "phone": "9876549876",
            "email": "riya@hospital.com",
            "post": "MS"
        }
        client.post("/api/v1/providers/", json=payload2)
        
        # Update second provider to use first provider's email
        update_payload = {
            "email": "shared@hospital.com"
        }
        
        response = client.put("/api/v1/providers/RP9876", json=update_payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "shared@hospital.com"   

    def test_update_provider_doc_number_immutable(self, client: TestClient):
        """Test that doc_number cannot be changed"""
        
        # Create a provider
        payload = {
            "name": "Dr. Aman Sharma",
            "specialization": "Cardiology",
            "phone": "9876543210",
            "email": "aman@hospital.com",
            "post": "MD"
        }
        client.post("/api/v1/providers/", json=payload)
        
        # Try to update (doc_number is not in ProviderUpdate schema)
        # The schema doesn't allow doc_number, so we can't even try
        # This test verifies the schema doesn't have doc_number
        
        from app.schemas.provider import ProviderUpdate
        assert not hasattr(ProviderUpdate, 'doc_number')
    
    def test_update_provider_is_active_not_allowed(self, client: TestClient):
        """Test that is_active cannot be updated through this endpoint"""
        
        # Create a provider
        payload = {
            "name": "Dr. Aman Sharma",
            "specialization": "Cardiology",
            "phone": "9876543210",
            "email": "aman@hospital.com",
            "post": "MD"
        }
        client.post("/api/v1/providers/", json=payload)
        
        # Try to update (is_active is not in ProviderUpdate schema)
        # The schema doesn't allow is_active, so we can't even try
        
        from app.schemas.provider import ProviderUpdate
        assert not hasattr(ProviderUpdate, 'is_active')
    
    def test_update_provider_multiple_fields(self, client: TestClient):
        """Test updating multiple fields at once"""
        
        # Create a provider
        payload = {
            "name": "Dr. Old Name",
            "specialization": "Old Specialty",
            "phone": "9876541111",
            "email": "old@hospital.com",
            "post": "MD"
        }
        client.post("/api/v1/providers/", json=payload)
        
        # Update multiple fields
        update_payload = {
            "name": "Dr. New Name",
            "specialization": "New Specialty",
            "phone": "9876542222",
            "email": "new@hospital.com",
            "post": "MS"
        }
        
        response = client.put("/api/v1/providers/ON1111", json=update_payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Dr. New Name"
        assert data["specialization"] == "New Specialty"
        assert data["phone"] == "9876542222"
        assert data["email"] == "new@hospital.com"
        assert data["post"] == "MS"
        assert data["is_active"] is True  # Unchanged
    
    def test_update_provider_after_deactivation(self, client: TestClient, db_session: Session):
        """Test updating an inactive provider still works"""
        
        # Create a provider
        payload = {
            "name": "Dr. Test Doctor",
            "specialization": "Test",
            "phone": "9876549999",
            "email": "test@hospital.com",
            "post": "MD"
        }
        client.post("/api/v1/providers/", json=payload)
        
        # Deactivate the provider
        from app.services.provider import ProviderServices
        service = ProviderServices(db_session)
        service.deactivate_provider("TD9999")
        
        # Update the inactive provider
        update_payload = {
            "name": "Dr. Updated Inactive Doctor",
            "specialization": "Updated Test"
        }
        
        response = client.put("/api/v1/providers/TD9999", json=update_payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Dr. Updated Inactive Doctor"
        assert data["specialization"] == "Updated Test"
        assert data["is_active"] is False  # Still inactive

    # DEACTIVATE PROVIDER TESTS
    
    def test_deactivate_provider_success(self, client: TestClient):
        """Test successfully deactivating a provider"""
        
        # Create a provider
        payload = {
            "name": "Dr. Aman Sharma",
            "specialization": "Cardiology",
            "phone": "9876543210",
            "email": "aman@hospital.com",
            "post": "MD"
        }
        client.post("/api/v1/providers/", json=payload)
        
        # Deactivate
        response = client.delete("/api/v1/providers/AS3210")
        
        assert response.status_code == 200
        data = response.json()
        assert data["doc_number"] == "AS3210"
        assert data["is_active"] is False
        assert data["name"] == "Dr. Aman Sharma"  # Other fields unchanged
        
        # Verify in database
        get_response = client.get("/api/v1/providers/AS3210")
        assert get_response.status_code == 200
        assert get_response.json()["is_active"] is False
    
    def test_deactivate_provider_already_inactive(self, client: TestClient):
        """Test deactivating an already inactive provider returns 400"""
        
        # Create a provider
        payload = {
            "name": "Dr. Riya Patel",
            "specialization": "Neurology",
            "phone": "9876549876",
            "email": "riya@hospital.com",
            "post": "MS"
        }
        client.post("/api/v1/providers/", json=payload)
        
        # Deactivate first time
        client.delete("/api/v1/providers/RP9876")
        
        # Try to deactivate again
        response = client.delete("/api/v1/providers/RP9876")
        
        assert response.status_code == 400
        assert "already inactive" in response.json()["detail"].lower()
    
    def test_deactivate_provider_not_found(self, client: TestClient):
        """Test deactivating a provider that doesn't exist returns 404"""
        
        response = client.delete("/api/v1/providers/AS9999")
        
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()
        assert "AS9999" in response.json()["detail"]
    
    def test_deactivate_provider_preserves_other_fields(self, client: TestClient):
        """Test that deactivation only changes is_active"""
        
        # Create a provider
        payload = {
            "name": "Dr. John Doe",
            "specialization": "Dermatology",
            "phone": "9876541234",
            "email": "john@hospital.com",
            "post": "MD"
        }
        create_response = client.post("/api/v1/providers/", json=payload)
        original_data = create_response.json()
        
        # Deactivate
        client.delete("/api/v1/providers/JD1234")
        
        # Get the provider
        get_response = client.get("/api/v1/providers/JD1234")
        data = get_response.json()
        
        # Verify only is_active changed
        assert data["name"] == original_data["name"]
        assert data["specialization"] == original_data["specialization"]
        assert data["phone"] == original_data["phone"]
        assert data["email"] == original_data["email"]
        assert data["post"] == original_data["post"]
        assert data["is_active"] is False
    
    # REACTIVATE PROVIDER TESTS
    
    def test_reactivate_provider_success(self, client: TestClient):
        """Test successfully reactivating a provider"""
        
        # Create a provider
        payload = {
            "name": "Dr. Aman Sharma",
            "specialization": "Cardiology",
            "phone": "9876543210",
            "email": "aman@hospital.com",
            "post": "MD"
        }
        client.post("/api/v1/providers/", json=payload)
        
        # Deactivate first
        client.delete("/api/v1/providers/AS3210")
        
        # Reactivate
        response = client.patch("/api/v1/providers/AS3210/reactivate")
        
        assert response.status_code == 200
        data = response.json()
        assert data["doc_number"] == "AS3210"
        assert data["is_active"] is True
        
        # Verify in database
        get_response = client.get("/api/v1/providers/AS3210")
        assert get_response.status_code == 200
        assert get_response.json()["is_active"] is True
    
    def test_reactivate_provider_already_active(self, client: TestClient):
        """Test reactivating an already active provider returns 400"""
        
        # Create a provider (starts active)
        payload = {
            "name": "Dr. Riya Patel",
            "specialization": "Neurology",
            "phone": "9876549876",
            "email": "riya@hospital.com",
            "post": "MS"
        }
        client.post("/api/v1/providers/", json=payload)
        
        # Try to reactivate (already active)
        response = client.patch("/api/v1/providers/RP9876/reactivate")
        
        assert response.status_code == 400
        assert "already active" in response.json()["detail"].lower()
    
    def test_reactivate_provider_not_found(self, client: TestClient):
        """Test reactivating a provider that doesn't exist returns 404"""
        
        response = client.patch("/api/v1/providers/AS9999/reactivate")
        
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()
        assert "AS9999" in response.json()["detail"]
    
    def test_reactivate_provider_preserves_other_fields(self, client: TestClient):
        """Test that reactivation only changes is_active"""
        
        # Create a provider
        payload = {
            "name": "Dr. John Doe",
            "specialization": "Dermatology",
            "phone": "9876541234",
            "email": "john@hospital.com",
            "post": "MD"
        }
        create_response = client.post("/api/v1/providers/", json=payload)
        original_data = create_response.json()
        
        # Deactivate
        client.delete("/api/v1/providers/JD1234")
        
        # Reactivate
        client.patch("/api/v1/providers/JD1234/reactivate")
        
        # Get the provider
        get_response = client.get("/api/v1/providers/JD1234")
        data = get_response.json()
        
        # Verify only is_active changed back
        assert data["name"] == original_data["name"]
        assert data["specialization"] == original_data["specialization"]
        assert data["phone"] == original_data["phone"]
        assert data["email"] == original_data["email"]
        assert data["post"] == original_data["post"]
        assert data["is_active"] is True
    
    # DEACTIVATE + REACTIVATE CYCLE TESTS
    
    def test_deactivate_reactivate_cycle(self, client: TestClient):
        """Test full deactivate → reactivate cycle"""
        
        # Create a provider
        payload = {
            "name": "Dr. Test Doctor",
            "specialization": "Test",
            "phone": "9876549999",
            "email": "test@hospital.com",
            "post": "MD"
        }
        client.post("/api/v1/providers/", json=payload)
        
        # Initial state: active
        get_response = client.get("/api/v1/providers/TD9999")
        assert get_response.json()["is_active"] is True
        
        # Deactivate
        client.delete("/api/v1/providers/TD9999")
        get_response = client.get("/api/v1/providers/TD9999")
        assert get_response.json()["is_active"] is False
        
        # Reactivate
        client.patch("/api/v1/providers/TD9999/reactivate")
        get_response = client.get("/api/v1/providers/TD9999")
        assert get_response.json()["is_active"] is True
    
    def test_deactivate_provider_after_update(self, client: TestClient):
        """Test deactivating a provider after updating it"""
        
        # Create a provider
        payload = {
            "name": "Dr. Old Name",
            "specialization": "Old Specialty",
            "phone": "9876541111",
            "email": "old@hospital.com",
            "post": "MD"
        }
        client.post("/api/v1/providers/", json=payload)
        
        # Update the provider
        update_payload = {
            "name": "Dr. New Name",
            "specialization": "New Specialty"
        }
        client.put("/api/v1/providers/ON1111", json=update_payload)
        
        # Deactivate
        response = client.delete("/api/v1/providers/ON1111")
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Dr. New Name"
        assert data["specialization"] == "New Specialty"
        assert data["is_active"] is False

    # ============= RBAC & SECURITY TESTS =============

    def test_unauthenticated_cannot_create_provider(self, client: TestClient):
        """Security: Anonymous request cannot create provider"""
        anon_client = TestClient(client.app)
        response = anon_client.post("/api/v1/providers/", json={})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_receptionist_cannot_create_provider(self, client: TestClient, receptionist_auth_headers):
        """Security: Receptionist role cannot create provider (403 Forbidden)"""
        payload = {
            "name": "Dr. Unauthorized Doc",
            "specialization": "Cardiology",
            "phone": "9876543299",
            "post": "MD"
        }
        response = client.post("/api/v1/providers/", json=payload, headers=receptionist_auth_headers)
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "Not enough permissions" in response.json()["detail"]

    def test_doctor_cannot_create_provider(self, client: TestClient, doctor_auth_headers):
        """Security: Doctor role cannot create provider (403 Forbidden)"""
        payload = {
            "name": "Dr. Unauthorized Doc2",
            "specialization": "Cardiology",
            "phone": "9876543298",
            "post": "MD"
        }
        response = client.post("/api/v1/providers/", json=payload, headers=doctor_auth_headers)
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "Not enough permissions" in response.json()["detail"]

    def test_unauthenticated_cannot_list_providers(self, client: TestClient):
        """Security: Anonymous request cannot list providers"""
        anon_client = TestClient(client.app)
        response = anon_client.get("/api/v1/providers/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_doctor_can_list_providers(self, client: TestClient, doctor_auth_headers):
        """Clinical flow: Doctor can view provider directory"""
        response = client.get("/api/v1/providers/", headers=doctor_auth_headers)
        assert response.status_code == status.HTTP_200_OK

    def test_receptionist_can_list_providers(self, client: TestClient, receptionist_auth_headers):
        """Front desk flow: Receptionist can view provider directory"""
        response = client.get("/api/v1/providers/", headers=receptionist_auth_headers)
        assert response.status_code == status.HTTP_200_OK

    def test_doctor_cannot_update_provider(self, client: TestClient, doctor_auth_headers, active_provider):
        """Security: Doctor role cannot update provider profile"""
        response = client.put(
            f"/api/v1/providers/{active_provider.doc_number}",
            json={"name": "Dr. Hacked Name"},
            headers=doctor_auth_headers
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "Not enough permissions" in response.json()["detail"]

    def test_receptionist_cannot_update_provider(self, client: TestClient, receptionist_auth_headers, active_provider):
        """Security: Receptionist role cannot update provider profile"""
        response = client.put(
            f"/api/v1/providers/{active_provider.doc_number}",
            json={"name": "Dr. Hacked Name"},
            headers=receptionist_auth_headers
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "Not enough permissions" in response.json()["detail"]

    def test_doctor_cannot_deactivate_provider(self, client: TestClient, doctor_auth_headers, active_provider):
        """Security: Doctor role cannot deactivate provider"""
        response = client.delete(
            f"/api/v1/providers/{active_provider.doc_number}",
            headers=doctor_auth_headers
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "Not enough permissions" in response.json()["detail"]

    def test_receptionist_cannot_deactivate_provider(self, client: TestClient, receptionist_auth_headers, active_provider):
        """Security: Receptionist role cannot deactivate provider"""
        response = client.delete(
            f"/api/v1/providers/{active_provider.doc_number}",
            headers=receptionist_auth_headers
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "Not enough permissions" in response.json()["detail"]

    def test_doctor_cannot_reactivate_provider(self, client: TestClient, doctor_auth_headers, inactive_provider):
        """Security: Doctor role cannot reactivate provider"""
        response = client.patch(
            f"/api/v1/providers/{inactive_provider.doc_number}/reactivate",
            headers=doctor_auth_headers
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "Not enough permissions" in response.json()["detail"]

    def test_receptionist_cannot_reactivate_provider(self, client: TestClient, receptionist_auth_headers, inactive_provider):
        """Security: Receptionist role cannot reactivate provider"""
        response = client.patch(
            f"/api/v1/providers/{inactive_provider.doc_number}/reactivate",
            headers=receptionist_auth_headers
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "Not enough permissions" in response.json()["detail"]

    # ============= AUDIT TRAIL TESTS =============

    def test_create_provider_sets_audit_fields(self, client: TestClient, admin_user):
        """Audit: Creating provider records created_by_id and updated_by_id"""
        payload = {
            "name": "Dr. Audit Check",
            "specialization": "Oncology",
            "phone": "9876500001",
            "post": "MD"
        }
        response = client.post("/api/v1/providers/", json=payload)
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["created_by_id"] == admin_user.id
        assert data["updated_by_id"] == admin_user.id

    def test_update_provider_updates_audit_field(self, client: TestClient, active_provider, admin_user):
        """Audit: Updating provider updates updated_by_id"""
        response = client.put(
            f"/api/v1/providers/{active_provider.doc_number}",
            json={"specialization": "Pediatric Cardiology"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["updated_by_id"] == admin_user.id

    def test_deactivate_provider_updates_audit_field(self, client: TestClient, active_provider, admin_user):
        """Audit: Deactivating provider updates updated_by_id"""
        response = client.delete(f"/api/v1/providers/{active_provider.doc_number}")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["updated_by_id"] == admin_user.id

    def test_reactivate_provider_updates_audit_field(self, client: TestClient, inactive_provider, admin_user):
        """Audit: Reactivating provider updates updated_by_id"""
        response = client.patch(f"/api/v1/providers/{inactive_provider.doc_number}/reactivate")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["updated_by_id"] == admin_user.id
