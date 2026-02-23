# Node Platform (n8n-inspired) — module map

This folder documents an internal **node-based platform** inside TRADE_SYSTEM. It is inspired by n8n’s separation of concerns (canvas/editor vs node inspector vs executions vs credentials), but is tailored to our existing implementation.

## What already exists in the repo

**Frontend**
- Node graph editor UI (React + React Flow): [frontend/src/pages/StrategyLab/NodeGraphsPage.tsx](../../frontend/src/pages/StrategyLab/NodeGraphsPage.tsx)
- Shared editor styling and interaction helpers: [frontend/src/pages/StrategyLab/nodeGraphs.reactflow.css](../../frontend/src/pages/StrategyLab/nodeGraphs.reactflow.css)

**Backend**
- Graph API (CRUD/versioning/runs): [backend/app/api/graphs.py](../../backend/app/api/graphs.py)
- Worker that executes queued runs: [backend/app/workers/graph_worker.py](../../backend/app/workers/graph_worker.py)
- DAG executor and node-kind dispatch: [backend/app/services/graph_executor.py](../../backend/app/services/graph_executor.py)

**Existing docs**
- System-level semantics (DB + queue + execution): [docs/node-graph-system.md](../node-graph-system.md)
- n8n-like UX rules for the editor: [docs/node-graphs-n8n-rules.md](../node-graphs-n8n-rules.md)
- UI design constraints: [docs/ui-design-principles.md](../ui-design-principles.md)

## Core concepts (shared vocabulary)

- **Graph**: a named workflow container (user-visible).
- **Graph Version**: an immutable snapshot of a graph definition (nodes + edges + metadata). Versions are the unit of execution.
- **Run**: an execution attempt of a specific graph version.
- **Run Node**: per-node execution record (inputs/outputs/status/error).
- **Node Kind**: stable identifier for a node implementation (e.g. `input.static`, `analysis.compare`).

A minimal platform needs:
1) an editor to create/modify graph versions,
2) a registry/catalog to define node kinds,
3) an execution engine to run DAGs reliably,
4) storage/versioning/audit to make runs reproducible,
5) credentials/secrets to safely access external systems.

## Module boundaries

Each module below is documented as a small “README contract”: responsibility, interfaces, data model touchpoints, and where it lives in the code.

- Canvas / Editor: [docs/node-platform/modules/canvas-editor/README.md](modules/canvas-editor/README.md)
- Node Inspector (NDV-like): [docs/node-platform/modules/node-inspector/README.md](modules/node-inspector/README.md)
- Node Registry / Catalog: [docs/node-platform/modules/node-registry/README.md](modules/node-registry/README.md)
- Graph API + Model: [docs/node-platform/modules/graph-api-and-model/README.md](modules/graph-api-and-model/README.md)
- Execution Engine: [docs/node-platform/modules/execution-engine/README.md](modules/execution-engine/README.md)
- Workers + Queue: [docs/node-platform/modules/workers-and-queue/README.md](modules/workers-and-queue/README.md)
- Storage, Versioning, Audit: [docs/node-platform/modules/storage-versioning-audit/README.md](modules/storage-versioning-audit/README.md)
- Credentials + Secrets: [docs/node-platform/modules/credentials-and-secrets/README.md](modules/credentials-and-secrets/README.md)
- Observability: [docs/node-platform/modules/observability/README.md](modules/observability/README.md)
- Extensions / Adding new node kinds: [docs/node-platform/modules/extensions/README.md](modules/extensions/README.md)

## Migration plan

- Architecture migration (phased, n8n-style): [docs/node-platform/ARCHITECTURE_MIGRATION.md](ARCHITECTURE_MIGRATION.md)

## Non-goals (for now)

- Rebuilding n8n feature-for-feature.
- Full plugin marketplace.
- Arbitrary code execution from user input.

We prioritize: reproducible runs, safe execution, and clean module seams.
