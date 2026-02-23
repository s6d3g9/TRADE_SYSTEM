# Module: Execution Engine

## Responsibility

Execute a graph version as a DAG:
- validate graph shape (DAG, required inputs)
- toposort nodes
- execute each node with collected inputs
- persist per-node results and overall run status

## Primary code locations

- Executor: [backend/app/services/graph_executor.py](../../../../backend/app/services/graph_executor.py)

## Execution semantics (today)

- Topological sort determines node order.
- Inputs are collected from upstream node outputs.
- Dispatch is based on `node.kind`.
- Some nodes can reuse existing internal services (e.g. `analysis.compare`).

### Run inputs and `input.run`

For reusable workflows (templates), prefer passing parameters via **run inputs**.

- `run.inputs` is stored on `NodeGraphRun.inputs`.
- The node kind `input.run` emits a single JSON dict created by:
	- starting from `node.data.defaults` (if provided), then
	- overlaying `run.inputs` on top.

This allows a single graph version to be executed many times with different parameters
without creating a new version each time.

Example expected inputs:
- `alignment_id` (required for StrategyLab flows)
- `timerange` (optional for backtests)

## Node handler contract

A node handler should:
- accept `(node, inputs, context)`
- return a JSON-serializable output payload
- raise a structured exception on failure (captured into node run record)

## Determinism and reproducibility

To keep runs reproducible:
- run a **persisted version** only
- store the exact input payloads used per node
- store outputs and errors per node

## Guardrails

- Disallow arbitrary code execution.
- Enforce timeouts and resource limits (future hardening).
- Do not allow secret values in node configs; inject via credential references.
