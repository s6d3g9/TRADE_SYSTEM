from __future__ import annotations

import asyncio
import logging
import signal
from datetime import datetime, timezone

from sqlalchemy import update

from app.core.db import get_engine, get_sessionmaker
from app.core.redis import get_redis
from app.models.graph import NodeGraphRun
from app.services.graph_executor import execute_graph_run
from app.services.graph_run_heartbeat import heartbeat_key, serialize_heartbeat, utcnow


QUEUE_KEY = "graph:tasks:queue"
logger = logging.getLogger(__name__)

# Heartbeat lets the UI/backend detect stuck workers even if DB updated_at
# doesn't move for long-running nodes.
HEARTBEAT_TTL_SECONDS = 90
HEARTBEAT_INTERVAL_SECONDS = 15


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _heartbeat_loop(run_id: str, stop: asyncio.Event) -> None:
    redis = get_redis()
    key = heartbeat_key(run_id)
    while not stop.is_set():
        await redis.set(key, serialize_heartbeat(utcnow()), ex=HEARTBEAT_TTL_SECONDS)
        try:
            await asyncio.wait_for(stop.wait(), timeout=HEARTBEAT_INTERVAL_SECONDS)
        except TimeoutError:
            continue


async def _handle_run(run_id: str) -> None:
    sessionmaker = get_sessionmaker()
    redis = get_redis()

    async with sessionmaker() as session:
        run = await session.get(NodeGraphRun, run_id)
        if not run:
            return

        if run.status not in ("queued",):
            return

        await session.execute(
            update(NodeGraphRun)
            .where((NodeGraphRun.run_id == run_id) & (NodeGraphRun.status == "queued"))
            .values(status="running", updated_at=_utcnow())
        )
        await session.commit()

        await redis.set(f"graph:run:{run_id}:status", "running", ex=60 * 60)

        stop_hb = asyncio.Event()
        hb_task = asyncio.create_task(_heartbeat_loop(run_id, stop_hb))

        try:
            run = await session.get(NodeGraphRun, run_id)
            if not run:
                return

            run = await execute_graph_run(session, run)
            run.status = "completed"
            run.completed_at = _utcnow()
            run.updated_at = _utcnow()
            await session.commit()

            stop_hb.set()
            try:
                await hb_task
            except Exception as exc:
                logger.debug("Failed to stop heartbeat task for run %s: %s", run_id, exc)

            await redis.set(f"graph:run:{run_id}:status", "completed", ex=60 * 60)
        except Exception as e:
            stop_hb.set()
            try:
                await hb_task
            except Exception as exc:
                logger.debug("Failed to stop heartbeat task after run error %s: %s", run_id, exc)
            # Important: do NOT rollback on generic failures.
            # Node-level records and partial outputs are valuable for debugging.
            run = await session.get(NodeGraphRun, run_id)
            if run:
                run.status = "failed"
                run.error_message = str(e)
                run.completed_at = _utcnow()
                run.updated_at = _utcnow()

            try:
                await session.commit()
            except Exception:
                # If the session is in a failed transaction state, fallback to rollback + direct update.
                await session.rollback()
                await session.execute(
                    update(NodeGraphRun)
                    .where(NodeGraphRun.run_id == run_id)
                    .values(
                        status="failed",
                        error_message=str(e),
                        completed_at=_utcnow(),
                        updated_at=_utcnow(),
                    )
                )
                await session.commit()

            await redis.set(f"graph:run:{run_id}:status", "failed", ex=60 * 60)


async def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    log = logging.getLogger("graph-worker")

    redis = get_redis()
    stop = asyncio.Event()

    def _request_stop() -> None:
        stop.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _request_stop)
        except NotImplementedError:
            continue

    log.info("Worker started; queue=%s", QUEUE_KEY)

    try:
        while not stop.is_set():
            item = await redis.brpop(QUEUE_KEY, timeout=5)
            if not item:
                continue
            _key, run_id = item
            if not run_id:
                continue
            log.info("Dequeued graph run: %s", run_id)
            await _handle_run(run_id)
    finally:
        try:
            await redis.aclose()
        except Exception as exc:
            logger.debug("Failed to close redis in graph worker: %s", exc)
        try:
            await get_engine().dispose()
        except Exception as exc:
            logger.debug("Failed to dispose engine in graph worker: %s", exc)
        log.info("Worker stopped")


if __name__ == "__main__":
    asyncio.run(main())
