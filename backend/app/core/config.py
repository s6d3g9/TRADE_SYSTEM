from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    database_url: str = "postgresql+asyncpg://trade:trade@postgres:5432/trade_system"
    redis_url: str = "redis://redis:6379/0"


settings = Settings()
