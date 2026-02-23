# Node-based Architecture Migration (n8n-style)

Goal: evolve TRADE_SYSTEM from “endpoint-driven orchestration” into **workflow-driven orchestration** where major operations are expressed as **versioned node graphs** and executed by the existing graph engine (Postgres versions + Redis queue + worker).

This is *not* a rewrite. It’s a staged migration that keeps current APIs working while progressively moving logic into nodes.

## 1) What “like n8n” means for us

n8n’s core ideas we adopt:
- **Graph is the product**: workflows are the primary unit users build.
- **NDV / Inspector separation**: canvas for wiring, inspector for parameters.
- **Executions are first-class**: run history, per-node results.
- **Credentials are first-class**: nodes reference credentials; secrets are injected at runtime.
- **Extension path is clear**: adding a node kind is a normal workflow.

What we *don’t* copy immediately:
- plugin marketplace
- arbitrary code execution from UI
- full credential OAuth breadth

## 2) Current foundation in TRADE_SYSTEM

Already implemented and usable:
- Graph persistence/versioning/runs: [backend/app/models/graph.py](../../backend/app/models/graph.py)
- Graph API: [backend/app/api/graphs.py](../../backend/app/api/graphs.py)
- Worker queue execution: [backend/app/workers/graph_worker.py](../../backend/app/workers/graph_worker.py)
- DAG executor: [backend/app/services/graph_executor.py](../../backend/app/services/graph_executor.py)
- Editor UI (React Flow): [frontend/src/pages/StrategyLab/NodeGraphsPage.tsx](../../frontend/src/pages/StrategyLab/NodeGraphsPage.tsx)

Newly introduced seam:
- Backend node registry/handlers: [backend/app/node_platform/registry.py](../../backend/app/node_platform/registry.py)

## 3) Target end-state (module responsibilities)

Canonical module map is in: [docs/node-platform/README.md](README.md)

At end-state:
- **StrategyLab** becomes a set of workflows:
  - build alignment config
  - run backtest
  - compare analyses
  - generate bot
  - deploy/run bot
- REST endpoints remain, but mostly become:
  - “create version”
  - “create run / enqueue”
  - “fetch run outputs”

## 4) Migration strategy

### Phase A — Make node execution modular (low risk)
- Introduce a backend **Node Registry** and move node implementations into handler functions.
- Executor becomes a dispatcher.
- No UX or endpoint changes required.

Status: started (registry + handler dispatch).

### Phase B — Define node kinds for existing business actions
We convert existing “service calls” into node kinds.

Candidate node kinds (initial):
- `strategylab.export_alignment` (wraps current alignment export payload; implemented)
- `strategylab.generate_bot` (ensures a runnable bot config exists; implemented)
- `trading.run_backtest` (runs Freqtrade backtest for a bot_id; implemented)
- `strategylab.build_config` (wraps config params -> config json)
- `strategylab.activate_config` (audited activation)
- `trading.run_backtest` (wrap existing backtest runner)
- `trading.generate_bot` (create bot artifacts)
- `analysis.compare` (already present)

### Example workflow: Alignment → Backtest

Minimal DAG:
1) `input.run` outputs `run.inputs` (e.g. `{ alignment_id, timerange? }`)
2) `strategylab.generate_bot` consumes `alignment_id` → outputs `{ bot_id, config_path, ... }`
3) `trading.run_backtest` consumes `bot_id` (+ optional `timerange`) → outputs backtest summary

Concrete graph definition you can POST as a version:
- [docs/node-platform/examples/alignment_backtest.definition.json](examples/alignment_backtest.definition.json)

Note: right now `strategylab.generate_bot` and `trading.run_backtest` are thin wrappers around the existing StrategyLab implementation; later we will move their logic into dedicated services.

### Phase C — Provide a canonical workflow per user-visible action
We create one workflow per “button” that currently triggers a multi-step imperative flow.

Example: “Run alignment backtest” becomes a workflow:
1) `strategylab.export_alignment`
2) `strategylab.activate_config` (optional)
3) `trading.generate_bot`
4) `trading.run_backtest`

### Phase D — UI convergence
- StrategyLab pages can embed workflow runs and node results.
- NodeGraphs editor becomes the single place to author/inspect workflows.

## 5) Safety & governance (must-have)

- Versioned definitions are immutable.
- Actions affecting trading/config must be explicit and audited.
- Nodes are whitelisted by kind (no arbitrary code).
- Credentials are referenced, never stored in graph definitions.

## 6) First vertical slice recommendation

Pick one end-to-end flow with clear inputs/outputs.

Recommended first slice (fastest value):
- **Alignment → Export config.json** as a node (`strategylab.export_alignment`) because:
  - it’s already a pure-ish transformation of DB rows into JSON
  - outputs are user-visible
  - no external side effects

Second slice:
- “Alignment backtest” workflow (adds queue + long run + artifacts).

## 7) Open decisions (need a choice)

- **Ownership model**: graphs per-user vs per-workspace vs shared templates.
- **Schema strategy**: JSONSchema in frontend vs Pydantic schema in backend (or both).
- **Run inputs format**: strict typed envelope vs free-form JSON.
