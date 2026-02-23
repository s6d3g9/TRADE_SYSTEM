from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"
    __table_args__ = (
        Index("ix_analysis_runs_user_created", "user_id", "created_at"),
        Index("ix_analysis_runs_kind", "kind"),
        Index("ix_analysis_runs_status", "status"),
    )

    run_id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)

    kind: Mapped[str] = mapped_column(String, nullable=False, server_default="compare")  # compare|diagnose|tune
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="queued")  # queued|running|completed|failed

    inputs: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    outputs: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    evidence: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    error_message: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    suggestions: Mapped[list["TuningSuggestion"]] = relationship(
        "TuningSuggestion", back_populates="run", lazy="noload", cascade="all, delete-orphan"
    )


class TuningSuggestion(Base):
    __tablename__ = "tuning_suggestions"
    __table_args__ = (
        Index("ix_tuning_suggestions_run", "run_id"),
        Index("ix_tuning_suggestions_state", "state"),
        Index("ix_tuning_suggestions_target", "target_scope", "owner_id"),
    )

    suggestion_id: Mapped[str] = mapped_column(String, primary_key=True)

    run_id: Mapped[str] = mapped_column(String, ForeignKey("analysis_runs.run_id", ondelete="CASCADE"), nullable=False)

    target_scope: Mapped[str] = mapped_column(String, nullable=False)  # strategy|model|alignment
    owner_id: Mapped[str] = mapped_column(String, nullable=False)

    base_config_id: Mapped[str | None] = mapped_column(String, ForeignKey("config_files.config_id", ondelete="SET NULL"), nullable=True)
    proposed_config_id: Mapped[str | None] = mapped_column(String, ForeignKey("config_files.config_id", ondelete="SET NULL"), nullable=True)

    proposed_patch: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    expected_impact: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    risk_notes: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    state: Mapped[str] = mapped_column(String, nullable=False, server_default="draft")  # draft|accepted|rejected|superseded

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    run: Mapped["AnalysisRun"] = relationship("AnalysisRun", back_populates="suggestions", lazy="selectin")
