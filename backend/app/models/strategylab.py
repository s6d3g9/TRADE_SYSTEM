from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, new_id

if TYPE_CHECKING:
    from app.models.trading import Bot, Backtest


class StrategyTemplate(Base, TimestampMixin):
    __tablename__ = "strategy_templates"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_strategy_templates_slug"),
    )

    strategy_id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    slug: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)

    source_type: Mapped[str] = mapped_column(String, nullable=False, server_default="git")
    source_url: Mapped[str] = mapped_column(String, nullable=False)
    source_ref: Mapped[str | None] = mapped_column(String, nullable=True)

    strategy_class: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    meta: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)



class FreqAIModelVariant(Base, TimestampMixin):
    __tablename__ = "freqai_model_variants"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_freqai_model_variants_slug"),
    )

    model_id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    slug: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)

    algorithm: Mapped[str] = mapped_column(String, nullable=False)  # e.g. xgboost
    config: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)



class StrategyAlignment(Base, TimestampMixin):
    __tablename__ = "strategy_alignments"

    __table_args__ = (
        CheckConstraint("status IN ('draft','active','archived')", name="ck_strategy_alignments_status"),
    )

    alignment_id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)

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


    # Relationships
    bots: Mapped[list["Bot"]] = relationship("Bot", back_populates="alignment", lazy="noload")
    backtests: Mapped[list["Backtest"]] = relationship("Backtest", back_populates="alignment", lazy="noload")


class ConfigFile(Base, TimestampMixin):
    """Версионированные конфигурации для стратегий, моделей и сонастроек.
    
    Поддерживает:
    - regime: bull, bear, flat, regular (режим рынка)
    - kind: base, variant (тип конфига)
    - parent_config_id: ссылка на базовый конфиг (для вариаций)
    """
    __tablename__ = "config_files"
    __table_args__ = (
        Index("ix_config_files_scope_owner", "scope", "owner_id"),
        Index("ix_config_files_owner_active", "scope", "owner_id", "is_active"),
        Index("ix_config_files_regime", "regime"),
        Index("ix_config_files_kind", "kind"),
        CheckConstraint("scope IN ('strategy','model','alignment')", name="ck_config_files_scope"),
        CheckConstraint("regime IN ('bull','bear','flat','regular')", name="ck_config_files_regime"),
        CheckConstraint("kind IN ('base','variant')", name="ck_config_files_kind"),
    )

    config_id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    scope: Mapped[str] = mapped_column(String, nullable=False)  # strategy, model, alignment
    owner_id: Mapped[str] = mapped_column(String, nullable=False)  # strategy_id, model_id, alignment_id
    name: Mapped[str] = mapped_column(String, nullable=False, server_default="config.json")
    content: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    # Новые поля согласно README_DATA_STORAGE_STRATEGIES.md
    regime: Mapped[str] = mapped_column(String, nullable=False, server_default="regular")  # bull, bear, flat, regular
    kind: Mapped[str] = mapped_column(String, nullable=False, server_default="base")  # base, variant
    parent_config_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("config_files.config_id", ondelete="SET NULL"), nullable=True, index=True
    )


    # Self-referential relationship для дерева base → variants
    parent: Mapped["ConfigFile | None"] = relationship(
        "ConfigFile", remote_side="ConfigFile.config_id", back_populates="variants", lazy="selectin"
    )
    variants: Mapped[list["ConfigFile"]] = relationship(
        "ConfigFile", back_populates="parent", lazy="noload"
    )

    # Materialized tabular parameters for this config version
    params: Mapped[list["ConfigParam"]] = relationship(
        "ConfigParam", back_populates="config_file", lazy="noload", cascade="all, delete-orphan"
    )


class ConfigParam(Base, TimestampMixin):
    """Materialized (path,value) rows for a specific ConfigFile version.

    The UI can use these rows for table editing and diffing.
    """

    __tablename__ = "config_params"
    __table_args__ = (
        UniqueConstraint("config_id", "path", name="uq_config_params_config_path"),
        Index("ix_config_params_config", "config_id"),
        Index("ix_config_params_path", "path"),
    )

    param_id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    config_id: Mapped[str] = mapped_column(
        String, ForeignKey("config_files.config_id", ondelete="CASCADE"), nullable=False
    )

    # Dot-path (dict only). Arrays are stored as JSON leaf values.
    path: Mapped[str] = mapped_column(String, nullable=False)
    value: Mapped[object] = mapped_column(JSON, nullable=False)
    value_type: Mapped[str] = mapped_column(String, nullable=False, server_default="json")


    config_file: Mapped["ConfigFile"] = relationship("ConfigFile", back_populates="params", lazy="selectin")
