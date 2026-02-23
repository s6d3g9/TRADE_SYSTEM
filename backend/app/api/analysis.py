from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.core.redis import get_redis
from app.models.analysis import AnalysisRun, TuningSuggestion
from app.models.strategylab import ConfigFile
from app.models.user import User
from app.schemas.analysis import (
    AnalysisRunCreate,
    AnalysisRunListOut,
    AnalysisRunOut,
    AnalysisRunProgressOut,
    SuggestionAcceptRequest,
    SuggestionCreate,
    SuggestionListOut,
    SuggestionOut,
)
from app.services.analysis_runner import execute_analysis_run


router = APIRouter(prefix="/analysis", tags=["analysis"])

QUEUE_KEY = "analysis:tasks:queue"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _run_and_persist(run_id: str) -> None:
    """Background task entrypoint: open a fresh DB session through dependency injection.

    NOTE: FastAPI BackgroundTasks runs in-process after response.
    This is sufficient for MVP; later we can move to a dedicated worker.
    """

    # We cannot use Depends() here; import the session factory indirectly.
    # get_db is an async generator dependency; we can iterate it to get a session.
    async for session in get_db():
        run = await session.get(AnalysisRun, run_id)
        if not run:
            return
        if run.status not in ("queued", "running"):
            return

        run.status = "running"
        run.updated_at = _utcnow()
        await session.commit()

        try:
            await session.refresh(run)
            run = await execute_analysis_run(session, run)
            run.status = "completed"
            run.completed_at = _utcnow()
            run.updated_at = _utcnow()
            await session.commit()
        except Exception as e:
            await session.rollback()
            run = await session.get(AnalysisRun, run_id)
            if run:
                run.status = "failed"
                run.error_message = str(e)
                run.updated_at = _utcnow()
                run.completed_at = _utcnow()
                await session.commit()
        return


@router.post("/runs", response_model=AnalysisRunOut)
async def create_analysis_run(
    payload: AnalysisRunCreate,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AnalysisRun:
    run = AnalysisRun(
        run_id=str(uuid4()),
        user_id=user.user_id,
        kind=payload.kind,
        status="queued",
        inputs=payload.inputs or {},
        outputs={},
        evidence={},
    )
    session.add(run)
    await session.commit()
    await session.refresh(run)

    if payload.enqueue:
        redis = get_redis()
        # Store minimal job id in queue; the run itself is the source of truth in DB.
        await redis.rpush(QUEUE_KEY, run.run_id)
        # Optional fallback for dev: execute in-process after enqueue.
        # Default behavior is to rely on the dedicated Redis worker.
        if settings.analysis_inline_execution:
            background.add_task(_run_and_persist, run.run_id)

    return run


@router.get("/runs", response_model=AnalysisRunListOut)
async def list_analysis_runs(
    kind: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = 0,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    stmt = select(AnalysisRun).where(AnalysisRun.user_id == user.user_id)
    if kind:
        stmt = stmt.where(AnalysisRun.kind == kind)
    if status:
        stmt = stmt.where(AnalysisRun.status == status)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(desc(AnalysisRun.created_at)).limit(limit).offset(offset)
    items = (await session.execute(stmt)).scalars().all()

    return {
        "items": [AnalysisRunOut.model_validate(x, from_attributes=True) for x in items],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/runs/{run_id}", response_model=AnalysisRunOut)
async def get_analysis_run(
    run_id: str,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AnalysisRun:
    run = await session.get(AnalysisRun, run_id)
    if not run or run.user_id != user.user_id:
        raise HTTPException(status_code=404, detail="analysis run not found")
    return run

@router.get("/runs/{run_id}/progress", response_model=AnalysisRunProgressOut)
async def get_analysis_run_progress(
    run_id: str,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    run = await session.get(AnalysisRun, run_id)
    if not run or run.user_id != user.user_id:
        raise HTTPException(status_code=404, detail="analysis run not found")

    redis = get_redis()
    redis_status = await redis.get(f"analysis:run:{run_id}:status")

    return {
        "run_id": run.run_id,
        "status": run.status,
        "updated_at": run.updated_at,
        "completed_at": run.completed_at,
        "error_message": run.error_message,
        "redis_status": redis_status,
    }


@router.post("/runs/{run_id}/execute", response_model=AnalysisRunOut)
async def execute_analysis_run_now(
    run_id: str,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AnalysisRun:
    run = await session.get(AnalysisRun, run_id)
    if not run or run.user_id != user.user_id:
        raise HTTPException(status_code=404, detail="analysis run not found")

    if run.status == "completed":
        return run

    run.status = "running"
    run.updated_at = _utcnow()
    await session.commit()
    await session.refresh(run)

    try:
        run = await execute_analysis_run(session, run)
        run.status = "completed"
        run.completed_at = _utcnow()
        run.updated_at = _utcnow()
        await session.commit()
        await session.refresh(run)
        return run
    except Exception as e:
        await session.rollback()
        run = await session.get(AnalysisRun, run_id)
        if run:
            run.status = "failed"
            run.error_message = str(e)
            run.updated_at = _utcnow()
            run.completed_at = _utcnow()
            await session.commit()
            await session.refresh(run)
            return run
        raise


@router.post("/runs/{run_id}/suggestions", response_model=SuggestionOut)
async def create_suggestion(
    run_id: str,
    payload: SuggestionCreate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TuningSuggestion:
    run = await session.get(AnalysisRun, run_id)
    if not run or run.user_id != user.user_id:
        raise HTTPException(status_code=404, detail="analysis run not found")

    proposed_config_id: str | None = None
    if payload.mint_config_variant and payload.proposed_config_content is not None:
        # Create a config variant (inactive) linked to the target scope/owner.
        cfg = ConfigFile(
            config_id=str(uuid4()),
            scope=payload.target_scope,
            owner_id=payload.owner_id,
            name="analysis-variant.json",
            content=payload.proposed_config_content,
            is_active=False,
            regime=payload.regime,
            kind="variant",
            parent_config_id=payload.base_config_id,
        )
        session.add(cfg)
        await session.flush()
        proposed_config_id = cfg.config_id

    s = TuningSuggestion(
        suggestion_id=str(uuid4()),
        run_id=run_id,
        target_scope=payload.target_scope,
        owner_id=payload.owner_id,
        base_config_id=payload.base_config_id,
        proposed_config_id=proposed_config_id,
        proposed_patch=payload.proposed_patch,
        expected_impact=payload.expected_impact or {},
        risk_notes=payload.risk_notes or {},
        state="draft",
    )
    session.add(s)
    await session.commit()
    await session.refresh(s)
    return s


@router.get("/suggestions", response_model=SuggestionListOut)
async def list_suggestions(
    state: str | None = Query(default=None),
    target_scope: str | None = Query(default=None),
    owner_id: str | None = Query(default=None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = 0,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    # Suggestions are owned by user through the parent run.
    stmt = select(TuningSuggestion).join(AnalysisRun, AnalysisRun.run_id == TuningSuggestion.run_id).where(
        AnalysisRun.user_id == user.user_id
    )
    if state:
        stmt = stmt.where(TuningSuggestion.state == state)
    if target_scope:
        stmt = stmt.where(TuningSuggestion.target_scope == target_scope)
    if owner_id:
        stmt = stmt.where(TuningSuggestion.owner_id == owner_id)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(desc(TuningSuggestion.created_at)).limit(limit).offset(offset)
    items = (await session.execute(stmt)).scalars().all()

    return {
        "items": [SuggestionOut.model_validate(x, from_attributes=True) for x in items],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/suggestions/{suggestion_id}/accept", response_model=SuggestionOut)
async def accept_suggestion(
    suggestion_id: str,
    payload: SuggestionAcceptRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TuningSuggestion:
    s = await session.get(TuningSuggestion, suggestion_id)
    if not s:
        raise HTTPException(status_code=404, detail="suggestion not found")

    run = await session.get(AnalysisRun, s.run_id)
    if not run or run.user_id != user.user_id:
        raise HTTPException(status_code=404, detail="suggestion not found")

    s.state = "accepted"
    s.updated_at = _utcnow()

    if payload.activate and s.proposed_config_id:
        cfg = await session.get(ConfigFile, s.proposed_config_id)
        if cfg:
            # Deactivate siblings for same scope+owner+regime and activate this one.
            await session.execute(
                update(ConfigFile)
                .where(
                    (ConfigFile.scope == cfg.scope)
                    & (ConfigFile.owner_id == cfg.owner_id)
                    & (ConfigFile.regime == cfg.regime)
                )
                .values(is_active=False)
            )
            cfg.is_active = True

    await session.commit()
    await session.refresh(s)
    return s
