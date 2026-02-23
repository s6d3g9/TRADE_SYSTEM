from __future__ import annotations

from app.node_platform.types import JsonDict, NodeExecutionContext
from app.services.strategylab_bots import generate_bot_for_alignment


async def handle_strategylab_generate_bot(ctx: NodeExecutionContext) -> JsonDict:
    alignment_id = None
    if isinstance(ctx.inputs, dict):
        alignment_id = ctx.inputs.get("alignment_id")
    if alignment_id is None and isinstance(ctx.data, dict):
        alignment_id = ctx.data.get("alignment_id")

    alignment_id = str(alignment_id or "").strip()
    if not alignment_id:
        raise ValueError("strategylab.generate_bot requires alignment_id")

    out = await generate_bot_for_alignment(alignment_id, ctx.session, user_id=ctx.run.user_id)
    bot_id = out.get("bot_id") if isinstance(out, dict) else None
    return {
        "outputs": out,
        "summary": f"Generated bot {bot_id}" if bot_id else "Generated bot",
        "meta": {"kind": ctx.kind},
    }
