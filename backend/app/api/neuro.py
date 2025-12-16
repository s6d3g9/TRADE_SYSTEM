from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.neuro import NeuroProvider
from app.schemas.neuro import (
    NeuroProviderCreate,
    NeuroProviderOut,
    NeuroProviderUpdate,
    ProviderHealth,
)

router = APIRouter(prefix="/neuro", tags=["neuro"])

MODULES: list[dict[str, Any]] = [
    {
        "module_type": "freqai",
        "title": "FreqAI",
        "description": "Internal Freqtrade/FreqAI module (placeholder)",
        "version": "0.1.0",
        "vendor": "freqtrade",
        "capabilities": {
            "supports_streaming": True,
            "supports_batch_pull": True,
            "supports_training": True,
            "supports_datasets": True,
            "supports_featuresets": True,
            "supports_backtest_signals": True,
            "supports_multi_exchange": True,
            "supports_short": True,
            "supports_position_sizing": True,
            "supports_ai_stoploss": True,
        },
        "provider_config_schema": {
            "type": "object",
            "properties": {
                "profile": {"type": "string", "description": "Local FreqAI profile name"},
            },
            "required": ["profile"],
        },
        "signal_schema_version": "th.signal.v1",
        "status": "active",
    },
    {
        "module_type": "external_brain",
        "title": "External Brain",
        "description": "External signal provider (redis/http/file)",
        "version": "0.1.0",
        "vendor": None,
        "capabilities": {
            "supports_streaming": True,
            "supports_batch_pull": True,
            "supports_training": False,
            "supports_datasets": False,
            "supports_featuresets": False,
            "supports_backtest_signals": False,
            "supports_multi_exchange": True,
            "supports_short": True,
            "supports_position_sizing": True,
            "supports_ai_stoploss": True,
        },
        "provider_config_schema": {
            "type": "object",
            "properties": {
                "connector": {"type": "string", "enum": ["redis", "http", "file"]},
                "connector_config": {"type": "object"},
            },
            "required": ["connector", "connector_config"],
        },
        "signal_schema_version": "th.signal.v1",
        "status": "active",
    },
    {
        "module_type": "rules_engine",
        "title": "Rules Engine",
        "description": "Manual/Rules-based signal generator (placeholder)",
        "version": "0.1.0",
        "vendor": None,
        "capabilities": {
            "supports_streaming": True,
            "supports_batch_pull": True,
            "supports_training": False,
            "supports_datasets": False,
            "supports_featuresets": False,
            "supports_backtest_signals": True,
            "supports_multi_exchange": True,
            "supports_short": True,
            "supports_position_sizing": False,
            "supports_ai_stoploss": False,
        },
        "provider_config_schema": {"type": "object", "properties": {}, "required": []},
        "signal_schema_version": "th.signal.v1",
        "status": "deprecated",
    },
]

@router.get("/modules")
async def list_modules() -> list[dict[str, Any]]:
    return MODULES


@router.get("/providers")
async def list_providers(session: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    result = await session.execute(select(NeuroProvider).order_by(NeuroProvider.provider_id))
    providers = result.scalars().all()
    return [NeuroProviderOut.model_validate(p, from_attributes=True).model_dump() for p in providers]


@router.post("/providers")
async def create_provider(p: NeuroProviderCreate, session: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    if p.module_type not in {m["module_type"] for m in MODULES}:
        raise HTTPException(status_code=400, detail="unknown module_type")

    provider = NeuroProvider(
        provider_id=p.provider_id,
        name=p.name,
        module_type=p.module_type,
        connector=p.connector,
        connector_config=p.connector_config,
        scope=p.scope,
        defaults=p.defaults,
        mapping=p.mapping,
        health_status="unknown",
    )

    session.add(provider)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="provider_id already exists")

    await session.refresh(provider)
    return NeuroProviderOut.model_validate(provider, from_attributes=True).model_dump()


@router.get("/providers/{provider_id}")
async def get_provider(provider_id: str, session: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    provider = await session.get(NeuroProvider, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="provider not found")
    return NeuroProviderOut.model_validate(provider, from_attributes=True).model_dump()


@router.put("/providers/{provider_id}")
async def update_provider(provider_id: str, p: NeuroProviderUpdate, session: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    if p.provider_id != provider_id:
        raise HTTPException(status_code=400, detail="provider_id mismatch")

    provider = await session.get(NeuroProvider, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="provider not found")

    if p.module_type not in {m["module_type"] for m in MODULES}:
        raise HTTPException(status_code=400, detail="unknown module_type")

    provider.name = p.name
    provider.module_type = p.module_type
    provider.connector = p.connector
    provider.connector_config = p.connector_config
    provider.scope = p.scope
    provider.defaults = p.defaults
    provider.mapping = p.mapping
    provider.updated_at = datetime.now(timezone.utc)

    await session.commit()
    await session.refresh(provider)
    return NeuroProviderOut.model_validate(provider, from_attributes=True).model_dump()


@router.delete("/providers/{provider_id}")
async def delete_provider(provider_id: str, session: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    provider = await session.get(NeuroProvider, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="provider not found")
    await session.delete(provider)
    await session.commit()
    return {"deleted": True, "provider_id": provider_id}


@router.get("/providers/{provider_id}/health")
async def provider_health(provider_id: str, session: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    provider = await session.get(NeuroProvider, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="provider not found")

    health = ProviderHealth(
        provider_id=provider.provider_id,
        status=provider.health_status or "unknown",
        last_seen_ts=provider.last_seen_ts,
        errors_5m=provider.errors_5m,
        latency_ms_avg=provider.latency_ms_avg,
        stale_rate_5m=provider.stale_rate_5m,
    )
    return health.model_dump()
