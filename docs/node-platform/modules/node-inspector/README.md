# Module: Node Inspector (NDV-like)

## Responsibility

Render and manage the “node details” view (similar to n8n’s NDV):
- edit node parameters (JSON / form-like sections)
- show validation errors
- show node-specific execution previews (when available)

This module is a **detail panel**, not the canvas itself.

## Primary code locations

Current implementation is embedded in the editor page and shared UI patterns:
- Editor page which includes node editing UI patterns: [frontend/src/pages/StrategyLab/NodeGraphsPage.tsx](../../../../frontend/src/pages/StrategyLab/NodeGraphsPage.tsx)
- Shared interaction/style helpers: [frontend/src/pages/StrategyLab/nodeGraphs.reactflow.css](../../../../frontend/src/pages/StrategyLab/nodeGraphs.reactflow.css)
- General UI rules: [docs/ui-design-principles.md](../../../ui-design-principles.md)

## Contract

- Inspector is opened for a **selected node**.
- Editing a node updates the **draft graph definition** in memory.
- Inspector must mark its interactive controls with `.ignore-key-press-canvas` (or equivalent) to prevent canvas shortcuts from firing while typing.

## Suggested structure (incremental)

Even if currently implemented inline, treat these as conceptual sub-parts:
- **Header**: node name, kind, status (when run-selected)
- **Parameters**: the editable config payload
- **Validation**: schema/required fields/errors
- **Execution view** (optional): last inputs/outputs/errors

## Data model touchpoints

- Works with **node kinds** from the Node Registry.
- Produces updated node `config` blobs that are persisted via Graph API as part of a new version.

## Guardrails

- Never store secrets directly in node config.
- Prefer collapsible sections for dense configs (see [docs/ui-design-principles.md](../../../ui-design-principles.md)).
