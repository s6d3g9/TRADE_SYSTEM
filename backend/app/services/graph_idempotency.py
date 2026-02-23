from __future__ import annotations

from datetime import datetime, timedelta, timezone


DEFAULT_IDEMPOTENCY_TTL_SECONDS = 300


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ttl_cutoff(*, now: datetime, ttl_seconds: int) -> datetime:
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return now - timedelta(seconds=int(ttl_seconds))


def enqueue_dedup_key(run_id: str) -> str:
    return f"graph:run:{run_id}:enqueued"
