# Web UI pre-flight checklist

This is the minimal sequence to run before manually checking the web interface.

## 1) Start the stack (build + run)

- `make web-ready`

What it does:
- `docker compose up -d --build`
- runs DB migrations (alembic)
- curls backend health endpoint
- prints container statuses

## 2) Open the UI

- Frontend: `http://localhost:${FRONTEND_PORT:-8090}`
- Backend API (direct): `http://localhost:${BACKEND_PORT:-8000}`
- Mailpit UI: `http://localhost:${MAILPIT_WEB_PORT:-8025}`

## 3) Log in / create a user

Use the UI:
- Open `/login`
- Use **Register** (password) to create an account and get a JWT

(Under the hood it calls `/api/auth/password/register`.)

## 4) Smoke checks in UI

- StrategyLab → Combinator:
  - Run “Alignment backtest workflow”
  - Open “Workflow execution” panel, hit Refresh
  - Expect kind labels to match backend catalog

- StrategyLab → NodeGraphs:
  - Open catalog: kind list should come from `/api/graphs/kinds`
  - Internal `system.*` kinds must NOT appear in the add-node catalog
  - Inspector should show kind meta (category/inputs/outputs/capabilities)

## 5) Useful debug commands

- Logs: `make logs`
- Stop: `make down`
- Clean volumes: `make clean`
