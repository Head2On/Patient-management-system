import logging
import pytest 

from app.core.logging_config import (
    LOG_LEVELS,
    get_log_level,
    get_formatter,
    get_console_handler,
    setup_logging,
    get_logger,
)
from app.core.config import settings


class TestLogLevel:

    def test_get_log_level_debug(self, monkeypatch):
        monkeypatch.setattr(settings, "debug", True)
        assert get_log_level() == logging.DEBUG

    def test_get_log_level_production(self, monkeypatch):
        monkeypatch.setattr(settings, "debug", False)
        assert get_log_level() == logging.INFO

    def test_log_levels_mapping(self):
        assert LOG_LEVELS["development"] == logging.DEBUG
        assert LOG_LEVELS["production"] == logging.INFO
        assert LOG_LEVELS["testing"] == logging.WARNING


class TestFormatter:

    def test_get_formatter_debug(self, monkeypatch):
        monkeypatch.setattr(settings, "debug", True)
        formatter = get_formatter()
        assert isinstance(formatter, logging.Formatter)
        assert "asctime" in formatter._fmt
        assert "levelname" in formatter._fmt
        assert "name" in formatter._fmt
        assert "message" in formatter._fmt

    def test_get_formatter_production(self, monkeypatch):
        monkeypatch.setattr(settings, "debug", False)
        formatter = get_formatter()
        assert isinstance(formatter, logging.Formatter)
        assert '"time"' in formatter._fmt
        assert '"level"' in formatter._fmt
        assert '"logger"' in formatter._fmt
        assert '"message"' in formatter._fmt

    def test_formatter_formats_record_debug(self, monkeypatch):
        monkeypatch.setattr(settings, "debug", True)
        formatter = get_formatter()
        record = logging.LogRecord(
            name="app.test",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg="hello",
            args=(),
            exc_info=None,
        )
        output = formatter.format(record)
        assert "app.test" in output
        assert "hello" in output
        assert "INFO" in output

    def test_formatter_formats_record_production(self, monkeypatch):
        import json
        monkeypatch.setattr(settings, "debug", False)
        formatter = get_formatter()
        record = logging.LogRecord(
            name="app.test",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg="hello",
            args=(),
            exc_info=None,
        )
        output = formatter.format(record)
        data = json.loads(output)
        assert data["level"] == "INFO"
        assert data["logger"] == "app.test"
        assert data["message"] == "hello"


class TestConsoleHandler:

    def test_get_console_handler_returns_handler(self):
        handler = get_console_handler()
        assert isinstance(handler, logging.StreamHandler)

    def test_console_handler_has_formatter(self):
        handler = get_console_handler()
        assert handler.formatter is not None


class TestSetupLogging:

    def test_setup_logging_configures_root(self, monkeypatch):
        monkeypatch.setattr(settings, "debug", True)
        setup_logging()
        root = logging.getLogger()
        assert root.level == logging.DEBUG
        assert len(root.handlers) >= 1

    def test_setup_logging_production_level(self, monkeypatch):
        monkeypatch.setattr(settings, "debug", False)
        setup_logging()
        root = logging.getLogger()
        assert root.level == logging.INFO

    def test_setup_logging_is_idempotent(self, monkeypatch):
        monkeypatch.setattr(settings, "debug", True)
        setup_logging()
        handler_count_first = len(logging.getLogger().handlers)
        setup_logging()
        handler_count_second = len(logging.getLogger().handlers)
        assert handler_count_first == handler_count_second

    def test_setup_logging_configures_app_logger(self, monkeypatch):
        monkeypatch.setattr(settings, "debug", True)
        setup_logging()
        app_logger = logging.getLogger("app")
        assert app_logger.level == logging.DEBUG

    def test_setup_logging_silences_uvicorn_access(self):
        setup_logging()
        assert logging.getLogger("uvicorn.access").level == logging.WARNING

    def test_setup_logging_silences_sqlalchemy(self):
        setup_logging()
        assert logging.getLogger("sqlalchemy.engine").level == logging.WARNING


class TestGetLogger:

    def test_get_logger_no_name(self):
        logger = get_logger()
        assert logger.name == "app"

    def test_get_logger_with_name(self):
        logger = get_logger("services.user")
        assert logger.name == "app.services.user"

    def test_get_logger_already_prefixed(self):
        logger = get_logger("app.services.user")
        assert logger.name == "app.services.user"

    def test_get_logger_returns_logger_instance(self):
        logger = get_logger("test")
        assert isinstance(logger, logging.Logger)

    def test_get_logger_same_name_same_instance(self):
        logger1 = get_logger("same")
        logger2 = get_logger("same")
        assert logger1 is logger2

    def test_get_logger_can_log_info(self, caplog):
        setup_logging()
        logger = get_logger("test.logging")
        with caplog.at_level(logging.INFO, logger="app.test.logging"):
            logger.info("test message")
        assert "test message" in caplog.text

    def test_logger_respects_level(self, monkeypatch, caplog):
        monkeypatch.setattr(settings, "debug", False)
        setup_logging()
        logger = get_logger("test.level")
        with caplog.at_level(logging.INFO, logger="app.test.level"):
            logger.debug("should not appear")
            logger.info("should appear")
        assert "should appear" in caplog.text
        assert "should not appear" not in caplog.text

    def test_logger_debug_visible_in_debug(self, monkeypatch, caplog):
        monkeypatch.setattr(settings, "debug", True)
        setup_logging()
        logger = get_logger("test.debug")
        with caplog.at_level(logging.DEBUG, logger="app.test.debug"):
            logger.debug("debug message")
        assert "debug message" in caplog.text