from __future__ import annotations

from app.services.graph_templates import alignment_backtest_template_definition
from app.services.graph_templates import is_alignment_backtest_template_definition


def test_template_definition_has_catalog_meta() -> None:
    d = alignment_backtest_template_definition()
    meta = d.get("meta")
    assert isinstance(meta, dict)
    assert meta.get("template") is True
    assert meta.get("kind") == "alignment_backtest"
    assert meta.get("required_inputs") == ["alignment_id"]
    assert meta.get("optional_inputs") == ["timerange"]


def test_is_alignment_backtest_template_definition() -> None:
    d = alignment_backtest_template_definition()
    assert is_alignment_backtest_template_definition(d) is True
    assert is_alignment_backtest_template_definition({"meta": {"template": True, "kind": "other"}}) is False
