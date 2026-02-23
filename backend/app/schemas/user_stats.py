from __future__ import annotations

from decimal import Decimal
from pydantic import BaseModel, field_serializer


class UserStats(BaseModel):
    """User overview statistics"""

    @field_serializer(
        "total_pnl",
        "total_pnl_percent",
        "win_rate",
        "best_bot_pnl",
        when_used="json",
    )
    def _ser_decimals(self, v: Decimal | None) -> float | None:  # noqa: ANN001
        return float(v) if v is not None else None
    
    user_id: str
    total_bots: int
    active_bots: int
    total_sessions: int
    total_trades: int
    open_positions: int
    total_pnl: Decimal
    total_pnl_percent: Decimal
    win_rate: Decimal
    best_bot_id: str | None = None
    best_bot_name: str | None = None
    best_bot_pnl: Decimal | None = None
