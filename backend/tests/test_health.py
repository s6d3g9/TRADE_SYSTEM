from fastapi.testclient import TestClient

from app.main import app


def test_health_ok() -> None:
    client = TestClient(app)
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in {"ok", "degraded"}
    assert "checks" in data
    assert set(data["checks"].keys()) >= {"postgres", "redis", "exchange"}
    for k in ("postgres", "redis", "exchange"):
        assert data["checks"][k]["status"] in {"ok", "down"}
