from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Exchange = Literal["binance", "okx", "bybit", "kraken", "coinbase"]


class CandleOut(BaseModel):
    ts: int = Field(description="timestamp in ms")
    open: float
    high: float
    low: float
    close: float
    volume: float


class CandleSeriesOut(BaseModel):
    exchange: Exchange | str
    pair: str
    timeframe: str
    candles: list[CandleOut]


class AggregateSeriesOut(BaseModel):
    exchanges: list[Exchange | str]
    pair: str
    timeframe: str
    candles: list[CandleOut]


class StoredCandle(BaseModel):
    exchange: str
    symbol: str
    normalized_pair: str
    timeframe: str
    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float

    @classmethod
    def from_row(cls, row: "MarketCandle") -> "StoredCandle":  # type: ignore[name-defined]
        return cls(
            exchange=row.exchange,
            symbol=row.symbol,
            normalized_pair=row.normalized_pair,
            timeframe=row.timeframe,
            ts=row.ts,
            open=row.open,
            high=row.high,
            low=row.low,
            close=row.close,
            volume=row.volume,
        )
