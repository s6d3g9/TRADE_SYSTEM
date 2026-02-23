from __future__ import annotations

from app.node_platform.types import JsonDict, NodeExecutionContext
from app.services.trading_backtest import run_backtest_for_bot


async def handle_trading_run_backtest(ctx: NodeExecutionContext) -> JsonDict:
    bot_id = None
    timerange = None

    if isinstance(ctx.inputs, dict):
        bot_id = ctx.inputs.get("bot_id")
        timerange = ctx.inputs.get("timerange")

    if bot_id is None and isinstance(ctx.data, dict):
        bot_id = ctx.data.get("bot_id")
    if timerange is None and isinstance(ctx.data, dict):
        timerange = ctx.data.get("timerange")

    bot_id = str(bot_id or "").strip()
    timerange_s = str(timerange).strip() if timerange is not None else None
    if timerange_s == "":
        timerange_s = None

    if not bot_id:
        raise ValueError("trading.run_backtest requires bot_id")

    out = await run_backtest_for_bot(bot_id=bot_id, timerange=timerange_s, session=ctx.session)
    status = out.get("status") if isinstance(out, dict) else None
    return {
        "outputs": out,
        "summary": f"Backtest {status}" if status else "Backtest completed",
        "meta": {"kind": ctx.kind, "timerange": timerange_s},
    }
