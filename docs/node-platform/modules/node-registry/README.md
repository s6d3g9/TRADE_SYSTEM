# Module: Node Registry / Catalog

## Responsibility

Provide a single source of truth for:
- which node kinds exist
- their display metadata (name, category)
- parameter schemas/defaults
- runtime capabilities (pure/side-effecting, required credentials)

The registry must be shared by:
- the Canvas (for node creation)
- the Inspector (for rendering + validation)
- the Execution Engine (for dispatch)

## Current state

- The editor UI already has a basic notion of node kinds and a “node creator” UX.
- The backend executor dispatches on `node.kind` (see Execution Engine module).

## Recommended API (doc-level contract)

A node kind entry should define:
- `kind`: stable id (`analysis.compare`)
- `label`: user-facing name
- `category`: grouping in catalog
- `defaults`: initial config for new nodes
- `schema`: validation schema (JSONSchema or Pydantic-compatible shape)
- `capabilities`:
  - `pure`: true/false
  - `idempotent`: true/false
  - `needsCredentials`: list of credential types

## Backend touchpoints

- `node.kind` is stored as part of the graph version definition.
- Execution engine uses `node.kind` to route execution.

## Guardrails

- Node kinds are immutable identifiers: rename labels, not `kind`.
- Schemas must be versioned carefully: older graph versions must remain runnable.
