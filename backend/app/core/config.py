from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    database_url: str = "postgresql+asyncpg://trade:trade@postgres:5432/trade_system"
    redis_url: str = "redis://redis:6379/0"

    ai_models_api_url: str | None = None
    ai_models_token: str | None = None
    ai_models_model: str = "gpt-5.2"

    # Auth / JWT
    auth_jwt_secret: str = Field(default="dev-insecure-secret-change-me")
    auth_jwt_issuer: str = "trade-system"
    auth_jwt_audience: str = "trade-system-web"
    auth_access_token_ttl_minutes: int = 60 * 24 * 7

    # Auth / Google OAuth (optional)
    google_oauth_client_id: str | None = None
    google_oauth_client_secret: str | None = None
    google_oauth_redirect_uri: str | None = None
    frontend_base_url: str = "http://localhost:8080"

    # Auth / Email login (magic link) (optional)
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_starttls: bool = True
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    email_login_token_ttl_minutes: int = 15
    
    # Freqtrade user_data path for backtest results
    # In Docker: /freqtrade/user_data (from env var FREQTRADE_USER_DATA)
    # For dev: /workspaces/TRADE_SYSTEM/freqtrade/user_data
    freqtrade_user_data: str = "/freqtrade/user_data"

    # Host-visible path for docker bind-mounts when we launch `docker run`.
    # Important: docker bind sources are resolved by the docker daemon, not by this container.
    # In this devcontainer, the docker daemon can typically see /workspaces/TRADE_SYSTEM.
    freqtrade_user_data_host: str | None = None

    # Freqtrade API (for syncing real trades)
    # In docker-compose network backend can reach http://freqtrade:8080
    freqtrade_api_url: str = "http://freqtrade:8080"
    freqtrade_api_username: str = "freqtrade"
    freqtrade_api_password: str = "freqtrade"

    # Analysis execution
    # If True, the API process will execute analysis runs in-process after enqueue.
    # Default is False: use the dedicated Redis worker.
    analysis_inline_execution: bool = False


settings = Settings()
