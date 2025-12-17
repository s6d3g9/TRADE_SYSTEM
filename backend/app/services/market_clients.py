from __future__ import annotations

import asyncio
import math
from datetime import datetime, timezone
from typing import Literal

import httpx

Exchange = Literal["binance", "okx", "bybit", "kraken", "coinbase"]

# Normalized timeframe identifiers we support.
# Note: sub-minute candles are only supported for Binance via trade aggregation.
SUPPORTED_TF = {"1s", "5s", "1m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"}


async def _fetch_binance_agg_trades(symbol: str, start_ms: int, end_ms: int) -> list[dict]:
    url = "https://api.binance.com/api/v3/aggTrades"
    params = {
        "symbol": symbol,
        "startTime": str(start_ms),
        "endTime": str(end_ms),
        "limit": "1000",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(url, params=params)
        res.raise_for_status()
        return res.json()


async def fetch_binance_subminute(pair: str, tf: str, limit: int = 200) -> list[Candle]:
    interval_ms = 1000 if tf == "1s" else 5000
    # Keep this bounded: aggregating trades is heavier than klines.
    limit = max(1, min(limit, 5000))
    end_ms = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
    start_ms = end_ms - limit * interval_ms

    trades: list[dict] = []
    cursor = start_ms
    # Hard cap pages to avoid long loops.
    for _ in range(25):
        batch = await _fetch_binance_agg_trades(pair, cursor, end_ms)
        if not batch:
            break
        trades.extend(batch)
        last_ts = int(batch[-1]["T"])
        cursor = last_ts + 1
        if len(batch) < 1000 or cursor >= end_ms:
            break

    buckets: dict[int, dict[str, float]] = {}
    for t in trades:
        ts = int(t["T"])  # ms
        price = float(t["p"])
        qty = float(t["q"])  # base qty
        bucket_ts = (ts // interval_ms) * interval_ms
        b = buckets.get(bucket_ts)
        if b is None:
            buckets[bucket_ts] = {
                "open": price,
                "high": price,
                "low": price,
                "close": price,
                "volume": qty,
            }
        else:
            b["high"] = max(b["high"], price)
            b["low"] = min(b["low"], price)
            b["close"] = price
            b["volume"] += qty

    out: list[Candle] = []
    for ts in sorted(buckets.keys()):
        b = buckets[ts]
        out.append(Candle(ts, b["open"], b["high"], b["low"], b["close"], b["volume"]))
    return out[-limit:]


class Candle:
    __slots__ = ("ts", "open", "high", "low", "close", "volume")

    def __init__(self, ts: int, open: float, high: float, low: float, close: float, volume: float) -> None:
        self.ts = ts
        self.open = open
        self.high = high
        self.low = low
        self.close = close
        self.volume = volume

    def as_tuple(self) -> tuple[int, float, float, float, float, float]:
        return (self.ts, self.open, self.high, self.low, self.close, self.volume)


def _tf_binance(tf: str) -> str:
    return tf.replace("m", "m").replace("h", "h").replace("d", "d")


def _tf_okx(tf: str) -> str:
    mapping = {
        "1m": "1m",
        "5m": "5m",
        "15m": "15m",
        "30m": "30m",
        "1h": "1H",
        "2h": "2H",
        "4h": "4H",
        "1d": "1D",
    }
    out = mapping.get(tf)
    if not out:
        raise ValueError("unsupported timeframe for okx")
    return out


def _tf_bybit(tf: str) -> str:
    mapping = {"1m": "1", "5m": "5", "15m": "15", "30m": "30", "1h": "60", "2h": "120", "4h": "240", "1d": "D"}
    out = mapping.get(tf)
    if not out:
        raise ValueError("unsupported timeframe for bybit")
    return out


def _tf_kraken(tf: str) -> str:
    mapping = {"1m": "1", "5m": "5", "15m": "15", "30m": "30", "1h": "60", "2h": "120", "4h": "240", "1d": "1440"}
    out = mapping.get(tf)
    if not out:
        raise ValueError("unsupported timeframe for kraken")
    return out


def _tf_coinbase(tf: str) -> str:
    # Coinbase supports a fixed set of granularities; keep this strict.
    mapping = {"1m": "60", "5m": "300", "15m": "900", "1h": "3600", "4h": "14400", "1d": "86400"}
    out = mapping.get(tf)
    if not out:
        raise ValueError("unsupported timeframe for coinbase")
    return out


# Normalized symbol -> per exchange symbol map (minimal demo set)
SYMBOL_MAP = {
    # majors
    "BTC/USDT": {
        "binance": "BTCUSDT",
        "okx": "BTC-USDT",
        "bybit": "BTCUSDT",
        "kraken": "XBTUSDT",
        "coinbase": "BTC-USD",
    },
    "ETH/USDT": {
        "binance": "ETHUSDT",
        "okx": "ETH-USDT",
        "bybit": "ETHUSDT",
        "kraken": "ETHUSDT",
        "coinbase": "ETH-USD",
    },
    "SOL/USDT": {
        "binance": "SOLUSDT",
        "okx": "SOL-USDT",
        "bybit": "SOLUSDT",
        "kraken": "SOLUSDT",
        "coinbase": "SOL-USD",
    },
    "BNB/USDT": {
        "binance": "BNBUSDT",
        "okx": "BNB-USDT",
        "bybit": "BNBUSDT",
    },
    "XRP/USDT": {
        "binance": "XRPUSDT",
        "okx": "XRP-USDT",
        "bybit": "XRPUSDT",
        "kraken": "XRPUSDT",
    },
    "ADA/USDT": {
        "binance": "ADAUSDT",
        "okx": "ADA-USDT",
        "bybit": "ADAUSDT",
        "kraken": "ADAUSDT",
    },
    "DOGE/USDT": {
        "binance": "DOGEUSDT",
        "okx": "DOGE-USDT",
        "bybit": "DOGEUSDT",
        "kraken": "XDGUSDT",
    },
    "LTC/USDT": {
        "binance": "LTCUSDT",
        "okx": "LTC-USDT",
        "bybit": "LTCUSDT",
        "kraken": "LTCUSDT",
    },
    "AVAX/USDT": {
        "binance": "AVAXUSDT",
        "okx": "AVAX-USDT",
        "bybit": "AVAXUSDT",
        "kraken": "AVAXUSDT",
    },
    "DOT/USDT": {
        "binance": "DOTUSDT",
        "okx": "DOT-USDT",
        "bybit": "DOTUSDT",
        "kraken": "DOTUSDT",
    },
    "MATIC/USDT": {
        "binance": "MATICUSDT",
        "okx": "MATIC-USDT",
        "bybit": "MATICUSDT",
        "kraken": "MATICUSDT",
    },
    "LINK/USDT": {
        "binance": "LINKUSDT",
        "okx": "LINK-USDT",
        "bybit": "LINKUSDT",
        "kraken": "LINKUSDT",
    },
    "TRX/USDT": {
        "binance": "TRXUSDT",
        "okx": "TRX-USDT",
        "bybit": "TRXUSDT",
        "kraken": "TRXUSDT",
    },
    "OP/USDT": {
        "binance": "OPUSDT",
        "okx": "OP-USDT",
        "bybit": "OPUSDT",
    },
    "ARB/USDT": {
        "binance": "ARBUSDT",
        "okx": "ARB-USDT",
        "bybit": "ARBUSDT",
    },
    "APT/USDT": {
        "binance": "APTUSDT",
        "okx": "APT-USDT",
        "bybit": "APTUSDT",
    },
    "ATOM/USDT": {
        "binance": "ATOMUSDT",
        "okx": "ATOM-USDT",
        "bybit": "ATOMUSDT",
        "kraken": "ATOMUSDT",
    },
    "NEAR/USDT": {
        "binance": "NEARUSDT",
        "okx": "NEAR-USDT",
        "bybit": "NEARUSDT",
    },
    "AAVE/USDT": {
        "binance": "AAVEUSDT",
        "okx": "AAVE-USDT",
        "bybit": "AAVEUSDT",
        "kraken": "AAVEUSDT",
    },
}

# Basic classification for UI filtering. Defaults keep pairs in both spot/perp buckets.
PAIR_KINDS: dict[str, list[str]] = {pair: ["perp", "spot"] for pair in SYMBOL_MAP}


def resolve_symbol(normalized: str, exchange: Exchange) -> str:
    if normalized in SYMBOL_MAP and exchange in SYMBOL_MAP[normalized]:
        return SYMBOL_MAP[normalized][exchange]
    # fallback: if user already passed exchange native symbol
    return normalized.replace("/", "")


async def fetch_binance(pair: str, tf: str, limit: int = 200) -> list[Candle]:
    if tf in {"1s", "5s"}:
        return await fetch_binance_subminute(pair, tf, limit=limit)
    url = "https://api.binance.com/api/v3/klines"
    params = {"symbol": pair, "interval": _tf_binance(tf), "limit": str(limit)}
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(url, params=params)
        res.raise_for_status()
        data = res.json()
    out: list[Candle] = []
    for k in data:
        # open time in ms
        out.append(Candle(int(k[0]), float(k[1]), float(k[2]), float(k[3]), float(k[4]), float(k[5])))
    return out


async def fetch_okx(pair: str, tf: str, limit: int = 200) -> list[Candle]:
    url = "https://www.okx.com/api/v5/market/candles"
    params = {"instId": pair, "bar": _tf_okx(tf), "limit": str(limit)}
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(url, params=params)
        res.raise_for_status()
        data = res.json()["data"]
    out: list[Candle] = []
    for k in data:
        # OKX returns reverse chronological
        out.append(Candle(int(k[0]), float(k[1]), float(k[2]), float(k[3]), float(k[4]), float(k[5])))
    return list(reversed(out))


async def fetch_bybit(pair: str, tf: str, limit: int = 200) -> list[Candle]:
    url = "https://api.bybit.com/v5/market/kline"
    params = {"category": "linear", "symbol": pair, "interval": _tf_bybit(tf), "limit": str(limit)}
    headers = {"User-Agent": "TRADE_SYSTEM/1.0 (bybit fetch)"}
    async with httpx.AsyncClient(timeout=10, headers=headers) as client:
        res = await client.get(url, params=params)
        res.raise_for_status()
        data = res.json()["result"]["list"]
    out: list[Candle] = []
    for k in data:
        # list: [start, open, high, low, close, volume, turnover]
        out.append(Candle(int(k[0]), float(k[1]), float(k[2]), float(k[3]), float(k[4]), float(k[5])))
    return list(reversed(out))


async def fetch_kraken(pair: str, tf: str, limit: int = 200) -> list[Candle]:
    url = "https://api.kraken.com/0/public/OHLC"
    params = {"pair": pair, "interval": _tf_kraken(tf)}
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(url, params=params)
        res.raise_for_status()
        data = res.json()["result"]
    # take first key (pair)
    series = next(v for k, v in data.items() if k != "last")
    # kraken returns [time, open, high, low, close, vwap, volume, count]
    out: list[Candle] = []
    for row in series[-limit:]:
        ts_sec = int(row[0])
        out.append(Candle(ts_sec * 1000, float(row[1]), float(row[2]), float(row[3]), float(row[4]), float(row[6])))
    return out


async def fetch_coinbase(pair: str, tf: str, limit: int = 200) -> list[Candle]:
    url = f"https://api.exchange.coinbase.com/products/{pair}/candles"
    params = {"granularity": _tf_coinbase(tf), "limit": str(limit)}
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(url, params=params)
        res.raise_for_status()
        data = res.json()
    # coinbase returns [time, low, high, open, close, volume] in seconds, reverse chronological
    out: list[Candle] = []
    for row in data:
        ts_sec = int(row[0])
        out.append(Candle(ts_sec * 1000, float(row[3]), float(row[2]), float(row[1]), float(row[4]), float(row[5])))
    return list(reversed(out))


FETCHERS: dict[Exchange, callable[[str, str, int], asyncio.Future]] = {
    "binance": fetch_binance,
    "okx": fetch_okx,
    "bybit": fetch_bybit,
    "kraken": fetch_kraken,
    "coinbase": fetch_coinbase,
}


async def fetch_candles(exchange: Exchange, normalized_pair: str, timeframe: str, limit: int = 200) -> list[Candle]:
    if timeframe not in SUPPORTED_TF:
        raise ValueError("unsupported timeframe")
    pair = resolve_symbol(normalized_pair, exchange)
    fn = FETCHERS[exchange]
    candles = await fn(pair, timeframe, limit)
    # ensure sorted asc by ts
    candles = sorted(candles, key=lambda c: c.ts)
    return candles[-limit:]


def align_and_average(series: dict[Exchange, list[Candle]]) -> list[Candle]:
    if not series:
        return []
    # Determine common timestamps (intersection)
    sets = [set(c.ts for c in candles) for candles in series.values() if candles]
    if not sets:
        return []
    common = set.intersection(*sets) if len(sets) > 1 else sets[0]
    aligned_ts = sorted(common)
    out: list[Candle] = []
    for ts in aligned_ts:
        acc = {"open": 0.0, "high": -math.inf, "low": math.inf, "close": 0.0, "volume": 0.0}
        count = 0
        for candles in series.values():
            cmap = {c.ts: c for c in candles}
            c = cmap.get(ts)
            if not c:
                continue
            acc["open"] += c.open
            acc["high"] = max(acc["high"], c.high)
            acc["low"] = min(acc["low"], c.low)
            acc["close"] += c.close
            acc["volume"] += c.volume
            count += 1
        if count == 0:
            continue
        out.append(
            Candle(
                ts=ts,
                open=acc["open"] / count,
                high=acc["high"],
                low=acc["low"],
                close=acc["close"] / count,
                volume=acc["volume"] / count,
            )
        )
    return out


def now_ts_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)
