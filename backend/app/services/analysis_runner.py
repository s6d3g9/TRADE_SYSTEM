from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analysis import AnalysisRun
from app.models.trading import Backtest, Trade


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def execute_analysis_run(session: AsyncSession, run: AnalysisRun) -> AnalysisRun:
    """Execute a lightweight analysis based on run.inputs.

    This is intentionally minimal: it provides a working end-to-end pipeline
    (create run -> execute -> persist outputs) that we can extend later.

    Expected inputs keys (optional):
    - backtest_ids: list[str]
    - bot_ids: list[str]
    - live_from/live_to: ISO strings
    """

    inputs: dict[str, Any] = run.inputs or {}
    backtest_ids: list[str] = [str(x) for x in (inputs.get("backtest_ids") or [])]
    bot_ids: list[str] = [str(x) for x in (inputs.get("bot_ids") or [])]

    # Pull backtest summaries
    backtests: list[Backtest] = []
    if backtest_ids:
        res = await session.execute(select(Backtest).where(Backtest.backtest_id.in_(backtest_ids)))
        backtests = res.scalars().all()

    # Pull lightweight live trade stats per bot (if available)
    live_stats: dict[str, Any] = {}
    if bot_ids:
        res = await session.execute(select(Trade).where(Trade.bot_id.in_(bot_ids)))
        trades = res.scalars().all()

        by_bot: dict[str, list[Trade]] = {}
        for t in trades:
            by_bot.setdefault(t.bot_id, []).append(t)

        for bot_id, ts in by_bot.items():
            closed = [t for t in ts if t.status == "closed" and t.meta is not None]
            # Try to read pnl from meta (best effort).
            pnls: list[float] = []
            for t in closed:
                v = None
                if isinstance(t.meta, dict):
                    v = t.meta.get("pnl") or t.meta.get("profit_abs") or t.meta.get("profit")
                try:
                    if v is not None:
                        pnls.append(float(v))
                except Exception:
                    continue
            live_stats[bot_id] = {
                "total_trades": len(ts),
                "closed_trades": len(closed),
                "pnl_sum": sum(pnls) if pnls else None,
            }

    # Build output payload
    backtest_items: list[dict[str, Any]] = []
    for b in backtests:
        backtest_items.append(
            {
                "backtest_id": b.backtest_id,
                "bot_id": b.bot_id,
                "alignment_id": b.alignment_id,
                "strategy_name": b.strategy_name,
                "pair": b.pair,
                "timeframe": b.timeframe,
                "status": b.status,
                "created_at": b.created_at.isoformat() if b.created_at else None,
                "total_return_percent": float(b.total_return_percent) if b.total_return_percent is not None else None,
                "sharpe_ratio": float(b.sharpe_ratio) if b.sharpe_ratio is not None else None,
                "max_drawdown_percent": float(b.max_drawdown_percent) if b.max_drawdown_percent is not None else None,
                "win_rate": float(b.win_rate) if b.win_rate is not None else None,
                "profit_factor": float(b.profit_factor) if b.profit_factor is not None else None,
                "total_trades": int(b.total_trades) if b.total_trades is not None else 0,
                "avg_trade_return": float(b.avg_trade_return) if b.avg_trade_return is not None else None,
            }
        )

    best_backtest = None
    if backtest_items:
        best_backtest = sorted(
            backtest_items,
            key=lambda x: (x.get("total_return_percent") is None, -(x.get("total_return_percent") or 0.0)),
        )[0]

    run.outputs = {
        "backtests": backtest_items,
        "best_backtest": best_backtest,
        "live_stats": live_stats,
        "notes": [
            "This is a minimal v1 analysis runner.",
            "Next steps: add slicing (pair/timeframe/regime), reality-gap metrics, and correlations.",
        ],
    }
    run.evidence = {
        "executed_at": _now().isoformat(),
        "backtest_ids": backtest_ids,
        "bot_ids": bot_ids,
    }

    return run
