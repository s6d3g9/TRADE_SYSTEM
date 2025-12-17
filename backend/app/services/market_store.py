from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy import insert, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.models.market import MarketCandle
from app.schemas.market import CandleOut

CACHE_KEY_FMT = "candles:{exchange}:{pair}:{tf}"
CACHE_TTL_SEC_DEFAULT = 30


def _cache_ttl_sec(timeframe: str) -> int:
    tf = (timeframe or "").lower()
    if tf in {"1s", "5s"}:
        return 2
    if tf in {"1m", "5m", "15m", "30m"}:
        return 5
    return CACHE_TTL_SEC_DEFAULT


def _candles_to_cache(candles: Iterable[CandleOut]) -> str:
    return json.dumps([c.model_dump() for c in candles])


def _candles_from_cache(raw: str) -> list[CandleOut]:
    data = json.loads(raw)
    return [CandleOut(**c) for c in data]


def _dt_from_ts(ts_ms: int) -> datetime:
    return datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)


def _ts_ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


async def get_cached(exchange: str, pair: str, timeframe: str) -> list[CandleOut] | None:
    redis = get_redis()
    raw = await redis.get(CACHE_KEY_FMT.format(exchange=exchange, pair=pair, tf=timeframe))
    if not raw:
        return None
    return _candles_from_cache(raw)


async def set_cached(exchange: str, pair: str, timeframe: str, candles: list[CandleOut]) -> None:
    redis = get_redis()
    await redis.set(
        CACHE_KEY_FMT.format(exchange=exchange, pair=pair, tf=timeframe),
        _candles_to_cache(candles),
        ex=_cache_ttl_sec(timeframe),
    )


async def upsert_candles(
    session: AsyncSession,
    *,
    exchange: str,
    symbol: str,
    normalized_pair: str,
    timeframe: str,
    candles: list[CandleOut],
) -> None:
    if not candles:
        return
    rows = [
        {
            "exchange": exchange,
            "symbol": symbol,
            "normalized_pair": normalized_pair,
            "timeframe": timeframe,
            "ts": _dt_from_ts(c.ts),
            "open": c.open,
            "high": c.high,
            "low": c.low,
            "close": c.close,
            "volume": c.volume,
        }
        for c in candles
    ]
    stmt = pg_insert(MarketCandle).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=[MarketCandle.exchange, MarketCandle.symbol, MarketCandle.timeframe, MarketCandle.ts],
        set_={
            "open": stmt.excluded.open,
            "high": stmt.excluded.high,
            "low": stmt.excluded.low,
            "close": stmt.excluded.close,
            "volume": stmt.excluded.volume,
        },
    )
    await session.execute(stmt)
    await session.commit()


async def load_from_db(
    session: AsyncSession,
    *,
    exchange: str,
    symbol: str,
    timeframe: str,
    limit: int,
) -> list[CandleOut]:
    stmt = (
        select(MarketCandle)
        .where(
            MarketCandle.exchange == exchange,
            MarketCandle.symbol == symbol,
            MarketCandle.timeframe == timeframe,
        )
        .order_by(MarketCandle.ts.desc())
        .limit(limit)
    )
    res = await session.execute(stmt)
    rows = res.scalars().all()
    rows = list(reversed(rows))
    return [
        CandleOut(
          ts=_ts_ms(r.ts),
          open=r.open,
          high=r.high,
          low=r.low,
          close=r.close,
          volume=r.volume,
        )
        for r in rows
    ]
