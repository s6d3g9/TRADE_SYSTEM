from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


AnalysisKind = Literal["compare", "diagnose", "tune"]
AnalysisStatus = Literal["queued", "running", "completed", "failed"]
SuggestionState = Literal["draft", "accepted", "rejected", "superseded"]
TargetScope = Literal["strategy", "model", "alignment"]


class AnalysisRunCreate(BaseModel):
    kind: AnalysisKind = "compare"

    # Flexible inputs payload; UI/agent can put bot_ids/backtest_ids/slices/etc.
    inputs: dict[str, Any] = Field(default_factory=dict)

    # Optional: if true, enqueue for execution immediately.
    enqueue: bool = True


class AnalysisRunOut(BaseModel):
    run_id: str
    user_id: str
    kind: str
    status: str
    inputs: dict[str, Any]
    outputs: dict[str, Any]
    evidence: dict[str, Any]
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


class AnalysisRunListOut(BaseModel):
    items: list[AnalysisRunOut]
    total: int
    limit: int
    offset: int


class AnalysisRunProgressOut(BaseModel):
    run_id: str

    # Durable status from Postgres
    status: AnalysisStatus
    updated_at: datetime
    completed_at: datetime | None = None
    error_message: str | None = None

    # Best-effort live status from Redis worker (may be None)
    redis_status: str | None = None


class SuggestionCreate(BaseModel):
    target_scope: TargetScope
    owner_id: str

    base_config_id: str | None = None

    # Either provide a proposed config directly (recommended for now)
    proposed_config_content: dict[str, Any] | None = None

    # Or provide a patch-like structure that the UI/agent understands
    proposed_patch: dict[str, Any] | None = None

    # Optional metadata
    expected_impact: dict[str, Any] = Field(default_factory=dict)
    risk_notes: dict[str, Any] = Field(default_factory=dict)

    # If true and proposed_config_content is given, mint a ConfigFile variant and link it.
    mint_config_variant: bool = True

    # Config variant metadata
    regime: str = "regular"


class SuggestionOut(BaseModel):
    suggestion_id: str
    run_id: str
    target_scope: str
    owner_id: str
    base_config_id: str | None = None
    proposed_config_id: str | None = None
    proposed_patch: dict[str, Any] | None = None
    expected_impact: dict[str, Any]
    risk_notes: dict[str, Any]
    state: str
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class SuggestionListOut(BaseModel):
    items: list[SuggestionOut]
    total: int
    limit: int
    offset: int


class SuggestionAcceptRequest(BaseModel):
    activate: bool = False
