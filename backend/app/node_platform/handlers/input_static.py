from __future__ import annotations

from app.node_platform.types import JsonDict, NodeExecutionContext


async def handle_input_static(ctx: NodeExecutionContext) -> JsonDict:
    out = ctx.data.get("value")
    return out if isinstance(out, dict) else {"value": out}
