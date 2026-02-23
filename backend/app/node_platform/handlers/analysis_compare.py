from __future__ import annotations

from datetime import datetime, timezone

from app.models.analysis import AnalysisRun
from app.node_platform.types import JsonDict, NodeExecutionContext
from app.services.analysis_runner import execute_analysis_run


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def handle_analysis_compare(ctx: NodeExecutionContext) -> JsonDict:
    # Create ephemeral AnalysisRun row for audit and reuse existing runner.
    ar = AnalysisRun(
        run_id=f"graph:{ctx.run.run_id}:{ctx.node_id}",
        user_id=ctx.run.user_id,
        kind="compare",
        status="running",
        inputs={**(ctx.run.inputs or {}), **ctx.inputs, **ctx.data},
        outputs={},
        evidence={},
    )
    ctx.session.add(ar)
    await ctx.session.flush()
    await ctx.session.refresh(ar)

    ar = await execute_analysis_run(ctx.session, ar)
    ar.status = "completed"
    ar.completed_at = _utcnow()
    ar.updated_at = _utcnow()
    await ctx.session.flush()

    return {"analysis_outputs": ar.outputs, "analysis_evidence": ar.evidence}
