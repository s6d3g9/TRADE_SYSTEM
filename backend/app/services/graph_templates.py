from __future__ import annotations

from typing import Any


def is_alignment_backtest_template_definition(defn: dict[str, Any]) -> bool:
    if not isinstance(defn, dict):
        return False
    meta = defn.get("meta")
    if not isinstance(meta, dict):
        return False
    return meta.get("template") is True and meta.get("kind") == "alignment_backtest"


def alignment_backtest_template_definition() -> dict[str, Any]:
    return {
        "nodes": [
            {
                "id": "input",
                "type": "input.run",
                "position": {"x": 0, "y": 0},
                "data": {"defaults": {}},
            },
            {
                "id": "generate_bot",
                "type": "strategylab.generate_bot",
                "position": {"x": 350, "y": 0},
                "data": {},
            },
            {
                "id": "run_backtest",
                "type": "trading.run_backtest",
                "position": {"x": 700, "y": 0},
                "data": {},
            },
        ],
        "edges": [
            {"id": "e-input-generate_bot", "source": "input", "target": "generate_bot"},
            {"id": "e-input-run_backtest", "source": "input", "target": "run_backtest"},
            {"id": "e-generate_bot-run_backtest", "source": "generate_bot", "target": "run_backtest"},
        ],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
        "meta": {
            "template": True,
            "kind": "alignment_backtest",
            "name": "Alignment → Generate Bot → Backtest",
            "required_inputs": ["alignment_id"],
            "optional_inputs": ["timerange"],
        },
    }


def alignment_backtest_definition(*, alignment_id: str, timerange: str | None) -> dict[str, Any]:
    alignment_id_s = str(alignment_id or "").strip()
    if not alignment_id_s:
        raise ValueError("alignment_id is required")

    timerange_s = None
    if timerange is not None:
        timerange_s = str(timerange).strip()
        if timerange_s == "":
            timerange_s = None

    value: dict[str, Any] = {"alignment_id": alignment_id_s}
    if timerange_s is not None:
        value["timerange"] = timerange_s

    return {
        "nodes": [
            {
                "id": "input",
                "type": "input.static",
                "position": {"x": 0, "y": 0},
                "data": {"value": value},
            },
            {
                "id": "generate_bot",
                "type": "strategylab.generate_bot",
                "position": {"x": 350, "y": 0},
                "data": {},
            },
            {
                "id": "run_backtest",
                "type": "trading.run_backtest",
                "position": {"x": 700, "y": 0},
                "data": {},
            },
        ],
        "edges": [
            {"id": "e-input-generate_bot", "source": "input", "target": "generate_bot"},
            {"id": "e-input-run_backtest", "source": "input", "target": "run_backtest"},
            {"id": "e-generate_bot-run_backtest", "source": "generate_bot", "target": "run_backtest"},
        ],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
        "meta": {
            "template": True,
            "kind": "alignment_backtest_static",
            "name": "Alignment → Generate Bot → Backtest",
        },
    }
