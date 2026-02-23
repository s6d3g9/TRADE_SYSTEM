from __future__ import annotations

import asyncio
import logging
import signal
from datetime import datetime, timezone

from sqlalchemy import update

from app.core.db import get_engine, get_sessionmaker
from app.core.redis import get_redis
from app.models.analysis import AnalysisRun
from app.services.analysis_runner import execute_analysis_run


QUEUE_KEY = "analysis:tasks:queue"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _set_run_status(session, run_id: str, status: str) -> bool:
    """Atomically transition run status.

    Returns True if a row was updated.
    """
    result = await session.execute(
        update(AnalysisRun)
        .where(
            (AnalysisRun.run_id == run_id)
            & (AnalysisRun.status.in_(["queued", "running"]))
        )
        .values(status=status, updated_at=_utcnow())
    )
    return (result.rowcount or 0) > 0


async def _handle_run(run_id: str) -> None:
    sessionmaker = get_sessionmaker()
    redis = get_redis()

    async with sessionmaker() as session:
        run = await session.get(AnalysisRun, run_id)
        if not run:
            return

        # Only start runs that are still queued.
        if run.status not in ("queued",):
            return

        # Mark as running.
        await session.execute(
            update(AnalysisRun)
            .where((AnalysisRun.run_id == run_id) & (AnalysisRun.status == "queued"))
            .values(status="running", updated_at=_utcnow())
        )
        await session.commit()

        await redis.set(f"analysis:run:{run_id}:status", "running", ex=60 * 60)

        try:
            run = await session.get(AnalysisRun, run_id)
            if not run:
                return

            run = await execute_analysis_run(session, run)
            run.status = "completed"
            run.completed_at = _utcnow()
            run.updated_at = _utcnow()
            await session.commit()

            await redis.set(f"analysis:run:{run_id}:status", "completed", ex=60 * 60)
        except Exception as e:
            await session.rollback()
            run = await session.get(AnalysisRun, run_id)
            if run:
                run.status = "failed"
                run.error_message = str(e)
                run.completed_at = _utcnow()
                run.updated_at = _utcnow()
                await session.commit()

            await redis.set(f"analysis:run:{run_id}:status", "failed", ex=60 * 60)


async def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    log = logging.getLogger("analysis-worker")

    redis = get_redis()
    stop = asyncio.Event()

    def _request_stop() -> None:
        stop.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _request_stop)
        except NotImplementedError:
            # Windows / limited environments.
            pass

    log.info("Worker started; queue=%s", QUEUE_KEY)

    try:
        while not stop.is_set():
            item = await redis.brpop(QUEUE_KEY, timeout=5)
            if not item:
                continue

            _key, run_id = item
            if not run_id:
                continue

            log.info("Dequeued analysis run: %s", run_id)
            await _handle_run(run_id)
    finally:
        try:
            await redis.aclose()
        except Exception:
            pass

        try:
            await get_engine().dispose()
        except Exception:
            pass

        log.info("Worker stopped")


if __name__ == "__main__":
    asyncio.run(main())
