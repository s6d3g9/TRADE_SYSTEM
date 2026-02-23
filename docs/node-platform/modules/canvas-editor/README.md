# Module: Canvas / Editor

## Responsibility

Provide a node-graph editing canvas (React Flow) with predictable n8n-like interactions:
- pan/zoom/selection
- node creation (catalog)
- edge creation
- multi-select and keyboard shortcuts
- save/run commands

This module owns **canvas interaction state** and is responsible for avoiding shortcut collisions while typing inside inputs.

## Primary code locations

- Editor page: [frontend/src/pages/StrategyLab/NodeGraphsPage.tsx](../../../../frontend/src/pages/StrategyLab/NodeGraphsPage.tsx)
- Editor CSS (panning cursor, overlay sizing, shortcut guards): [frontend/src/pages/StrategyLab/nodeGraphs.reactflow.css](../../../../frontend/src/pages/StrategyLab/nodeGraphs.reactflow.css)
- UX rules doc: [docs/node-graphs-n8n-rules.md](../../../node-graphs-n8n-rules.md)

## Key behaviors (contract)

- **Space-to-pan**: holding Space switches to panning; cursor changes to grab/grabbing.
- **Shortcut gating**: keyboard shortcuts do not fire when focus is in an input/textarea/select or any element marked with `.ignore-key-press-canvas`.
- **Save/run**:
  - `Ctrl/Cmd+S` saves the current working graph definition.
  - `Ctrl/Cmd+Enter` triggers a run.
- **Catalog open**: `Tab` opens the node creator/catalog when appropriate.

The canonical list of interaction rules lives in [docs/node-graphs-n8n-rules.md](../../../node-graphs-n8n-rules.md).

## Inputs / outputs

**Inputs**
- current graph + version identifiers
- graph definition (nodes/edges)
- node catalog (registry)

**Outputs**
- “draft graph definition” suitable for persistence as a new version
- user intents (save, run, open inspector)

## Data model touchpoints

The canvas does not write the database directly. It calls the Graph API module to:
- create/update graphs
- create new versions
- create runs

## Failure modes / guardrails

- Do not allow global shortcuts to break typing: always honor shortcut gating.
- Do not rely on client-only state for reproducibility: always persist versions and execute server-side.
