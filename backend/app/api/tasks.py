from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.redis import get_redis

router = APIRouter(prefix="/tasks", tags=["tasks"])

QUEUE_KEY = "trade:tasks:queue"
TASK_KEY_PREFIX = "trade:tasks:"


class EnqueueTaskRequest(BaseModel):
    type: str = Field(min_length=1)
    payload: dict = Field(default_factory=dict)


class EnqueueTaskResponse(BaseModel):
    id: str
    status: str


@router.post("", response_model=EnqueueTaskResponse)
async def enqueue_task(req: EnqueueTaskRequest) -> EnqueueTaskResponse:
    task_id = str(uuid4())
    now = datetime.now(timezone.utc).isoformat()

    redis = get_redis()
    key = f"{TASK_KEY_PREFIX}{task_id}"

    await redis.hset(
        key,
        mapping={
            "id": task_id,
            "type": req.type,
            "payload": json.dumps(req.payload, ensure_ascii=False),
            "status": "queued",
            "created_at": now,
        },
    )
    await redis.rpush(QUEUE_KEY, task_id)

    return EnqueueTaskResponse(id=task_id, status="queued")


@router.get("/{task_id}")
async def get_task(task_id: str) -> dict:
    redis = get_redis()
    key = f"{TASK_KEY_PREFIX}{task_id}"

    data = await redis.hgetall(key)
    if not data:
        return {"id": task_id, "status": "not_found"}

    payload_raw = data.get("payload")
    if payload_raw:
        try:
            data["payload"] = json.loads(payload_raw)
        except Exception:  # noqa: BLE001
            data["payload"] = payload_raw

    result_raw = data.get("result")
    if result_raw:
        try:
            data["result"] = json.loads(result_raw)
        except Exception:  # noqa: BLE001
            data["result"] = result_raw

    return data
