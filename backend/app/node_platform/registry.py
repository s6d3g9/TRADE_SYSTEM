from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from app.node_platform.handlers.analysis_compare import handle_analysis_compare
from app.node_platform.handlers.input_run import handle_input_run
from app.node_platform.handlers.input_static import handle_input_static
from app.node_platform.handlers.system_validate_inputs import handle_system_validate_inputs
from app.node_platform.handlers.strategylab_generate_bot import handle_strategylab_generate_bot
from app.node_platform.handlers.strategylab_export_alignment import handle_strategylab_export_alignment
from app.node_platform.handlers.strategylab_hyperopt import handle_strategylab_hyperopt, meta_strategylab_hyperopt
from app.node_platform.handlers.trading_run_backtest import handle_trading_run_backtest
from app.node_platform.types import JsonDict, NodeExecutionContext, NodeKindCapabilities, NodeKindMeta


NodeHandler = Callable[[NodeExecutionContext], Awaitable[JsonDict]]


class NodeRegistry:
    def __init__(self) -> None:
        self._handlers: dict[str, NodeHandler] = {}
        self._meta: dict[str, NodeKindMeta] = {}

    def register(self, kind: str, handler: NodeHandler, meta: NodeKindMeta | None = None) -> None:
        if not kind or not isinstance(kind, str):
            raise ValueError("kind must be a non-empty string")
        self._handlers[kind] = handler
        if meta is not None:
            if meta.kind != kind:
                raise ValueError("meta.kind must match kind")
            self._meta[kind] = meta

    def get_meta(self, kind: str) -> NodeKindMeta | None:
        return self._meta.get(kind)

    def list_kinds(self) -> list[str]:
        return sorted(self._handlers.keys())

    def list_meta(self) -> list[NodeKindMeta]:
        # Return only those that provided metadata; callers can fallback to kind list.
        return [self._meta[k] for k in sorted(self._meta.keys())]

    def get(self, kind: str) -> NodeHandler | None:
        return self._handlers.get(kind)

    async def execute(self, ctx: NodeExecutionContext) -> JsonDict:
        handler = self.get(ctx.kind)
        if handler is None:
            # Unknown kinds are treated as a safe noop.
            return {"ok": True, "kind": ctx.kind}
        out = await handler(ctx)
        return out if isinstance(out, dict) else {"value": out}


_default_registry: NodeRegistry | None = None


def get_default_node_registry() -> NodeRegistry:
    global _default_registry
    if _default_registry is None:
        reg = NodeRegistry()
        reg.register(
            "system.validate_inputs",
            handle_system_validate_inputs,
            meta=NodeKindMeta(
                kind="system.validate_inputs",
                label="Validate Inputs",
                category="System",
                description="Internal: emitted when required run.inputs are missing.",
                hidden=True,
                inputs=("required", "provided"),
                outputs=("valid",),
                capabilities=NodeKindCapabilities(side_effects=False, idempotent=True, long_running=False),
            ),
        )

        reg.register(
            "input.static",
            handle_input_static,
            meta=NodeKindMeta(
                kind="input.static",
                label="Static Input",
                category="Input",
                description="Emits a constant value from node.data.value.",
                outputs=("value",),
                capabilities=NodeKindCapabilities(side_effects=False, idempotent=True, long_running=False),
            ),
        )
        reg.register(
            "input.run",
            handle_input_run,
            meta=NodeKindMeta(
                kind="input.run",
                label="Run Input",
                category="Input",
                description="Emits run.inputs merged over node.data.defaults.",
                outputs=("*",),
                capabilities=NodeKindCapabilities(side_effects=False, idempotent=True, long_running=False),
            ),
        )
        reg.register(
            "analysis.compare",
            handle_analysis_compare,
            meta=NodeKindMeta(
                kind="analysis.compare",
                label="Compare Analysis",
                category="Analysis",
                description="Runs analysis.compare pipeline and returns outputs/evidence.",
                inputs=("*",),
                outputs=("analysis_outputs", "analysis_evidence"),
                capabilities=NodeKindCapabilities(side_effects=True, idempotent=False, long_running=True),
            ),
        )
        reg.register(
            "strategylab.export_alignment",
            handle_strategylab_export_alignment,
            meta=NodeKindMeta(
                kind="strategylab.export_alignment",
                label="Export Alignment",
                category="StrategyLab",
                description="Builds a freqtrade export payload from a StrategyAlignment.",
                inputs=("alignment_id",),
                outputs=("strategy", "model", "alignment", "freqtrade", "freqai"),
                capabilities=NodeKindCapabilities(side_effects=False, idempotent=True, long_running=False),
            ),
        )
        reg.register(
            "strategylab.generate_bot",
            handle_strategylab_generate_bot,
            meta=NodeKindMeta(
                kind="strategylab.generate_bot",
                label="Generate Bot",
                category="StrategyLab",
                description="Writes bot config to /freqtrade/user_data/configs and upserts Bot row.",
                inputs=("alignment_id",),
                outputs=("bot_id", "config_path", "bot_name", "alignment_id"),
                capabilities=NodeKindCapabilities(side_effects=True, idempotent=True, long_running=False),
            ),
        )
        reg.register(
            "trading.run_backtest",
            handle_trading_run_backtest,
            meta=NodeKindMeta(
                kind="trading.run_backtest",
                label="Run Backtest",
                category="Trading",
                description="Runs Freqtrade backtest (Docker) and stores results.",
                inputs=("bot_id", "timerange"),
                outputs=("bot_id", "strategy", "status", "output", "backtest"),
                capabilities=NodeKindCapabilities(side_effects=True, idempotent=False, long_running=True),
            ),
        )
        
        reg.register(
            "strategylab.hyperopt",
            handle_strategylab_hyperopt,
            meta=meta_strategylab_hyperopt()
        )

        _default_registry = reg
    return _default_registry
