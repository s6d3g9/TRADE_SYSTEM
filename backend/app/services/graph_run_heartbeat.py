from __future__ import annotations

from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def heartbeat_key(run_id: str) -> str:
    return f"graph:run:{run_id}:heartbeat"


def serialize_heartbeat(dt: datetime) -> str:
    # ISO 8601 with timezone.
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def parse_heartbeat(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def heartbeat_age_seconds(*, now: datetime, heartbeat_at: datetime | None) -> int | None:
    if heartbeat_at is None:
        return None
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    try:
        return int((now - heartbeat_at).total_seconds())
    except Exception:
        return None


def is_stale(*, heartbeat_at: datetime | None, now: datetime, max_age_seconds: int) -> bool:
    age = heartbeat_age_seconds(now=now, heartbeat_at=heartbeat_at)
    if age is None:
        return True
    return age > max_age_seconds
