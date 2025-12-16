import json
import os
import time
from datetime import datetime, timezone

from redis import Redis

QUEUE_KEY = "trade:tasks:queue"
TASK_KEY_PREFIX = "trade:tasks:"


def process_task(task_type: str, payload: dict) -> dict:
    if task_type == "ping":
        return {"ok": True, "echo": payload}

    return {"ok": False, "error": f"unknown task type: {task_type}"}


def main() -> None:
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    r = Redis.from_url(redis_url, decode_responses=True)

    print(f"[agent] connected to redis: {redis_url}")
    while True:
        try:
            item = r.blpop(QUEUE_KEY, timeout=5)
            if not item:
                continue

            _, task_id = item
            key = f"{TASK_KEY_PREFIX}{task_id}"
            task = r.hgetall(key)
            if not task:
                continue

            r.hset(
                key,
                mapping={
                    "status": "running",
                    "started_at": datetime.now(timezone.utc).isoformat(),
                },
            )

            payload_raw = task.get("payload") or "{}"
            try:
                payload = json.loads(payload_raw)
            except Exception:  # noqa: BLE001
                payload = {"_raw": payload_raw}

            result = process_task(task.get("type", ""), payload)

            r.hset(
                key,
                mapping={
                    "status": "done" if result.get("ok") else "error",
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                    "result": json.dumps(result, ensure_ascii=False),
                },
            )
            print(f"[agent] processed {task_id}: {result}")
        except Exception as e:  # noqa: BLE001
            print(f"[agent] worker error: {e}")
            time.sleep(1)


if __name__ == "__main__":
    main()
