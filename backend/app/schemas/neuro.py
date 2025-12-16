from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

Connector = Literal["internal", "redis", "http", "file"]


class NeuroProviderBase(BaseModel):
    provider_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    module_type: str = Field(min_length=1)
    connector: Connector
    connector_config: dict[str, Any] = Field(default_factory=dict)
    scope: dict[str, Any] | None = None
    defaults: dict[str, Any] | None = None
    mapping: dict[str, Any] | None = None


class NeuroProviderCreate(NeuroProviderBase):
    pass


class NeuroProviderUpdate(NeuroProviderBase):
    pass


class NeuroProviderOut(NeuroProviderBase):
    health_status: str
    last_seen_ts: datetime | None = None
    errors_5m: int | None = 0
    latency_ms_avg: float | None = None
    stale_rate_5m: float | None = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProviderHealth(BaseModel):
    provider_id: str
    status: str
    last_seen_ts: datetime | None = None
    errors_5m: int | None = 0
    latency_ms_avg: float | None = None
    stale_rate_5m: float | None = 0


class AttachProviderRequest(BaseModel):
    provider_id: str | None = Field(default=None, description="Provider to attach as default for this bot")
    overrides: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
