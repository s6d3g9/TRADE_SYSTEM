from __future__ import annotations

from app.node_platform.types import JsonDict, NodeExecutionContext
from app.services.strategylab_export import build_alignment_export_payload


async def handle_strategylab_export_alignment(ctx: NodeExecutionContext) -> JsonDict:
    alignment_id = None
    if isinstance(ctx.inputs, dict):
        alignment_id = ctx.inputs.get("alignment_id")
    if alignment_id is None and isinstance(ctx.data, dict):
        alignment_id = ctx.data.get("alignment_id")

    alignment_id = str(alignment_id or "").strip()
    if not alignment_id:
        raise ValueError("strategylab.export_alignment requires alignment_id")

    out = await build_alignment_export_payload(ctx.session, alignment_id)
    return {
        "outputs": out,
        "summary": "Exported alignment config payload",
        "meta": {"kind": ctx.kind, "alignment_id": alignment_id},
    }
