
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Patient Management System"
    app_version: str = "1.0.0"
    debug: bool = False
    database_url: str
    test_database_url: str

    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    redis_url:str = "redis://localhost:6379"  

    login_rate_limit:int =  5
    login_rate_window: int = 300

    cors_origins: list[str] = ["*"]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

settings = Settings()



     
