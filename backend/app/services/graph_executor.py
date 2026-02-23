from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.graph import NodeGraphRun, NodeGraphRunNode, NodeGraphVersion
from app.node_platform.registry import get_default_node_registry
from app.node_platform.types import NodeExecutionContext
from app.services.graph_validation import missing_required_run_inputs


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _toposort(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> list[str]:
    node_ids = [str(n.get("id")) for n in nodes if n.get("id") is not None]
    indeg: dict[str, int] = {nid: 0 for nid in node_ids}
    out: dict[str, list[str]] = {nid: [] for nid in node_ids}

    for e in edges or []:
        src = e.get("source")
        dst = e.get("target")
        if src in out and dst in indeg:
            out[str(src)].append(str(dst))
            indeg[str(dst)] += 1

    q = [nid for nid, d in indeg.items() if d == 0]
    order: list[str] = []
    while q:
        nid = q.pop(0)
        order.append(nid)
        for nxt in out.get(nid, []):
            indeg[nxt] -= 1
            if indeg[nxt] == 0:
                q.append(nxt)

    # If cycle exists, fall back to original ordering.
    if len(order) != len(node_ids):
        return node_ids
    return order


def _extract_definition(defn: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    nodes = defn.get("nodes") or []
    edges = defn.get("edges") or []
    if not isinstance(nodes, list):
        nodes = []
    if not isinstance(edges, list):
        edges = []
    return nodes, edges


def _node_kind(node: dict[str, Any]) -> str:
    return str(node.get("type") or node.get("kind") or "noop")


def _node_data(node: dict[str, Any]) -> dict[str, Any]:
    data = node.get("data")
    return data if isinstance(data, dict) else {}


def _flow_outputs(raw: dict[str, Any]) -> dict[str, Any]:
        """Normalize node output for dataflow.

        Handlers may return a plain dict (legacy) or an envelope:
        {
            "outputs": {...},
            "meta": {...},
            "summary": "..."
        }

        For input collection and DAG wiring we only propagate the "outputs" dict.
        """

        outputs = raw.get("outputs")
        return outputs if isinstance(outputs, dict) else raw


def _collect_inputs_for_node(
    node_id: str,
    edges: list[dict[str, Any]],
    outputs_by_node: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    # Default behavior (back-compat): merge upstream outputs into a single dict.
    # If edges use ReactFlow-style handles, we route values into namespaces:
    # - sourceHandle selects a key from the source node outputs
    # - targetHandle writes into merged[targetHandle] instead of flat merging
    incoming = [e for e in edges if str(e.get("target")) == node_id]
    merged: dict[str, Any] = {}
    for e in incoming:
        src = str(e.get("source"))
        src_out = outputs_by_node.get(src, {})
        if not isinstance(src_out, dict):
            continue

        source_handle = e.get("sourceHandle")
        target_handle = e.get("targetHandle")

        selected: Any = src_out
        if source_handle is not None:
            selected = src_out.get(str(source_handle))

        if target_handle is not None:
            merged[str(target_handle)] = selected
            continue

        if isinstance(selected, dict):
            merged.update(selected)
        else:
            # Fallback: non-dict values are keyed by source node id.
            merged[src] = selected
    return merged


async def execute_graph_run(session: AsyncSession, run: NodeGraphRun) -> NodeGraphRun:
    version = await session.get(NodeGraphVersion, run.version_id)
    if not version:
        raise RuntimeError("graph version not found")

    # Lightweight template input validation (fail fast)
    meta = (version.definition or {}).get("meta")
    required_inputs: list[str] = []
    if isinstance(meta, dict):
        ri = meta.get("required_inputs")
        if isinstance(ri, list):
            required_inputs = [str(x) for x in ri]
        elif ri is None:
            # Back-compat: treat meta.inputs as required if required_inputs not provided.
            inputs = meta.get("inputs")
            if isinstance(inputs, list):
                required_inputs = [str(x) for x in inputs]

    missing = missing_required_run_inputs(required_inputs, run.inputs)
    if missing:
        msg = f"Missing required run.inputs keys: {', '.join(missing)}"
        now = _utcnow()
        run_node = NodeGraphRunNode(
            run_node_id=f"{run.run_id}:__validate_inputs__",
            run_id=run.run_id,
            node_id="__validate_inputs__",
            kind="system.validate_inputs",
            status="failed",
            inputs={"required": required_inputs, "provided": run.inputs or {}},
            outputs={},
            error_message=msg,
            started_at=now,
            completed_at=now,
            updated_at=now,
        )
        session.add(run_node)
        run.updated_at = _utcnow()
        await session.flush()
        raise ValueError(msg)

    nodes, edges = _extract_definition(version.definition or {})
    order = _toposort(nodes, edges)
    nodes_by_id: dict[str, dict[str, Any]] = {str(n.get("id")): n for n in nodes if n.get("id") is not None}

    outputs_by_node: dict[str, dict[str, Any]] = {}
    final_outputs: dict[str, Any] = {}

    registry = get_default_node_registry()

    for node_id in order:
        node = nodes_by_id.get(node_id)
        if not node:
            continue

        kind = _node_kind(node)
        data = _node_data(node)
        node_inputs = _collect_inputs_for_node(node_id, edges, outputs_by_node)

        now = _utcnow()
        run_node = NodeGraphRunNode(
            run_node_id=f"{run.run_id}:{node_id}",
            run_id=run.run_id,
            node_id=node_id,
            kind=kind,
            status="running",
            inputs=node_inputs,
            outputs={},
            started_at=now,
            updated_at=now,
        )
        session.add(run_node)
        await session.flush()

        try:
            ctx = NodeExecutionContext(
                session=session,
                run=run,
                node_id=node_id,
                kind=kind,
                node=node,
                data=data,
                inputs=node_inputs,
            )
            node_out = await registry.execute(ctx)
            flow_out = _flow_outputs(node_out)

            outputs_by_node[node_id] = flow_out
            final_outputs.update(flow_out)

            # Make partial progress visible even if a later node fails.
            run.outputs = {"__nodes__": dict(outputs_by_node), **dict(final_outputs)}
            run.updated_at = _utcnow()
            await session.flush()

            run_node.status = "completed"
            # Store full handler output (envelope or legacy dict)
            run_node.outputs = node_out
            run_node.completed_at = _utcnow()
            run_node.updated_at = _utcnow()
            await session.flush()
        except Exception as e:
            run_node.status = "failed"
            run_node.error_message = str(e)
            run_node.completed_at = _utcnow()
            run_node.updated_at = _utcnow()
            await session.flush()
            raise

    run.outputs = {"__nodes__": dict(outputs_by_node), **dict(final_outputs)}
    run.updated_at = _utcnow()
    return run
