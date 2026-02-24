from __future__ import annotations

from datetime import datetime, timezone
from datetime import timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.exceptions import BadRequestError, NotFoundError, UnprocessableEntityError
from app.core.redis import get_redis
from app.models.graph import NodeGraph, NodeGraphRun, NodeGraphRunNode, NodeGraphVersion
from app.models.user import User
from app.schemas.graph import (
    GraphTemplateAlignmentBacktestCreate,
    NodeGraphCreate,
    NodeGraphListOut,
    NodeGraphOut,
    NodeGraphRunCreate,
    NodeGraphRunListOut,
    NodeGraphRunOut,
    NodeGraphRunProgressOut,
    NodeGraphRunExecutionOut,
    NodeGraphRunStaleListOut,
    NodeGraphVersionCreate,
    NodeGraphVersionListOut,
    NodeGraphVersionOut,
    NodeGraphRunNodeListOut,
    NodeGraphRunNodeOut,
    NodeGraphTemplateListOut,
    NodeGraphTemplateOut,
    NodeKindMetaListOut,
    NodeKindMetaOut,
    NodeKindCapabilitiesOut,
)
from app.node_platform.registry import get_default_node_registry
from app.services.graph_templates import alignment_backtest_template_definition, is_alignment_backtest_template_definition
from app.services.graph_execution_stats import build_execution_stats
from app.services.graph_run_heartbeat import heartbeat_age_seconds, is_stale, parse_heartbeat, utcnow
from app.services.graph_idempotency import DEFAULT_IDEMPOTENCY_TTL_SECONDS, enqueue_dedup_key, ttl_cutoff


router = APIRouter(prefix="/graphs", tags=["graphs"])
QUEUE_KEY = "graph:tasks:queue"


@router.get("/templates", response_model=NodeGraphTemplateListOut)
async def list_graph_templates(
    user: User = Depends(get_current_user),
) -> dict:
    # Templates are currently static and globally available.
    # Keep the catalog minimal: only expose meta needed for UI form + labeling.
    _ = user  # reserved for future per-user template availability
    defn = alignment_backtest_template_definition()
    meta = defn.get("meta") if isinstance(defn, dict) else None
    meta = meta if isinstance(meta, dict) else {}

    items = [
        NodeGraphTemplateOut(
            kind=str(meta.get("kind") or "alignment_backtest"),
            name=str(meta.get("name") or "Alignment → Generate Bot → Backtest"),
            description=str(meta.get("description")) if meta.get("description") is not None else None,
            required_inputs=[str(x) for x in (meta.get("required_inputs") or [])],
            optional_inputs=[str(x) for x in (meta.get("optional_inputs") or [])],
        )
    ]
    return {"items": items, "total": len(items)}


@router.get("/kinds", response_model=NodeKindMetaListOut)
async def list_node_kinds(
    user: User = Depends(get_current_user),
) -> dict:
    # Kinds are currently global, not per-user.
    _ = user
    reg = get_default_node_registry()

    meta_by_kind = {m.kind: m for m in reg.list_meta()}
    items: list[NodeKindMetaOut] = []
    for kind in reg.list_kinds():
        m = meta_by_kind.get(kind)
        if m is None:
            items.append(
                NodeKindMetaOut(
                    kind=kind,
                    label=kind,
                    category="Other",
                    description=None,
                    inputs=[],
                    outputs=[],
                    capabilities=NodeKindCapabilitiesOut(),
                )
            )
            continue

        items.append(
            NodeKindMetaOut(
                kind=m.kind,
                label=m.label,
                category=m.category,
                description=m.description,
                hidden=bool(getattr(m, "hidden", False)),
                inputs=list(m.inputs or ()),
                outputs=list(m.outputs or ()),
                capabilities=NodeKindCapabilitiesOut(
                    side_effects=bool(m.capabilities.side_effects),
                    idempotent=bool(m.capabilities.idempotent),
                    long_running=bool(m.capabilities.long_running),
                ),
            )
        )

    # Stable ordering for UI.
    items.sort(key=lambda x: (x.category.lower(), x.label.lower(), x.kind.lower()))
    return {"items": items, "total": len(items)}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@router.post("/templates/alignment-backtest", response_model=NodeGraphRunOut)
async def create_alignment_backtest_template_run(
    payload: GraphTemplateAlignmentBacktestCreate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NodeGraphRun:
    alignment_id = str(payload.alignment_id or "").strip()
    if not alignment_id:
        raise UnprocessableEntityError("alignment_id is required")

    name = (payload.name or "Alignment Backtest").strip() or "Alignment Backtest"

    timerange = None
    if payload.timerange is not None:
        tr = str(payload.timerange).strip()
        if tr:
            timerange = tr

    stmt = (
        select(NodeGraph)
        .where(NodeGraph.user_id == user.user_id)
        .where(NodeGraph.scope == "alignment")
        .where(NodeGraph.owner_id == alignment_id)
        .where(NodeGraph.name == name)
        .limit(1)
    )
    existing_graph = (await session.execute(stmt)).scalars().first()

    if existing_graph:
        graph_id = existing_graph.graph_id

        # Allow updating description if caller provides one.
        if payload.description is not None:
            desc_s = str(payload.description).strip()
            if desc_s and existing_graph.description != desc_s:
                existing_graph.description = desc_s
                await session.flush()
    else:
        g = NodeGraph(
            graph_id=str(uuid4()),
            user_id=user.user_id,
            name=name,
            description=payload.description,
            scope="alignment",
            owner_id=alignment_id,
            is_active=True,
        )
        session.add(g)
        await session.flush()
        graph_id = g.graph_id

    # Reuse the latest matching template version (not necessarily the latest version overall).
    recent_versions_stmt = (
        select(NodeGraphVersion)
        .where(NodeGraphVersion.graph_id == graph_id)
        .order_by(desc(NodeGraphVersion.version))
        .limit(25)
    )
    recent_versions = (await session.execute(recent_versions_stmt)).scalars().all()
    v = None
    for cand in recent_versions:
        if is_alignment_backtest_template_definition(cand.definition or {}):
            v = cand
            break

    if v is None:
        max_stmt = select(func.max(NodeGraphVersion.version)).where(NodeGraphVersion.graph_id == graph_id)
        current_max = (await session.execute(max_stmt)).scalar() or 0

        definition = alignment_backtest_template_definition()
        v = NodeGraphVersion(
            version_id=str(uuid4()),
            graph_id=graph_id,
            version=int(current_max) + 1,
            definition=definition,
        )
        session.add(v)
        await session.flush()

    run = NodeGraphRun(
        run_id=str(uuid4()),
        graph_id=graph_id,
        version_id=v.version_id,
        user_id=user.user_id,
        status="queued",
        inputs={
            "alignment_id": alignment_id,
            **({"timerange": timerange} if timerange else {}),
        },
        outputs={},
        idempotency_key=payload.idempotency_key,
    )

    if payload.idempotency_key:
        now = _utcnow()
        cutoff = ttl_cutoff(now=now, ttl_seconds=DEFAULT_IDEMPOTENCY_TTL_SECONDS)
        idem_stmt = (
            select(NodeGraphRun)
            .where(NodeGraphRun.user_id == user.user_id)
            .where(NodeGraphRun.graph_id == graph_id)
            .where(NodeGraphRun.idempotency_key == payload.idempotency_key)
            .where(NodeGraphRun.created_at >= cutoff)
            .order_by(desc(NodeGraphRun.created_at))
            .limit(1)
        )
        existing = (await session.execute(idem_stmt)).scalars().first()
        if existing:
            if payload.enqueue and existing.status == "queued":
                redis = get_redis()
                if await redis.set(enqueue_dedup_key(existing.run_id), "1", ex=DEFAULT_IDEMPOTENCY_TTL_SECONDS, nx=True):
                    await redis.rpush(QUEUE_KEY, existing.run_id)
            return existing

    session.add(run)
    await session.commit()
    await session.refresh(run)

    if payload.enqueue:
        redis = get_redis()
        if await redis.set(enqueue_dedup_key(run.run_id), "1", ex=DEFAULT_IDEMPOTENCY_TTL_SECONDS, nx=True):
            await redis.rpush(QUEUE_KEY, run.run_id)

    return run


@router.post("", response_model=NodeGraphOut)
async def create_graph(
    payload: NodeGraphCreate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NodeGraph:
    g = NodeGraph(
        graph_id=str(uuid4()),
        user_id=user.user_id,
        name=payload.name,
        description=payload.description,
        scope=payload.scope,
        owner_id=payload.owner_id,
        is_active=payload.is_active,
    )
    session.add(g)
    await session.commit()
    await session.refresh(g)
    return g


@router.get("", response_model=NodeGraphListOut)
async def list_graphs(
    scope: str | None = Query(default=None),
    owner_id: str | None = Query(default=None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = 0,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    stmt = select(NodeGraph).where(NodeGraph.user_id == user.user_id)
    if scope:
        stmt = stmt.where(NodeGraph.scope == scope)
    if owner_id:
        stmt = stmt.where(NodeGraph.owner_id == owner_id)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(desc(NodeGraph.created_at)).limit(limit).offset(offset)
    items = (await session.execute(stmt)).scalars().all()
    return {
        "items": [NodeGraphOut.model_validate(x, from_attributes=True) for x in items],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{graph_id}", response_model=NodeGraphOut)
async def get_graph(
    graph_id: str,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NodeGraph:
    g = await session.get(NodeGraph, graph_id)
    if not g or g.user_id != user.user_id:
        raise NotFoundError("graph not found")
    return g


@router.post("/{graph_id}/versions", response_model=NodeGraphVersionOut)
async def create_graph_version(
    graph_id: str,
    payload: NodeGraphVersionCreate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NodeGraphVersion:
    g = await session.get(NodeGraph, graph_id)
    if not g or g.user_id != user.user_id:
        raise NotFoundError("graph not found")

    # Next version = max + 1
    max_stmt = select(func.max(NodeGraphVersion.version)).where(NodeGraphVersion.graph_id == graph_id)
    current_max = (await session.execute(max_stmt)).scalar() or 0
    v = NodeGraphVersion(
        version_id=str(uuid4()),
        graph_id=graph_id,
        version=int(current_max) + 1,
        definition=payload.definition or {},
    )
    session.add(v)
    await session.commit()
    await session.refresh(v)
    return v


@router.get("/{graph_id}/versions", response_model=NodeGraphVersionListOut)
async def list_graph_versions(
    graph_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = 0,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    g = await session.get(NodeGraph, graph_id)
    if not g or g.user_id != user.user_id:
        raise NotFoundError("graph not found")

    stmt = select(NodeGraphVersion).where(NodeGraphVersion.graph_id == graph_id)
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_stmt)).scalar() or 0
    stmt = stmt.order_by(desc(NodeGraphVersion.version)).limit(limit).offset(offset)
    items = (await session.execute(stmt)).scalars().all()
    return {
        "items": [NodeGraphVersionOut.model_validate(x, from_attributes=True) for x in items],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/{graph_id}/runs", response_model=NodeGraphRunOut)
async def create_graph_run(
    graph_id: str,
    payload: NodeGraphRunCreate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NodeGraphRun:
    g = await session.get(NodeGraph, graph_id)
    if not g or g.user_id != user.user_id:
        raise NotFoundError("graph not found")

    version_id = payload.version_id
    if not version_id:
        latest_stmt = (
            select(NodeGraphVersion)
            .where(NodeGraphVersion.graph_id == graph_id)
            .order_by(desc(NodeGraphVersion.version))
            .limit(1)
        )
        version = (await session.execute(latest_stmt)).scalars().first()
        if not version:
            raise BadRequestError("graph has no versions")
        version_id = version.version_id

    v = await session.get(NodeGraphVersion, version_id)
    if not v or v.graph_id != graph_id:
        raise NotFoundError("graph version not found")

    if payload.idempotency_key:
        now = _utcnow()
        cutoff = ttl_cutoff(now=now, ttl_seconds=DEFAULT_IDEMPOTENCY_TTL_SECONDS)
        idem_stmt = (
            select(NodeGraphRun)
            .where(NodeGraphRun.user_id == user.user_id)
            .where(NodeGraphRun.graph_id == graph_id)
            .where(NodeGraphRun.idempotency_key == payload.idempotency_key)
            .where(NodeGraphRun.created_at >= cutoff)
            .order_by(desc(NodeGraphRun.created_at))
            .limit(1)
        )
        existing = (await session.execute(idem_stmt)).scalars().first()
        if existing:
            if payload.enqueue and existing.status == "queued":
                redis = get_redis()
                if await redis.set(enqueue_dedup_key(existing.run_id), "1", ex=DEFAULT_IDEMPOTENCY_TTL_SECONDS, nx=True):
                    await redis.rpush(QUEUE_KEY, existing.run_id)
            return existing

    run = NodeGraphRun(
        run_id=str(uuid4()),
        graph_id=graph_id,
        version_id=version_id,
        user_id=user.user_id,
        status="queued",
        inputs=payload.inputs or {},
        outputs={},
        idempotency_key=payload.idempotency_key,
    )
    session.add(run)
    await session.commit()
    await session.refresh(run)

    if payload.enqueue:
        redis = get_redis()
        if await redis.set(enqueue_dedup_key(run.run_id), "1", ex=DEFAULT_IDEMPOTENCY_TTL_SECONDS, nx=True):
            await redis.rpush(QUEUE_KEY, run.run_id)

    return run


@router.get("/runs", response_model=NodeGraphRunListOut)
async def list_graph_runs(
    graph_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = 0,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    stmt = select(NodeGraphRun).where(NodeGraphRun.user_id == user.user_id)
    if graph_id:
        stmt = stmt.where(NodeGraphRun.graph_id == graph_id)
    if status:
        stmt = stmt.where(NodeGraphRun.status == status)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(desc(NodeGraphRun.created_at)).limit(limit).offset(offset)
    items = (await session.execute(stmt)).scalars().all()
    return {
        "items": [NodeGraphRunOut.model_validate(x, from_attributes=True) for x in items],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/runs/{run_id}", response_model=NodeGraphRunOut)
async def get_graph_run(
    run_id: str,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NodeGraphRun:
    r = await session.get(NodeGraphRun, run_id)
    if not r or r.user_id != user.user_id:
        raise NotFoundError("graph run not found")
    return r


@router.get("/runs/{run_id}/progress", response_model=NodeGraphRunProgressOut)
async def get_graph_run_progress(
    run_id: str,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    r = await session.get(NodeGraphRun, run_id)
    if not r or r.user_id != user.user_id:
        raise NotFoundError("graph run not found")

    redis = get_redis()
    redis_status = await redis.get(f"graph:run:{run_id}:status")

    return {
        "run_id": r.run_id,
        "status": r.status,
        "updated_at": r.updated_at,
        "completed_at": r.completed_at,
        "error_message": r.error_message,
        "redis_status": redis_status,
    }


@router.get("/runs/stale", response_model=NodeGraphRunStaleListOut)
async def list_stale_graph_runs(
    max_age_seconds: int = Query(120, ge=10, le=24 * 60 * 60),
    limit: int = Query(50, ge=1, le=200),
    offset: int = 0,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    stmt = (
        select(NodeGraphRun)
        .where(NodeGraphRun.user_id == user.user_id)
        .where(NodeGraphRun.status == "running")
        .order_by(desc(NodeGraphRun.created_at))
        .limit(limit)
        .offset(offset)
    )
    runs = (await session.execute(stmt)).scalars().all()

    count_stmt = (
        select(func.count())
        .select_from(NodeGraphRun)
        .where(NodeGraphRun.user_id == user.user_id)
        .where(NodeGraphRun.status == "running")
    )
    total_running = (await session.execute(count_stmt)).scalar() or 0

    now = utcnow()
    redis = get_redis()
    items = []
    for r in runs:
        hb_raw = await redis.get(f"graph:run:{r.run_id}:heartbeat")
        hb_at = parse_heartbeat(hb_raw)
        age = heartbeat_age_seconds(now=now, heartbeat_at=hb_at)
        stale = is_stale(heartbeat_at=hb_at, now=now, max_age_seconds=max_age_seconds)
        items.append(
            {
                "run": NodeGraphRunOut.model_validate(r, from_attributes=True),
                "heartbeat_at": hb_at,
                "heartbeat_age_seconds": age,
                "is_stale": stale,
            }
        )

    return {"items": items, "total_running": total_running}


@router.get("/runs/{run_id}/nodes", response_model=NodeGraphRunNodeListOut)
async def list_graph_run_nodes(
    run_id: str,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    r = await session.get(NodeGraphRun, run_id)
    if not r or r.user_id != user.user_id:
        raise NotFoundError("graph run not found")

    stmt = select(NodeGraphRunNode).where(NodeGraphRunNode.run_id == run_id).order_by(NodeGraphRunNode.created_at)
    items = (await session.execute(stmt)).scalars().all()
    return {
        "items": [NodeGraphRunNodeOut.model_validate(x, from_attributes=True) for x in items],
        "total": len(items),
    }


@router.get("/runs/{run_id}/execution", response_model=NodeGraphRunExecutionOut)
async def get_graph_run_execution(
    run_id: str,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    r = await session.get(NodeGraphRun, run_id)
    if not r or r.user_id != user.user_id:
        raise NotFoundError("graph run not found")

    stmt = select(NodeGraphRunNode).where(NodeGraphRunNode.run_id == run_id).order_by(NodeGraphRunNode.created_at)
    nodes = (await session.execute(stmt)).scalars().all()

    node_dicts = [
        {
            "node_id": n.node_id,
            "kind": n.kind,
            "status": n.status,
            "started_at": getattr(n, "started_at", None),
            "created_at": n.created_at,
            "completed_at": n.completed_at,
        }
        for n in nodes
    ]
    stats, timings = build_execution_stats(
        run_created_at=r.created_at,
        run_completed_at=r.completed_at,
        nodes=node_dicts,
    )
    return {
        "run": NodeGraphRunOut.model_validate(r, from_attributes=True),
        "nodes": [NodeGraphRunNodeOut.model_validate(x, from_attributes=True) for x in nodes],
        "stats": stats,
        "timings": timings,
    }
