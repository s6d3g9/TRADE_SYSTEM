from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class StrategyTemplate(Base):
    __tablename__ = "strategy_templates"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_strategy_templates_slug"),
    )

    strategy_id: Mapped[str] = mapped_column(String, primary_key=True)
    slug: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)

    source_type: Mapped[str] = mapped_column(String, nullable=False, server_default="git")
    source_url: Mapped[str] = mapped_column(String, nullable=False)
    source_ref: Mapped[str | None] = mapped_column(String, nullable=True)

    strategy_class: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    meta: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class FreqAIModelVariant(Base):
    __tablename__ = "freqai_model_variants"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_freqai_model_variants_slug"),
    )

    model_id: Mapped[str] = mapped_column(String, primary_key=True)
    slug: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)

    algorithm: Mapped[str] = mapped_column(String, nullable=False)  # e.g. xgboost
    config: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class StrategyAlignment(Base):
    __tablename__ = "strategy_alignments"

    alignment_id: Mapped[str] = mapped_column(String, primary_key=True)

    strategy_id: Mapped[str] = mapped_column(
        String, ForeignKey("strategy_templates.strategy_id", ondelete="CASCADE"), nullable=False, index=True
    )
    model_id: Mapped[str] = mapped_column(
        String, ForeignKey("freqai_model_variants.model_id", ondelete="RESTRICT"), nullable=False, index=True
    )

    profile: Mapped[str | None] = mapped_column(String, nullable=True)

    scope: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    defaults: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    mapping: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    freqtrade_overrides: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    freqai_overrides: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    status: Mapped[str] = mapped_column(String, nullable=False, server_default="draft")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
