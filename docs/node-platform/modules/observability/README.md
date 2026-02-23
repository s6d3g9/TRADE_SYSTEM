# Module: Observability (Runs, Progress, Logs)

## Responsibility

Make execution inspectable:
- run status lifecycle
- progress polling for UI
- per-node status/inputs/outputs/errors
- structured logs and traces (future)

## Current implementation touchpoints

- Run progress endpoint reads Redis status: [backend/app/api/graphs.py](../../../../backend/app/api/graphs.py)
- Worker writes Redis + DB status: [backend/app/workers/graph_worker.py](../../../../backend/app/workers/graph_worker.py)
- Run nodes listing endpoint exists for UI drill-down.

## Recommended UI views (doc-level)

- **Run list** per graph/version
- **Run detail**: timeline + per-node table
- **Node detail**: inputs/outputs/error

## Guardrails

- Redact secrets in logs and outputs.
- Keep large payloads bounded (truncate or store externally if needed).
