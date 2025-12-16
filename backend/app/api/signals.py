from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.redis import get_redis
from app.models.neuro import NeuroProvider, ProviderBinding

router = APIRouter(prefix="/signals", tags=["signals"])

SIGNAL_LAST_PREFIX = "signal:last:"
SIGNAL_PROVIDER_STREAM_PREFIX = "signals.provider."


class CanonicalSignalPair(BaseModel):
    direction: str
    confidence: float | None = None
    predicted_price_24h: float | None = None
    ai_stop_loss: float | None = None
    position_size: float | None = None
    metadata: dict[str, Any] | None = None


class CanonicalSignalEnvelope(BaseModel):
    schema: str = Field(default="th.signal.v1")
    provider_id: str
    timestamp: int
    ttl_sec: int
    signals: dict[str, CanonicalSignalPair]


@router.post("/ingest")
async def ingest(envelope: CanonicalSignalEnvelope, session: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    redis = get_redis()
    now = int(datetime.now(timezone.utc).timestamp())

    # Store last signal per pair.
    written = 0
    for pair, signal in envelope.signals.items():
        key = f"{SIGNAL_LAST_PREFIX}{envelope.provider_id}:{pair}"
        payload = {
            "signal_id": str(uuid4()),
            "provider_id": envelope.provider_id,
            "pair": pair,
            "direction": signal.direction,
            "confidence": signal.confidence,
            "ts": envelope.timestamp,
            "ttl_sec": envelope.ttl_sec,
            "stale": now > (envelope.timestamp + envelope.ttl_sec),
            "ai_stop_loss": signal.ai_stop_loss,
            "position_size": signal.position_size,
            "payload": {"metadata": signal.metadata or {}},
        }
        await redis.set(key, json.dumps(payload, ensure_ascii=False))
        written += 1

    # Update provider last_seen_ts in Postgres if exists.
    provider = await session.get(NeuroProvider, envelope.provider_id)
    if provider:
        provider.health_status = "healthy"
        provider.last_seen_ts = datetime.now(timezone.utc)
        await session.commit()

    # Optional: append to provider stream (best-effort)
    try:
        stream = f"{SIGNAL_PROVIDER_STREAM_PREFIX}{envelope.provider_id}"
        await redis.xadd(stream, {"schema": envelope.schema, "payload": envelope.model_dump_json()}, maxlen=10_000)
    except Exception:  # noqa: BLE001
        pass

    return {"ok": True, "written": written}


@router.get("/providers/{provider_id}/last")
async def get_last_signals(provider_id: str, pairs: str | None = Query(default=None)) -> dict[str, Any]:
    redis = get_redis()
    if not pairs:
        raise HTTPException(status_code=400, detail="pairs query param required")

    pair_list = [p.strip() for p in pairs.split(",") if p.strip()]
    out: dict[str, Any] = {"provider_id": provider_id, "signals": {}}
    for pair in pair_list:
        key = f"{SIGNAL_LAST_PREFIX}{provider_id}:{pair}"
        raw = await redis.get(key)
        out["signals"][pair] = json.loads(raw) if raw else None
    return out


@router.get("/bots/{bot_id}/last")
async def get_last_signals_for_bot(bot_id: str, pairs: str | None = Query(default=None), session: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    if not pairs:
        raise HTTPException(status_code=400, detail="pairs query param required")

    binding = await session.scalar(select(ProviderBinding).where(ProviderBinding.bot_id == bot_id))
    if not binding or not binding.provider_id:
        return {"bot_id": bot_id, "provider_id": None, "signals": {}}

    pair_list = [p.strip() for p in pairs.split(",") if p.strip()]
    redis = get_redis()
    out: dict[str, Any] = {
        "bot_id": bot_id,
        "provider_id": binding.provider_id,
        "signals": {},
    }
    for pair in pair_list:
        key = f"{SIGNAL_LAST_PREFIX}{binding.provider_id}:{pair}"
        raw = await redis.get(key)
        out["signals"][pair] = json.loads(raw) if raw else None
    return out
