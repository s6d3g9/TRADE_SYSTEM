from __future__ import annotations

from datetime import datetime
from typing import Any


def _duration_ms(start: datetime | None, end: datetime | None) -> int | None:
    if not start or not end:
        return None
    try:
        delta = end - start
        return int(delta.total_seconds() * 1000)
    except Exception:
        return None


def build_execution_stats(
    *,
    run_created_at: datetime | None,
    run_completed_at: datetime | None,
    nodes: list[dict[str, Any]],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    status_counts: dict[str, int] = {}
    timings: list[dict[str, Any]] = []

    for n in nodes:
        status = str(n.get("status") or "unknown")
        status_counts[status] = status_counts.get(status, 0) + 1

        started_at = n.get("started_at")
        created_at = n.get("created_at")
        completed_at = n.get("completed_at")
        start = started_at if isinstance(started_at, datetime) else created_at
        duration_ms = _duration_ms(start, completed_at) if isinstance(start, datetime) else None

        timings.append(
            {
                "node_id": str(n.get("node_id") or ""),
                "kind": str(n.get("kind") or ""),
                "status": status,
                "duration_ms": duration_ms,
            }
        )

    stats = {
        "total_nodes": len(nodes),
        "status_counts": status_counts,
        "run_duration_ms": _duration_ms(run_created_at, run_completed_at),
    }
    return stats, timings
