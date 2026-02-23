from __future__ import annotations

from app.node_platform.types import JsonDict, NodeExecutionContext


async def handle_input_run(ctx: NodeExecutionContext) -> JsonDict:
    defaults = None
    if isinstance(ctx.data, dict):
        defaults = ctx.data.get("defaults")

    out: JsonDict = {}
    if isinstance(defaults, dict):
        out.update(defaults)

    run_inputs = getattr(ctx.run, "inputs", None)
    if isinstance(run_inputs, dict):
        out.update(run_inputs)

    return out
