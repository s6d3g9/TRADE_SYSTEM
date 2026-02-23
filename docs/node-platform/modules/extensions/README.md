# Module: Extensions (Adding new node kinds)

## Responsibility

Define the “happy path” for introducing new node types:
- UI catalog entry
- parameter schema + defaults
- backend executor handler
- tests + fixtures (when present)

## Current state

- Backend dispatch exists by `node.kind`: see [backend/app/services/graph_executor.py](../../../../backend/app/services/graph_executor.py)
- Frontend provides a node creator flow in the editor.

## Adding a node kind (recommended checklist)

1) Choose a stable `kind` id (namespaced, lowercase): e.g. `market.fetch_candles`.
2) Add it to the Node Registry (label/category/inputs/outputs/capabilities).
3) Update the editor catalog so users can create it.
4) Implement the executor handler:
   - validate config
   - call the appropriate internal service
   - return JSON-serializable output
5) Ensure outputs do not leak secrets.
6) Add a minimal run example in docs.

### Template-friendly nodes

When designing new nodes, assume they will be used in reusable templates.
Prefer taking parameters from upstream inputs (often originating from `input.run` / `run.inputs`) rather than embedding instance-specific ids into `node.data`.

## Compatibility rules

- Never change semantics of an existing `kind` in a way that breaks old versions.
- If behavior must change, introduce a new `kind` or a versioned kind.
