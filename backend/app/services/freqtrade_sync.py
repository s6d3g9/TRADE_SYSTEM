from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx


def _parse_ft_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    # Freqtrade typically returns "YYYY-MM-DD HH:MM:SS" without timezone.
    # Treat as UTC for consistency.
    try:
        dt = datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
        return dt.replace(tzinfo=timezone.utc)
    except ValueError:
        # If format changes, keep raw in meta and skip parsed timestamp.
        return None


@dataclass(frozen=True)
class FreqtradeTrade:
    ft_trade_id: str
    pair: str
    exchange: str
    is_open: bool
    amount: float
    open_rate: float
    open_trade_value: float | None
    open_date: datetime | None
    close_date: datetime | None
    raw: dict[str, Any]


class FreqtradeClient:
    def __init__(self, base_url: str, username: str | None, password: str | None) -> None:
        self._base_url = base_url.rstrip("/")
        self._username = username
        self._password = password

    async def _get_json(self, path: str) -> Any:
        auth = None
        if self._username is not None and self._password is not None:
            auth = (self._username, self._password)

        timeout = httpx.Timeout(10.0, read=20.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(f"{self._base_url}{path}", auth=auth, headers={"Accept": "application/json"})
            resp.raise_for_status()
            return resp.json()

    async def fetch_trades(self) -> list[FreqtradeTrade]:
        """Fetch both closed and open trades from Freqtrade API."""
        trades: list[dict[str, Any]] = []

        # Closed trades
        data = await self._get_json("/api/v1/trades")
        if isinstance(data, dict) and isinstance(data.get("trades"), list):
            trades.extend([t for t in data["trades"] if isinstance(t, dict)])

        # Open trades (status endpoint)
        status = await self._get_json("/api/v1/status")
        if isinstance(status, list):
            trades.extend([t for t in status if isinstance(t, dict)])

        out: list[FreqtradeTrade] = []
        seen: set[str] = set()
        for t in trades:
            ft_id = t.get("trade_id")
            if ft_id is None:
                continue
            ft_id_str = str(ft_id)
            if ft_id_str in seen:
                continue
            seen.add(ft_id_str)

            pair = str(t.get("pair") or "")
            exchange = str(t.get("exchange") or "")
            is_open = bool(t.get("is_open"))
            amount = float(t.get("amount") or 0.0)
            open_rate = float(t.get("open_rate") or 0.0)
            open_trade_value = t.get("open_trade_value")
            try:
                open_trade_value_f = float(open_trade_value) if open_trade_value is not None else None
            except Exception:
                open_trade_value_f = None

            out.append(
                FreqtradeTrade(
                    ft_trade_id=ft_id_str,
                    pair=pair,
                    exchange=exchange,
                    is_open=is_open,
                    amount=amount,
                    open_rate=open_rate,
                    open_trade_value=open_trade_value_f,
                    open_date=_parse_ft_dt(t.get("open_date")),
                    close_date=_parse_ft_dt(t.get("close_date")),
                    raw=t,
                )
            )

        return out
