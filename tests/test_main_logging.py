import logging
import pytest
from fastapi.testclient import TestClient

from app.main import app


class TestStartupLogging:

    def test_app_starts_with_logging_configured(self):
        with TestClient(app):
            root = logging.getLogger()
            assert root.level in (logging.DEBUG, logging.INFO)
            assert len(root.handlers) >= 1

    def test_app_logger_configured_on_startup(self):
        with TestClient(app):
            app_logger = logging.getLogger("app")
            assert app_logger.level in (logging.DEBUG, logging.INFO)

    def test_app_startup_logs(self, caplog):
        with caplog.at_level(logging.INFO, logger="app.main"):
            with TestClient(app):
                pass
        assert "Starting Patient Management System" in caplog.text

    def test_app_shutdown_logs(self, caplog):
        with caplog.at_level(logging.INFO, logger="app.main"):
            with TestClient(app):
                pass
        assert "Shutting down Patient Management System" in caplog.text

    def test_app_starts_and_serves_request(self):
        with TestClient(app) as client:
            response = client.get("/")
            assert response.status_code == 200
            assert response.json()["message"] == "Patient Management System API"