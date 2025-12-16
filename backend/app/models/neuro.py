from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class NeuroProvider(Base):
    __tablename__ = "neuro_providers"

    provider_id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    module_type: Mapped[str] = mapped_column(String, nullable=False)
    connector: Mapped[str] = mapped_column(String, nullable=False)
    connector_config: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    scope: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    defaults: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    mapping: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    health_status: Mapped[str] = mapped_column(String, nullable=False, server_default="unknown")
    last_seen_ts: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    errors_5m: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    latency_ms_avg: Mapped[float | None] = mapped_column(Float, nullable=True)
    stale_rate_5m: Mapped[float] = mapped_column(Float, nullable=False, server_default="0")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ProviderBinding(Base):
    __tablename__ = "provider_bindings"

    binding_id: Mapped[str] = mapped_column(String, primary_key=True)
    bot_id: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    provider_id: Mapped[str | None] = mapped_column(String, ForeignKey("neuro_providers.provider_id", ondelete="SET NULL"))
    overrides: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
