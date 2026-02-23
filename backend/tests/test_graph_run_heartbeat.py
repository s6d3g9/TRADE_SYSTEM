from __future__ import annotations

from datetime import datetime, timezone

from app.services.graph_run_heartbeat import (
    heartbeat_age_seconds,
    is_stale,
    parse_heartbeat,
    serialize_heartbeat,
)


def test_serialize_parse_roundtrip() -> None:
    dt = datetime(2025, 12, 24, 12, 0, 0, tzinfo=timezone.utc)
    s = serialize_heartbeat(dt)
    parsed = parse_heartbeat(s)
    assert parsed == dt


def test_parse_invalid_returns_none() -> None:
    assert parse_heartbeat("not-a-date") is None


def test_age_seconds() -> None:
    hb = datetime(2025, 12, 24, 12, 0, 0, tzinfo=timezone.utc)
    now = datetime(2025, 12, 24, 12, 0, 10, tzinfo=timezone.utc)
    assert heartbeat_age_seconds(now=now, heartbeat_at=hb) == 10


def test_is_stale_no_heartbeat() -> None:
    now = datetime(2025, 12, 24, 12, 0, 0, tzinfo=timezone.utc)
    assert is_stale(heartbeat_at=None, now=now, max_age_seconds=10) is True


def test_is_stale_by_age() -> None:
    hb = datetime(2025, 12, 24, 12, 0, 0, tzinfo=timezone.utc)
    now = datetime(2025, 12, 24, 12, 0, 11, tzinfo=timezone.utc)
    assert is_stale(heartbeat_at=hb, now=now, max_age_seconds=10) is True
    assert is_stale(heartbeat_at=hb, now=now, max_age_seconds=11) is False
