from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    """
    Глобальные настройки приложения (Core Layer).
    Все переменные окружения валидируются здесь.
    """
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Базовые настройки
    project_name: str = "TRADE_SYSTEM"
    version: str = "2.0.0"
    api_v1_str: str = "/api/v1"

    # База данных и Кэш
    database_url: str = "postgresql+asyncpg://trade:trade@postgres:5432/trade_system"
    redis_url: str = "redis://redis:6379/0"

    # AI Интеграция
    ai_models_api_url: str | None = None
    ai_models_token: str | None = None
    ai_models_model: str = "gpt-5.2"

    # Безопасность (JWT)
    auth_jwt_secret: str = Field(default="dev-insecure-secret-change-me")
    auth_jwt_issuer: str = "trade-system"
    auth_jwt_audience: str = "trade-system-web"
    auth_access_token_ttl_minutes: int = 60 * 24 * 7

    # OAuth и Frontend
    google_oauth_client_id: str | None = None
    google_oauth_client_secret: str | None = None
    google_oauth_redirect_uri: str | None = None
    frontend_base_url: str = "http://localhost:8080"

    # SMTP (Email)
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_starttls: bool = True
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    email_login_token_ttl_minutes: int = 15
    
    # Интеграция с Freqtrade (Smart Wrapper)
    freqtrade_user_data: str = "/freqtrade/user_data"
    freqtrade_user_data_host: str | None = None
    freqtrade_api_url: str = "http://freqtrade:8080"
    freqtrade_api_username: str = "freqtrade"
    freqtrade_api_password: str = "freqtrade"

    # Воркеры
    analysis_inline_execution: bool = False


settings = Settings()
