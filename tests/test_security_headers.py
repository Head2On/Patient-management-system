import pytest

from app.core.config import settings


class TestSecurityHeaders:

    def test_x_content_type_options(self, client):
        response = client.get("/")
        assert response.headers.get("x-content-type-options") == "nosniff"

    def test_x_frame_options(self, client):
        response = client.get("/")
        assert response.headers.get("x-frame-options") == "DENY"

    def test_referrer_policy(self, client):
        response = client.get("/")
        assert response.headers.get("referrer-policy") == "strict-origin-when-cross-origin"

    def test_permissions_policy(self, client):
        response = client.get("/")
        assert response.headers.get("permissions-policy") == "geolocation=(), microphone=(), camera=()"

    def test_hsts_absent_in_debug(self, client, monkeypatch):
        monkeypatch.setattr(settings, "debug", True)
        response = client.get("/")
        assert "strict-transport-security" not in response.headers

    def test_hsts_present_in_production(self, client, monkeypatch):
        monkeypatch.setattr(settings, "debug", False)
        response = client.get("/")
        assert response.headers.get("strict-transport-security") == (
            "max-age=31536000; includeSubDomains"
        )

    def test_headers_present_on_error_response(self, client):
        response = client.get("/this-path-does-not-exist")
        assert response.headers.get("x-content-type-options") == "nosniff"
        assert response.headers.get("x-frame-options") == "DENY"