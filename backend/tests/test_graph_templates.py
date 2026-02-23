from __future__ import annotations

from app.services.graph_templates import alignment_backtest_definition, alignment_backtest_template_definition


def test_alignment_backtest_template_definition_shape() -> None:
    d = alignment_backtest_template_definition()
    assert isinstance(d, dict)
    assert "nodes" in d and isinstance(d["nodes"], list) and len(d["nodes"]) == 3
    assert "edges" in d and isinstance(d["edges"], list) and len(d["edges"]) == 3

    nodes_by_id = {n["id"]: n for n in d["nodes"]}
    assert nodes_by_id["input"]["type"] == "input.run"
    assert nodes_by_id["generate_bot"]["type"] == "strategylab.generate_bot"
    assert nodes_by_id["run_backtest"]["type"] == "trading.run_backtest"

    meta = d.get("meta")
    assert isinstance(meta, dict)
    assert meta.get("kind") == "alignment_backtest"
    assert meta.get("template") is True


def test_alignment_backtest_definition_static_embeds_inputs() -> None:
    d = alignment_backtest_definition(alignment_id="A1", timerange=None)
    nodes_by_id = {n["id"]: n for n in d["nodes"]}
    assert nodes_by_id["input"]["type"] == "input.static"
    value = nodes_by_id["input"]["data"]["value"]
    assert value["alignment_id"] == "A1"
    assert "timerange" not in value
