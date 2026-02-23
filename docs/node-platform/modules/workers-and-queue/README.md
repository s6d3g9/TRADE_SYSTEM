# Module: Workers + Queue

## Responsibility

Provide asynchronous execution of graph runs:
- enqueue runs on request
- a worker consumes queued runs and executes them
- status is published for UI polling

## Primary code locations

- Worker loop: [backend/app/workers/graph_worker.py](../../../../backend/app/workers/graph_worker.py)
- Queue integration in API: [backend/app/api/graphs.py](../../../../backend/app/api/graphs.py)

## Queue contract

- Queue key: `graph:tasks:queue` (Redis list)
- Producer: Graph API pushes run ids.
- Consumer: worker uses blocking pop (`BRPOP`) and executes.

## Status contract

- Worker updates both:
  - DB run status (source of truth)
  - Redis status key for lightweight UI polling

## Scaling

- Multiple workers can consume from the same queue.
- For higher throughput, consider sharding by workspace/user or priority queues (future).

## Guardrails

- Worker must be idempotent for retryable runs.
- If a worker crashes mid-run, the run should transition to failed/abandoned deterministically (future: heartbeat).
