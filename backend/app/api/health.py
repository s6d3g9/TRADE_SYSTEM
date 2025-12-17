import asyncio
import time

import httpx
from fastapi import APIRouter
from sqlalchemy import text

from app.core.db import get_sessionmaker
from app.core.redis import get_redis

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    started = time.perf_counter()

    checks: dict[str, dict] = {
        "postgres": {"status": "down"},
        "redis": {"status": "down"},
        "exchange": {"status": "down"},
    }

    # Postgres
    try:
        sessionmaker = get_sessionmaker()
        async with sessionmaker() as session:
            t0 = time.perf_counter()
            await asyncio.wait_for(session.execute(text("SELECT 1")), timeout=1.5)
            checks["postgres"] = {"status": "ok", "latency_ms": int((time.perf_counter() - t0) * 1000)}
    except Exception as e:  # noqa: BLE001
        checks["postgres"] = {"status": "down", "error": str(e)}

    # Redis
    try:
        redis = get_redis()
        t0 = time.perf_counter()
        await asyncio.wait_for(redis.ping(), timeout=1.0)
        checks["redis"] = {"status": "ok", "latency_ms": int((time.perf_counter() - t0) * 1000)}
    except Exception as e:  # noqa: BLE001
        checks["redis"] = {"status": "down", "error": str(e)}

    # Exchange (HTTP reachability)
    try:
        t0 = time.perf_counter()
        async with httpx.AsyncClient(timeout=1.5) as client:
            res = await client.get("https://api.binance.com/api/v3/ping")
            res.raise_for_status()
        checks["exchange"] = {"status": "ok", "latency_ms": int((time.perf_counter() - t0) * 1000)}
    except Exception as e:  # noqa: BLE001
        checks["exchange"] = {"status": "down", "error": str(e)}

    overall = "ok" if all(v.get("status") == "ok" for v in checks.values()) else "degraded"

    return {
        "status": overall,
        "checks": checks,
        "latency_ms": int((time.perf_counter() - started) * 1000),
    }
