from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


GraphScope = Literal["user", "bot", "strategy", "model", "alignment"]
GraphRunStatus = Literal["queued", "running", "completed", "failed"]


class NodeGraphCreate(BaseModel):
    name: str
    description: str | None = None
    scope: GraphScope = "user"
    owner_id: str | None = None
    is_active: bool = True


class NodeGraphOut(BaseModel):
    graph_id: str
    user_id: str
    name: str
    description: str | None = None
    scope: str
    owner_id: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class NodeGraphListOut(BaseModel):
    items: list[NodeGraphOut]
    total: int
    limit: int
    offset: int


class NodeGraphVersionCreate(BaseModel):
    definition: dict[str, Any] = Field(default_factory=dict)


class NodeGraphVersionOut(BaseModel):
    version_id: str
    graph_id: str
    version: int
    definition: dict[str, Any]
    created_at: datetime

    class Config:
        from_attributes = True


class NodeGraphVersionListOut(BaseModel):
    items: list[NodeGraphVersionOut]
    total: int
    limit: int
    offset: int


class NodeGraphRunCreate(BaseModel):
    version_id: str | None = None  # if None, use latest
    inputs: dict[str, Any] = Field(default_factory=dict)
    enqueue: bool = True
    idempotency_key: str | None = None


class GraphTemplateAlignmentBacktestCreate(BaseModel):
    alignment_id: str
    timerange: str | None = None
    name: str | None = None
    description: str | None = None
    enqueue: bool = True
    idempotency_key: str | None = None


class NodeGraphTemplateOut(BaseModel):
    kind: str
    name: str
    description: str | None = None
    required_inputs: list[str] = Field(default_factory=list)
    optional_inputs: list[str] = Field(default_factory=list)


class NodeGraphTemplateListOut(BaseModel):
    items: list[NodeGraphTemplateOut]
    total: int


class NodeGraphRunOut(BaseModel):
    run_id: str
    graph_id: str
    version_id: str
    user_id: str
    status: GraphRunStatus
    inputs: dict[str, Any]
    outputs: dict[str, Any]
    error_message: str | None = None
    idempotency_key: str | None = None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None

    class Config:
        from_attributes = True


class NodeGraphRunListOut(BaseModel):
    items: list[NodeGraphRunOut]
    total: int
    limit: int
    offset: int


class NodeGraphRunProgressOut(BaseModel):
    run_id: str
    status: GraphRunStatus
    updated_at: datetime
    completed_at: datetime | None = None
    error_message: str | None = None
    redis_status: str | None = None


class NodeGraphRunStaleOut(BaseModel):
    run: NodeGraphRunOut
    heartbeat_at: datetime | None = None
    heartbeat_age_seconds: int | None = None
    is_stale: bool


class NodeGraphRunStaleListOut(BaseModel):
    items: list[NodeGraphRunStaleOut]
    total_running: int


class NodeGraphRunNodeOut(BaseModel):
    run_node_id: str
    run_id: str
    node_id: str
    kind: str
    status: str
    inputs: dict[str, Any]
    outputs: dict[str, Any]
    error_message: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    updated_at: datetime
    completed_at: datetime | None = None

    class Config:
        from_attributes = True


class NodeGraphRunNodeListOut(BaseModel):
    items: list[NodeGraphRunNodeOut]
    total: int

class NodeGraphRunNodeTimingOut(BaseModel):
    node_id: str
    kind: str
    status: str
    duration_ms: int | None = None


class NodeGraphRunExecutionStatsOut(BaseModel):
    total_nodes: int
    status_counts: dict[str, int]
    run_duration_ms: int | None = None


class NodeGraphRunExecutionOut(BaseModel):
    run: NodeGraphRunOut
    nodes: list[NodeGraphRunNodeOut]
    # Optional to keep backward compatibility with older internal callers/tests.
    stats: NodeGraphRunExecutionStatsOut | None = None
    timings: list[NodeGraphRunNodeTimingOut] = Field(default_factory=list)


class NodeKindCapabilitiesOut(BaseModel):
    side_effects: bool = False
    idempotent: bool = False
    long_running: bool = False


class NodeKindMetaOut(BaseModel):
    kind: str
    label: str
    category: str
    description: str | None = None
    hidden: bool = False
    inputs: list[str] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)
    capabilities: NodeKindCapabilitiesOut = Field(default_factory=NodeKindCapabilitiesOut)


class NodeKindMetaListOut(BaseModel):
    items: list[NodeKindMetaOut]
    total: int
