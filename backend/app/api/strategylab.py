from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.redis import get_redis
from app.models.strategylab import FreqAIModelVariant, StrategyAlignment, StrategyTemplate
from app.schemas.strategylab import (
    FreqAIModelVariantCreate,
    FreqAIModelVariantOut,
    FreqAIModelVariantUpdate,
    StrategyAlignmentCreate,
    StrategyAlignmentOut,
    StrategyAlignmentUpdate,
    StrategyTemplateCreate,
    StrategyTemplateOut,
    StrategyTemplateUpdate,
)

router = APIRouter(prefix="/strategylab", tags=["strategylab"])

QUEUE_KEY = "trade:tasks:queue"
TASK_KEY_PREFIX = "trade:tasks:"


@router.get("/strategies")
async def list_strategies(session: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await session.execute(select(StrategyTemplate).order_by(StrategyTemplate.updated_at.desc()))
    rows = result.scalars().all()
    return [StrategyTemplateOut.model_validate(r, from_attributes=True).model_dump() for r in rows]


@router.post("/strategies")
async def create_strategy(p: StrategyTemplateCreate, session: AsyncSession = Depends(get_db)) -> dict:
    s = StrategyTemplate(
        strategy_id=str(uuid4()),
        slug=p.slug,
        name=p.name,
        source_type=p.source_type,
        source_url=p.source_url,
        source_ref=p.source_ref,
        strategy_class=p.strategy_class,
        description=p.description,
        tags=p.tags,
        meta=p.meta,
    )

    session.add(s)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="slug already exists")

    await session.refresh(s)
    return StrategyTemplateOut.model_validate(s, from_attributes=True).model_dump()


@router.put("/strategies/{strategy_id}")
async def update_strategy(strategy_id: str, p: StrategyTemplateUpdate, session: AsyncSession = Depends(get_db)) -> dict:
    if p.strategy_id != strategy_id:
        raise HTTPException(status_code=400, detail="strategy_id mismatch")

    s = await session.get(StrategyTemplate, strategy_id)
    if not s:
        raise HTTPException(status_code=404, detail="strategy not found")

    s.slug = p.slug
    s.name = p.name
    s.source_type = p.source_type
    s.source_url = p.source_url
    s.source_ref = p.source_ref
    s.strategy_class = p.strategy_class
    s.description = p.description
    s.tags = p.tags
    s.meta = p.meta
    s.updated_at = datetime.now(timezone.utc)

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="slug already exists")

    await session.refresh(s)
    return StrategyTemplateOut.model_validate(s, from_attributes=True).model_dump()


@router.delete("/strategies/{strategy_id}")
async def delete_strategy(strategy_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    s = await session.get(StrategyTemplate, strategy_id)
    if not s:
        raise HTTPException(status_code=404, detail="strategy not found")
    await session.delete(s)
    await session.commit()
    return {"deleted": True, "strategy_id": strategy_id}


@router.get("/models")
async def list_models(session: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await session.execute(select(FreqAIModelVariant).order_by(FreqAIModelVariant.updated_at.desc()))
    rows = result.scalars().all()
    return [FreqAIModelVariantOut.model_validate(r, from_attributes=True).model_dump() for r in rows]


@router.post("/models")
async def create_model(p: FreqAIModelVariantCreate, session: AsyncSession = Depends(get_db)) -> dict:
    m = FreqAIModelVariant(
        model_id=str(uuid4()),
        slug=p.slug,
        name=p.name,
        algorithm=p.algorithm,
        config=p.config,
        description=p.description,
        tags=p.tags,
    )

    session.add(m)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="slug already exists")

    await session.refresh(m)
    return FreqAIModelVariantOut.model_validate(m, from_attributes=True).model_dump()


@router.put("/models/{model_id}")
async def update_model(model_id: str, p: FreqAIModelVariantUpdate, session: AsyncSession = Depends(get_db)) -> dict:
    if p.model_id != model_id:
        raise HTTPException(status_code=400, detail="model_id mismatch")

    m = await session.get(FreqAIModelVariant, model_id)
    if not m:
        raise HTTPException(status_code=404, detail="model not found")

    m.slug = p.slug
    m.name = p.name
    m.algorithm = p.algorithm
    m.config = p.config
    m.description = p.description
    m.tags = p.tags
    m.updated_at = datetime.now(timezone.utc)

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="slug already exists")

    await session.refresh(m)
    return FreqAIModelVariantOut.model_validate(m, from_attributes=True).model_dump()


@router.delete("/models/{model_id}")
async def delete_model(model_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    m = await session.get(FreqAIModelVariant, model_id)
    if not m:
        raise HTTPException(status_code=404, detail="model not found")
    await session.delete(m)
    await session.commit()
    return {"deleted": True, "model_id": model_id}


@router.get("/alignments")
async def list_alignments(session: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await session.execute(select(StrategyAlignment).order_by(StrategyAlignment.updated_at.desc()))
    rows = result.scalars().all()
    return [StrategyAlignmentOut.model_validate(r, from_attributes=True).model_dump() for r in rows]


@router.post("/alignments")
async def create_alignment(p: StrategyAlignmentCreate, session: AsyncSession = Depends(get_db)) -> dict:
    # Validate refs exist (small and explicit)
    if not await session.get(StrategyTemplate, p.strategy_id):
        raise HTTPException(status_code=400, detail="unknown strategy_id")
    if not await session.get(FreqAIModelVariant, p.model_id):
        raise HTTPException(status_code=400, detail="unknown model_id")

    a = StrategyAlignment(
        alignment_id=str(uuid4()),
        strategy_id=p.strategy_id,
        model_id=p.model_id,
        profile=p.profile,
        scope=p.scope,
        defaults=p.defaults,
        mapping=p.mapping,
        freqtrade_overrides=p.freqtrade_overrides,
        freqai_overrides=p.freqai_overrides,
        status=p.status,
    )

    session.add(a)
    await session.commit()
    await session.refresh(a)
    return StrategyAlignmentOut.model_validate(a, from_attributes=True).model_dump()


@router.put("/alignments/{alignment_id}")
async def update_alignment(alignment_id: str, p: StrategyAlignmentUpdate, session: AsyncSession = Depends(get_db)) -> dict:
    if p.alignment_id != alignment_id:
        raise HTTPException(status_code=400, detail="alignment_id mismatch")

    a = await session.get(StrategyAlignment, alignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="alignment not found")

    if not await session.get(StrategyTemplate, p.strategy_id):
        raise HTTPException(status_code=400, detail="unknown strategy_id")
    if not await session.get(FreqAIModelVariant, p.model_id):
        raise HTTPException(status_code=400, detail="unknown model_id")

    a.strategy_id = p.strategy_id
    a.model_id = p.model_id
    a.profile = p.profile
    a.scope = p.scope
    a.defaults = p.defaults
    a.mapping = p.mapping
    a.freqtrade_overrides = p.freqtrade_overrides
    a.freqai_overrides = p.freqai_overrides
    a.status = p.status
    a.updated_at = datetime.now(timezone.utc)

    await session.commit()
    await session.refresh(a)
    return StrategyAlignmentOut.model_validate(a, from_attributes=True).model_dump()


@router.delete("/alignments/{alignment_id}")
async def delete_alignment(alignment_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    a = await session.get(StrategyAlignment, alignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="alignment not found")
    await session.delete(a)
    await session.commit()
    return {"deleted": True, "alignment_id": alignment_id}


@router.post("/alignments/{alignment_id}/request-agent")
async def request_agent_alignment(alignment_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    a = await session.get(StrategyAlignment, alignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="alignment not found")

    task_id = str(uuid4())
    now = datetime.now(timezone.utc).isoformat()

    redis = get_redis()
    key = f"{TASK_KEY_PREFIX}{task_id}"

    payload = {
        "alignment_id": alignment_id,
        "strategy_id": a.strategy_id,
        "model_id": a.model_id,
        "intent": "propose_alignment",
    }

    await redis.hset(
        key,
        mapping={
            "id": task_id,
            "type": "strategylab.alignment.propose",
            "payload": json.dumps(payload, ensure_ascii=False),
            "status": "queued",
            "created_at": now,
        },
    )
    await redis.rpush(QUEUE_KEY, task_id)

    return {"queued": True, "task_id": task_id}
