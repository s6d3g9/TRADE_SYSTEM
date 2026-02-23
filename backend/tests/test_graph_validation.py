from __future__ import annotations

from app.services.graph_validation import missing_required_run_inputs


def test_missing_required_run_inputs_empty_ok() -> None:
    assert missing_required_run_inputs([], {}) == []
    assert missing_required_run_inputs(["alignment_id"], {"alignment_id": "A1"}) == []


def test_missing_required_run_inputs_detects_none_and_blank() -> None:
    assert missing_required_run_inputs(["alignment_id"], {}) == ["alignment_id"]
    assert missing_required_run_inputs(["alignment_id"], {"alignment_id": None}) == ["alignment_id"]
    assert missing_required_run_inputs(["alignment_id"], {"alignment_id": ""}) == ["alignment_id"]
    assert missing_required_run_inputs(["alignment_id"], {"alignment_id": "   "}) == ["alignment_id"]
