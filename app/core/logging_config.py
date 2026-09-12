import logging
import sys
from typing import Optional

from app.core.config import settings


LOG_LEVELS = {
    "development": logging.DEBUG,
    "production": logging.INFO,
    "testing": logging.WARNING,
}


def get_log_level() -> int:
    if settings.debug:
        return LOG_LEVELS["development"]
    return LOG_LEVELS["production"]


def get_formatter() -> logging.Formatter:
    if settings.debug:
        return logging.Formatter(
            fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    return logging.Formatter(
        fmt='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}',
        datefmt="%Y-%m-%dT%H:%M:%S",
    )


def get_console_handler() -> logging.StreamHandler:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(get_formatter())
    return handler


def setup_logging() -> None:
    root_logger = logging.getLogger()
    root_logger.setLevel(get_log_level())

    root_logger.handlers = [
        h for h in root_logger.handlers 
        if h.__class__.__name__ == "LogCaptureHandler"
    ]

    root_logger.addHandler(get_console_handler())

    app_logger = logging.getLogger("app")
    app_logger.setLevel(get_log_level())

    logging.getLogger("uvicorn").setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


def get_logger(name: Optional[str] = None) -> logging.Logger:
    if name is None:
        return logging.getLogger("app")
    if not name.startswith("app"):
        name = f"app.{name}"
    return logging.getLogger(name)