## CI/CD guide

## CI (GitHub Actions)
Workflow: `.github/workflows/ci.yml`
- backend (python 3.12): install `requirements.txt` + `requirements-dev.txt`, run `ruff check .`, `pytest -q` (working dir `backend/`).
- frontend (node 20): `npm install --no-fund --no-audit`, `npm run build` (working dir `frontend/`).
- compose-build: `docker compose build` to ensure images build together.

### How to run the same locally
- Backend lint/tests: `cd backend && pip install -r requirements.txt -r requirements-dev.txt && ruff check . && pytest -q`
- Frontend build: `cd frontend && npm install --no-fund --no-audit && npm run build`
- Compose build: from repo root `docker compose build`

### What CI expects
- `.env` is not required in CI (defaults baked in). If tests need secrets, inject via repo secrets.
- Alembic metadata is wired; include a migration for every schema change.

## CD (GitHub Actions)
Workflow: `.github/workflows/cd.yml`
- Triggers: push on `main`, or manual `workflow_dispatch`.
- Builds and pushes images to GHCR (backend, frontend, agents) with tags `latest` and `${{ github.sha }}` under `ghcr.io/<org>/trade-system-*`.
- Optional migrations job runs `alembic upgrade head` against the DB if secret `DATABASE_URL` is set.

### Required secrets for CD
- `DATABASE_URL` (optional, only for migrations step). Format: `postgresql+asyncpg://user:pass@host:port/dbname`.
- No registry secret needed for GHCR (uses `${{ secrets.GITHUB_TOKEN }}` with `packages:write`).

### Deploy notes
- Use the pushed tags (`latest` or specific SHA) in your deployment manifests/compose.
- Run migrations before rolling out app containers; the CD workflow’s `migrate` job can do this when `DATABASE_URL` is provided.
- Post-deploy smoke: `/health` and `/neuro/providers`.

## Conventions for contributors
- Any DB schema change must include an Alembic migration in `backend/alembic/versions/`.
- Keep CI green locally before PRs.
- Keep `docker compose build` passing to avoid drift between services.

## Secrets
- Do not commit real secrets. Use repo/org secrets in GitHub Actions for registry credentials and database URLs.
