# Module: Graph API + Model

## Responsibility

Expose graph lifecycle operations:
- create/list graphs
- create immutable versions
- create runs from versions
- query run progress and per-node results

This is the “backend contract” the editor relies on.

## Primary code locations

- FastAPI router: [backend/app/api/graphs.py](../../../../backend/app/api/graphs.py)
- Execution engine: [backend/app/services/graph_executor.py](../../../../backend/app/services/graph_executor.py)
- Worker: [backend/app/workers/graph_worker.py](../../../../backend/app/workers/graph_worker.py)

## Key endpoints (current)

The exact shape evolves, but the intent is:
- Graph CRUD
- Version create/list
- Run create (optionally enqueue)
- Run progress (Redis-backed)
- Run nodes list

## Data model expectations

A graph version must store:
- nodes: id, kind, config, UI position/metadata
- edges: source/target
- metadata: created_at, created_by, label/message

A run must store:
- graph_id + version_id
- status lifecycle (queued/running/completed/failed)
- timestamps and error summary

## Queue integration

When a run is created with enqueue=true:
- it is pushed to the Redis queue (see Workers + Queue module)
- progress can be read via a Redis status key

## Guardrails

- Versions are immutable; create a new version for edits.
- Do not execute from “draft” state; only execute persisted versions.
