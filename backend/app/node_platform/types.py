from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.graph import NodeGraphRun


JsonDict = dict[str, Any]


@dataclass(frozen=True, slots=True)
class NodeKindCapabilities:
    # Whether this node has side effects (writes to DB/files, triggers external actions, etc.)
    side_effects: bool = False
    # Whether re-running with the same inputs is expected to be safe.
    idempotent: bool = False
    # Whether this node can take a long time (seconds/minutes) and should be treated as such in UX.
    long_running: bool = False


@dataclass(frozen=True, slots=True)
class NodeKindMeta:
    kind: str
    label: str
    category: str
    description: str | None = None
    # If true, hide from user-facing catalogs (still available for execution/status).
    hidden: bool = False
    # Minimal contract for inspector/catalog. We keep it intentionally simple for now.
    inputs: tuple[str, ...] = ()
    outputs: tuple[str, ...] = ()
    capabilities: NodeKindCapabilities = NodeKindCapabilities()


@dataclass(frozen=True, slots=True)
class NodeExecutionContext:
    session: AsyncSession
    run: NodeGraphRun
    node_id: str
    kind: str
    node: JsonDict
    data: JsonDict
    inputs: JsonDict
