import logging
import pytest
from fastapi.testclient import TestClient

from app.main import app


@app.get("/test-force-error")
def force_error():
    raise RuntimeError("Something went terribly wrong inside the app")


@app.get("/test-http-error")
def force_http_error():
    from fastapi import HTTPException
    raise HTTPException(status_code=404, detail="Resource not found")


@pytest.fixture
def client_raise_false():
    return TestClient(app, raise_server_exceptions=False)


class TestGlobalExceptionHandler:

    def test_unhandled_exception_returns_500(self, client_raise_false):
        response = client_raise_false.get("/test-force-error")
        assert response.status_code == 500

    def test_unhandled_exception_returns_clean_body(self, client_raise_false):
        response = client_raise_false.get("/test-force-error")
        assert response.json() == {"detail": "Internal server error"}

    def test_unhandled_exception_does_not_leak_traceback(self, client_raise_false):
        response = client_raise_false.get("/test-force-error")
        body = response.text
        assert "RuntimeError" not in body
        assert "Traceback" not in body
        assert "Something went terribly wrong inside the app" not in body
        assert "site-packages" not in body

    def test_unhandled_exception_is_logged(self, client_raise_false, caplog):
        with caplog.at_level(logging.ERROR, logger="app.main"):
            client_raise_false.get("/test-force-error")
        assert "Unhandled exception on GET /test-force-error" in caplog.text
        assert "Something went terribly wrong inside the app" in caplog.text

    def test_http_exception_still_works(self, client):
        response = client.get("/test-http-error")
        assert response.status_code == 404
        assert response.json() == {"detail": "Resource not found"}

    def test_validation_error_still_works(self, client):
        response = client.post(
            "/api/v1/users/login",
            json={"phone": "not-a-phone"},
        )
        assert response.status_code == 422
        body = response.json()
        assert "detail" in body
        assert body["detail"] != "Internal server error"

    def test_normal_request_unaffected(self, client):
        response = client.get("/")
        assert response.status_code == 200
        assert response.json() == {"message": "Patient Management System API"}