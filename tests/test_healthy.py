from fastapi.testclient import TestClient
from unittest.mock import patch
from sqlalchemy.exc import OperationalError

from app.main import app


class TestHealth:

    def test_health_returns_ok(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_health_does_not_require_auth(self, client):
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_has_security_headers(self, client):
        response = client.get("/health")
        assert response.headers.get("x-content-type-options") == "nosniff"


class TestReady:

    def test_ready_returns_ok_when_all_up(self, client):
        response = client.get("/ready")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ok"
        assert body["checks"]["database"] == "ok"
        assert body["checks"]["redis"] == "ok"

    def test_ready_includes_checks_object(self, client):
        response = client.get("/ready")
        body = response.json()
        assert "checks" in body
        assert "database" in body["checks"]
        assert "redis" in body["checks"]

    def test_ready_returns_503_when_redis_down(self, client):
        with patch("app.api.routes.healthy.redis_client.ping", return_value=False):
            response = client.get("/ready")
            assert response.status_code == 503
            body = response.json()
            assert body["status"] == "unavailable"
            assert body["checks"]["redis"] == "error"
            assert body["checks"]["database"] == "ok"

    def test_ready_returns_503_when_db_down(self, client):
        with patch(
            "sqlalchemy.orm.Session.execute",
            side_effect=OperationalError("mock", None, None),
        ):
            response = client.get("/ready")
            assert response.status_code == 503
            body = response.json()
            assert body["status"] == "unavailable"
            assert body["checks"]["database"] == "error"