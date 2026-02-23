from __future__ import annotations

from app.services.graph_executor import _collect_inputs_for_node, _flow_outputs


def test_collect_inputs_flat_merge_default() -> None:
    edges = [
        {"source": "a", "target": "b"},
        {"source": "c", "target": "b"},
    ]
    outputs_by_node = {
        "a": {"x": 1},
        "c": {"y": 2},
    }
    merged = _collect_inputs_for_node("b", edges, outputs_by_node)
    assert merged == {"x": 1, "y": 2}


def test_collect_inputs_with_target_handle_namespaces() -> None:
    edges = [
        {"source": "a", "target": "b", "targetHandle": "left"},
        {"source": "c", "target": "b", "targetHandle": "right"},
    ]
    outputs_by_node = {
        "a": {"x": 1},
        "c": {"y": 2},
    }
    merged = _collect_inputs_for_node("b", edges, outputs_by_node)
    assert merged == {"left": {"x": 1}, "right": {"y": 2}}


def test_collect_inputs_with_source_handle_selects_key() -> None:
    edges = [
        {"source": "a", "target": "b", "sourceHandle": "payload"},
    ]
    outputs_by_node = {
        "a": {"payload": {"x": 1}, "other": 123},
    }
    merged = _collect_inputs_for_node("b", edges, outputs_by_node)
    assert merged == {"x": 1}


def test_collect_inputs_with_source_and_target_handles() -> None:
    edges = [
        {"source": "a", "target": "b", "sourceHandle": "payload", "targetHandle": "in"},
    ]
    outputs_by_node = {
        "a": {"payload": {"x": 1}, "other": 123},
    }
    merged = _collect_inputs_for_node("b", edges, outputs_by_node)
    assert merged == {"in": {"x": 1}}


def test_flow_outputs_envelope() -> None:
    raw = {"outputs": {"x": 1}, "summary": "ok", "meta": {"k": 1}}
    assert _flow_outputs(raw) == {"x": 1}


def test_flow_outputs_legacy_dict() -> None:
    raw = {"x": 1}
    assert _flow_outputs(raw) == {"x": 1}
