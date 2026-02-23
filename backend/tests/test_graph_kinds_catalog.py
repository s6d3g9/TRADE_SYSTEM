from __future__ import annotations

from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api.deps import get_current_user
from app.main import app
from app.node_platform.registry import get_default_node_registry
from app.services.graph_templates import alignment_backtest_template_definition, alignment_backtest_definition


def _kinds_from_def(defn: dict) -> set[str]:
    nodes = defn.get("nodes") or []
    out: set[str] = set()
    for n in nodes:
        if not isinstance(n, dict):
            continue
        kind = n.get("type") or n.get("kind")
        if kind is None:
            continue
        out.add(str(kind))
    return out


def test_template_node_kinds_are_registered() -> None:
    reg = get_default_node_registry()
    registered = set(reg.list_kinds())

    template_def = alignment_backtest_template_definition()
    static_def = alignment_backtest_definition(alignment_id="A1", timerange=None)

    template_kinds = _kinds_from_def(template_def)
    static_kinds = _kinds_from_def(static_def)

    missing = sorted((template_kinds | static_kinds) - registered)
    assert missing == [], f"Unregistered node kinds referenced by templates: {missing}"


def test_executor_system_validate_inputs_is_registered() -> None:
    reg = get_default_node_registry()
    assert "system.validate_inputs" in set(reg.list_kinds())
    meta = reg.get_meta("system.validate_inputs")
    assert meta is not None


def test_graphs_kinds_endpoint_matches_registry() -> None:
    # This endpoint is auth-protected; override auth dependency for a pure contract test.
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(user_id="test-user")
    try:
        client = TestClient(app)
        res = client.get("/graphs/kinds")
        assert res.status_code == 200

        data = res.json()
        assert set(data.keys()) >= {"items", "total"}
        assert isinstance(data["items"], list)
        assert data["total"] == len(data["items"])

        reg = get_default_node_registry()
        expected_kinds = set(reg.list_kinds())
        returned_kinds = {str(it.get("kind")) for it in data["items"]}
        assert returned_kinds == expected_kinds

        # Sanity check: system.validate_inputs is internal and should be marked hidden.
        validate_meta = next((it for it in data["items"] if it.get("kind") == "system.validate_inputs"), None)
        assert validate_meta is not None
        assert validate_meta.get("hidden") is True
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_all_system_kinds_are_hidden() -> None:
    reg = get_default_node_registry()
    for kind in reg.list_kinds():
        if not kind.startswith("system."):
            continue
        meta = reg.get_meta(kind)
        assert meta is not None, f"system kind must have metadata: {kind}"
        assert getattr(meta, "hidden", False) is True, f"system kind must be hidden: {kind}"
