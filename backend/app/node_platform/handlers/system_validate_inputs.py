from __future__ import annotations

from app.node_platform.types import JsonDict, NodeExecutionContext


async def handle_system_validate_inputs(ctx: NodeExecutionContext) -> JsonDict:
    # This node kind is primarily used as an internal synthetic run-node when
    # template input validation fails. If executed directly, treat it as a noop.
    _ = ctx
    return {"ok": True, "outputs": {"valid": True}, "summary": "Inputs validated"}
