# Module: Credentials + Secrets

## Responsibility

Provide safe access to external systems and sensitive values:
- store encrypted secrets server-side
- allow nodes to reference credentials by id/type
- inject secrets at execution time (never persist them into graph versions)

## Why this is its own module

n8n treats credentials as a first-class feature because:
- users reuse them across workflows
- secrets must not leak via exports/version history
- nodes need a consistent way to request secrets

## Contract (recommended)

- A node config may contain **credential references**, not raw secret values.
- Backend resolves references into concrete values at execution time.
- Outputs must be scrubbed to avoid leaking secrets.

## Storage guidance

- Use Postgres for credential metadata.
- Store secret payloads encrypted (implementation TBD).
- Restrict access by user/workspace.

## Guardrails

- No secrets in:
  - graph versions
  - run inputs/outputs (unless explicitly allowed and redacted)
  - frontend state
