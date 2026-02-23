# Module: Storage, Versioning, Audit

## Responsibility

Make workflows and runs:
- durable
- versioned
- auditable
- reproducible

## Current foundations

- Postgres is the source of truth for graphs/versions/runs.
- Versions are treated as immutable snapshots.

See [docs/node-graph-system.md](../../../node-graph-system.md) for current system semantics.

## Versioning rules (contract)

- Editing produces a **new version**.
- Runs reference a specific version.
- Old versions must remain executable.

## Audit expectations

At minimum, store:
- who created a version/run
- when it was created
- a human-readable message/label
- per-node errors and outputs

## Guardrails

- Avoid storing credentials or secrets inside graph definitions.
- Prefer append-only records for runs and run nodes.
