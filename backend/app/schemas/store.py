from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class StoreItemOut(BaseModel):
    item_id: str
    item_type: str

    slug: str
    name: str
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    meta: dict[str, Any] = Field(default_factory=dict)

    price_cents: int = 0
    currency: str = "USD"

    is_active: bool = True

    purchaser_count: int = 0
    purchased: bool = False


class StorePurchaserOut(BaseModel):
    user_id: str
    email: str | None = None
    name: str | None = None
    purchased_at: datetime


class StoreItemDetailOut(StoreItemOut):
    purchasers: list[StorePurchaserOut] = Field(default_factory=list)
    latest_backtests: list[dict[str, Any]] = Field(default_factory=list)


class PurchaseOut(BaseModel):
    ok: bool
    item_id: str
    purchased_at: datetime
