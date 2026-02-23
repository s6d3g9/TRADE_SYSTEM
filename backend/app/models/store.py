from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class StoreItem(Base):
    __tablename__ = "store_items"
    __table_args__ = (
        UniqueConstraint("item_type", "strategy_id", name="uq_store_items_type_strategy"),
        UniqueConstraint("item_type", "model_id", name="uq_store_items_type_model"),
        Index("ix_store_items_active_type", "is_active", "item_type"),
    )

    item_id: Mapped[str] = mapped_column(String, primary_key=True)

    # "strategy" | "model"
    item_type: Mapped[str] = mapped_column(String, nullable=False)

    strategy_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("strategy_templates.strategy_id", ondelete="CASCADE"), nullable=True, index=True
    )
    model_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("freqai_model_variants.model_id", ondelete="CASCADE"), nullable=True, index=True
    )

    slug: Mapped[str] = mapped_column(String, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)

    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    meta: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    # Display-only pricing metadata (no payment integration in MVP).
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    currency: Mapped[str] = mapped_column(String, nullable=False, server_default="USD")

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class StorePurchase(Base):
    __tablename__ = "store_purchases"
    __table_args__ = (
        UniqueConstraint("item_id", "user_id", name="uq_store_purchases_item_user"),
        Index("ix_store_purchases_item", "item_id"),
        Index("ix_store_purchases_user", "user_id"),
    )

    purchase_id: Mapped[str] = mapped_column(String, primary_key=True)

    item_id: Mapped[str] = mapped_column(String, ForeignKey("store_items.item_id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
