from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from time import time
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from app.core.db import get_db
from app.schemas.market import AggregateSeriesOut, CandleOut, CandleSeriesOut, Exchange
from app.services import market_clients
from app.services.market_clients import SYMBOL_MAP, align_and_average, fetch_candles, resolve_symbol
from app.services.market_store import get_cached, load_from_db, set_cached, upsert_candles

router = APIRouter(prefix="/market", tags=["market"])

DEFAULT_LIMIT = 200
MAX_LIMIT = 200000
TF_SECONDS = {"1s": 1, "5s": 5, "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "2h": 7200, "4h": 14400, "1d": 86400}


@router.get("/pairs")
async def list_pairs(
    persist: bool = Query(default=False, description="Persist fetched candles to Postgres (for backtest/trading). View mode should keep this false."),
    session: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    pairs: list[dict[str, Any]] = []
    for norm, per_ex in market_clients.SYMBOL_MAP.items():
        base_ex = next(iter(per_ex))
        symbol = market_clients.resolve_symbol(norm, base_ex)
        # Pull last price from 1m candle so UI updates frequently.
        last_price = None
        last_1m = await get_cached(base_ex, norm, "1m")
        if not last_1m and persist:
            last_1m = await load_from_db(session, exchange=base_ex, symbol=symbol, timeframe="1m", limit=1)
        if not last_1m:
            try:
                fresh_1m = await market_clients.fetch_candles(base_ex, norm, "1m", limit=2)
                fresh_1m_out = [
                    CandleOut(ts=c.ts, open=c.open, high=c.high, low=c.low, close=c.close, volume=c.volume)
                    for c in fresh_1m
                ]
                if fresh_1m_out:
                    await set_cached(base_ex, norm, "1m", fresh_1m_out)
                    if persist:
                        await upsert_candles(
                            session,
                            exchange=base_ex,
                            symbol=symbol,
                            normalized_pair=norm,
                            timeframe="1m",
                            candles=fresh_1m_out,
                        )
                    last_1m = fresh_1m_out[-1:]
            except httpx.HTTPError:
                pass
            except ValueError:
                pass
        if last_1m:
            last_price = last_1m[-1].close

        # Pull last 24h (1h bars) if present for lightweight stats.
        candles = await get_cached(base_ex, norm, "1h")
        if (not candles or len(candles) < 24) and persist:
            candles = await load_from_db(session, exchange=base_ex, symbol=symbol, timeframe="1h", limit=24)
        if not candles or len(candles) < 24:
            try:
                fresh = await market_clients.fetch_candles(base_ex, norm, "1h", limit=24)
                fresh_out = [CandleOut(ts=c.ts, open=c.open, high=c.high, low=c.low, close=c.close, volume=c.volume) for c in fresh]
                if fresh_out:
                    candles = fresh_out
                    await set_cached(base_ex, norm, "1h", fresh_out)
                    if persist:
                        await upsert_candles(
                            session,
                            exchange=base_ex,
                            symbol=symbol,
                            normalized_pair=norm,
                            timeframe="1h",
                            candles=fresh_out,
                        )
            except httpx.HTTPError:
                pass
        last = last_price if last_price is not None else (candles[-1].close if candles else None)
        change24h_pct: float | None = None
        # Always provide quote volume (USDT/USD) so UI volume filters work reliably.
        volume24h_quote: float = 0.0
        if candles:
            first = candles[0].close
            if first:
                change24h_pct = ((candles[-1].close - first) / first) * 100
            # Most exchanges report base volume for OHLCV; convert to quote by multiplying by close.
            # For USD-quoted pairs (coinbase) this is effectively the same scale as USDT for UI purposes.
            volume24h_quote = float(sum((c.volume or 0.0) * (c.close or 0.0) for c in candles))
        pairs.append(
            {
                "pair": norm,
                "exchanges": list(per_ex.keys()),
                "symbols": dict(per_ex),
                "kinds": market_clients.PAIR_KINDS.get(norm, ["perp", "spot"]),
                "last": last,
                "change24hPct": change24h_pct,
                "volume24hQuote": volume24h_quote,
            }
        )
    return pairs


@router.get("/candles", response_model=CandleSeriesOut)
async def get_candles(
    exchange: Exchange,
    pair: str,
    timeframe: str,
    limit: int = Query(default=DEFAULT_LIMIT, le=MAX_LIMIT, ge=1),
    persist: bool = Query(default=False, description="Persist fetched candles to Postgres (for backtest/trading). View mode should keep this false."),
    session: AsyncSession = Depends(get_db),
) -> CandleSeriesOut:
    timeframe = timeframe.lower()
    if timeframe not in market_clients.SUPPORTED_TF:
        raise HTTPException(status_code=400, detail="unsupported timeframe")

    if pair in SYMBOL_MAP and exchange not in SYMBOL_MAP[pair]:
        raise HTTPException(status_code=400, detail=f"pair {pair} not on {exchange}")

    cached = await get_cached(exchange, pair, timeframe)
    if cached:
        return CandleSeriesOut(exchange=exchange, pair=pair, timeframe=timeframe, candles=cached[-limit:])

    symbol = resolve_symbol(pair, exchange)
    # DB is only used when persistence is explicitly enabled.
    if persist:
        db_rows = await load_from_db(session, exchange=exchange, symbol=symbol, timeframe=timeframe, limit=limit)
        if db_rows:
            latest = db_rows[-1].ts / 1000
            if latest >= time() - TF_SECONDS.get(timeframe, 60) * 2:
                await set_cached(exchange, pair, timeframe, db_rows)
                return CandleSeriesOut(exchange=exchange, pair=pair, timeframe=timeframe, candles=db_rows)

    try:
        candles_raw = await fetch_candles(exchange, pair, timeframe, limit=limit)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"exchange error: {exc.response.status_code}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    candles = [CandleOut(ts=c.ts, open=c.open, high=c.high, low=c.low, close=c.close, volume=c.volume) for c in candles_raw]
    await set_cached(exchange, pair, timeframe, candles)
    if persist:
        await upsert_candles(session, exchange=exchange, symbol=symbol, normalized_pair=pair, timeframe=timeframe, candles=candles)
    return CandleSeriesOut(exchange=exchange, pair=pair, timeframe=timeframe, candles=candles)


@router.get("/candles/aggregate", response_model=AggregateSeriesOut)
async def get_candles_aggregate(
    exchanges: str = Query(..., description="comma-separated exchanges"),
    pair: str = Query(...),
    timeframe: str = Query(...),
    limit: int = Query(default=DEFAULT_LIMIT, le=MAX_LIMIT, ge=1),
    persist: bool = Query(default=False, description="Persist fetched candles to Postgres (for backtest/trading). View mode should keep this false."),
    session: AsyncSession = Depends(get_db),
) -> AggregateSeriesOut:
    timeframe = timeframe.lower()
    if timeframe not in market_clients.SUPPORTED_TF:
        raise HTTPException(status_code=400, detail="unsupported timeframe")

    ex_list = [e.strip().lower() for e in exchanges.split(",") if e.strip()]
    if not ex_list:
        raise HTTPException(status_code=400, detail="no exchanges provided")

    per_ex: dict[str, list[CandleOut]] = {}
    failures: list[str] = []
    for ex in ex_list:
        if ex not in market_clients.FETCHERS:
            raise HTTPException(status_code=400, detail=f"unsupported exchange {ex}")
        if pair in SYMBOL_MAP and ex not in SYMBOL_MAP[pair]:
            failures.append(f"{ex}:pair-not-supported")
            continue
        cached = await get_cached(ex, pair, timeframe)
        if cached:
            per_ex[ex] = cached[-limit:]
            continue
        symbol = resolve_symbol(pair, ex)
        if persist:
            db_rows = await load_from_db(session, exchange=ex, symbol=symbol, timeframe=timeframe, limit=limit)
            if db_rows:
                latest = db_rows[-1].ts / 1000
                if latest >= time() - TF_SECONDS.get(timeframe, 60) * 2:
                    per_ex[ex] = db_rows
                    await set_cached(ex, pair, timeframe, db_rows)
                    continue
        try:
            raw = await fetch_candles(ex, pair, timeframe, limit=limit)
        except httpx.HTTPStatusError as exc:
            failures.append(f"{ex}:{exc.response.status_code}")
            continue
        except ValueError as exc:
            failures.append(f"{ex}:{str(exc)}")
            continue
        rows = [CandleOut(ts=c.ts, open=c.open, high=c.high, low=c.low, close=c.close, volume=c.volume) for c in raw]
        await set_cached(ex, pair, timeframe, rows)
        if persist:
            await upsert_candles(session, exchange=ex, symbol=symbol, normalized_pair=pair, timeframe=timeframe, candles=rows)
        per_ex[ex] = rows

    if not per_ex:
        detail = "no exchange data"
        if failures:
            detail = f"no exchange data; failures: {', '.join(failures)}"
        raise HTTPException(status_code=502, detail=detail)

    aligned = align_and_average(
        {
            ex: [market_clients.Candle(c.ts, c.open, c.high, c.low, c.close, c.volume) for c in per_ex[ex]]
            for ex in per_ex
        }
    )
    aligned_candles = [
        CandleOut(ts=c.ts, open=c.open, high=c.high, low=c.low, close=c.close, volume=c.volume)
        for c in aligned
    ]

    # truncate to limit from tail
    aligned_candles = aligned_candles[-limit:]
    return AggregateSeriesOut(exchanges=ex_list, pair=pair, timeframe=timeframe, candles=aligned_candles)
