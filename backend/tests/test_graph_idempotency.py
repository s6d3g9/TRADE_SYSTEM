from __future__ import annotations

from datetime import datetime, timezone

from app.services.graph_idempotency import DEFAULT_IDEMPOTENCY_TTL_SECONDS, enqueue_dedup_key, ttl_cutoff


def test_ttl_cutoff_moves_backwards() -> None:
    now = datetime(2025, 12, 24, 12, 0, 0, tzinfo=timezone.utc)
    cutoff = ttl_cutoff(now=now, ttl_seconds=DEFAULT_IDEMPOTENCY_TTL_SECONDS)
    assert cutoff < now


def test_enqueue_dedup_key() -> None:
    assert enqueue_dedup_key("abc") == "graph:run:abc:enqueued"
