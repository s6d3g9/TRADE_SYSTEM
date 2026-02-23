# NodeGraph system (graphical nodes)

See also: `docs/node-platform/README.md` (module boundaries and ownership).

## Goal
Provide a visual, composable way to build:
- analysis tools (metrics, comparisons, regime slicing)
- decision tools (rules, scoring, gating)
- triggers (time-based / event-based)
- actions (mint config variant, activate config, notify, create tasks)

…while keeping the platform safe and auditable.

## Principles
- **Postgres is source of truth**: graphs, versions, runs, node outputs.
- **Redis is infra**: queue + best-effort live status/progress.
- **Everything is versioned**: graph definition is immutable once published.
- **No silent activation**: actions that affect trading/config must be explicit and auditable.
- **Evidence-first**: each run stores what data and reasoning produced an output.

## Data model (MVP)
- `node_graphs`: high-level graph entity (name/scope/owner).
- `node_graph_versions`: immutable JSON definition of the node/edge graph.
- `node_graph_runs`: execution instances (status, inputs, outputs).
- `node_graph_run_nodes`: per-node execution records (inputs/outputs/errors).

## Graph definition JSON (recommended shape)
Stored in `node_graph_versions.definition`.

```json
{
  "nodes": [
    {"id": "n1", "type": "input.static", "data": {"value": {"bot_ids": ["..."], "backtest_ids": ["..."]}}},
    {"id": "n2", "type": "analysis.compare", "data": {"mode": "basic"}},
    {"id": "n3", "type": "noop", "data": {}}
  ],
  "edges": [
    {"id": "e1", "source": "n1", "target": "n2"},
    {"id": "e2", "source": "n2", "target": "n3"}
  ],
  "viewport": {"x": 0, "y": 0, "zoom": 1}
}
```

## Execution model
- Treat the graph as a **DAG** (MVP). Cycles are not executed (future: loop nodes).
- Execution is done by a **dedicated worker**:
  - queue: `graph:tasks:queue`
  - worker: `graph-worker`
- Each node is executed in topological order.
- Inputs are merged from upstream outputs (MVP). Future: port/handle mapping.

## Node kinds (roadmap)
### Sources
- `input.static`: fixed JSON payload.
- `source.backtests`: load backtest summaries/trades.
- `source.live_trades`: load live trades (synced from freqtrade).
- `source.market_regime`: compute/lookup regime tags.

### Transforms / Metrics
- `metric.basic_stats`: return/winrate/dd/pf.
- `metric.reality_gap`: compare backtest vs live distribution.
- `metric.robustness`: stability across slices/time.

### Decision
- `decision.threshold`: boolean gate.
- `decision.score`: weighted scoring.

### AI / Agents
- `agent.llm_analyze`: uses user AI settings (token stored server-side) to produce structured output.
- `agent.propose_patch`: returns a config patch + expected impact + risk notes.

### Actions
- `action.mint_config_variant`: create inactive config variant.
- `action.activate_config`: explicit activation endpoint.
- `action.notify`: send message/log.

## Safety guardrails for AI-agent nodes
- Require **structured output schema** (JSON) and validate before applying.
- Disallow direct activation; only mint inactive variants.
- Require evidence links (run id, metrics inputs).
- Log prompts and model metadata server-side (token never returned).

## UI plan (frontend)
- Use a dedicated node editor (recommended: **React Flow**) for drag/drop + edges.
- Minimal panels:
  - canvas
  - “Save version” button
  - “Run” button
  - run status panel (DB + Redis)

## n8n-like UI rules
See: `docs/node-graphs-n8n-rules.md`

## Integration with existing systems
- Can reuse `analysis_runner` for compare/diagnose/tune blocks.
- Can reuse `tuning_suggestions` for AI-proposed changes and acceptance flow.

## Standard Nodes

- **Input**
  - `input.static`: Emits a constant value.
  - `input.run`: Emits inputs provided at runtime.
- **Analysis**
  - `analysis.compare`: Runs comparison analysis pipeline.
- **StrategyLab**
  - `strategylab.export_alignment`: Prepares strategy for export.
  - `strategylab.generate_bot`: Generates a bot configuration.
  - `strategylab.hyperopt`: **[NEW]** Runs Hyperopt optimization on a strategy using auto-detected parameters.
- **Trading**
  - `trading.run_backtest`: Executes a backtest using Docker.
