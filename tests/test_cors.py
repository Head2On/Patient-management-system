from fastapi.testclient import TestClient

from app.main import app


class TestCORS:

    def test_preflight_options_returns_200(self, client):
        """Preflight request succeeds"""
        response = client.options(
            "/api/v1/users/login",
            headers={
                "Origin": "https://example.com",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert response.status_code == 200

    def test_preflight_returns_cors_headers(self, client):
        """Preflight response includes the required CORS headers"""
        response = client.options(
            "/api/v1/users/login",
            headers={
                "Origin": "https://example.com",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert "access-control-allow-origin" in response.headers
        assert "access-control-allow-methods" in response.headers
        assert "access-control-allow-credentials" in response.headers

    def test_allow_origin_reflects_request_origin(self, client):
        """With allow_credentials=True, the origin is reflected, not '*'"""
        response = client.options(
            "/api/v1/users/login",
            headers={
                "Origin": "https://example.com",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert response.headers["access-control-allow-origin"] == "https://example.com"

    def test_simple_request_has_cors_header(self, client):
        """A normal GET with Origin gets the CORS header back"""
        response = client.get(
            "/",
            headers={"Origin": "https://example.com"},
        )
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") == "https://example.com"