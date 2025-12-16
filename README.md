# TRADE_SYSTEM

Минимальный каркас проекта с Docker Compose:

- `backend/` — FastAPI (health endpoint: `/health`), заготовка под Postgres (async SQLAlchemy) и Alembic
- `frontend/` — Vite+React (сборка в Docker), nginx раздаёт статику и проксирует `/api/*` на backend
- `agents/` — python-воркер (пример: периодически дергает `/health`)
- `postgres` / `redis` — инфраструктура в `docker-compose.yml`

## Быстрый старт

1) (опционально) Создай `.env` на основе примера:

```bash
cp .env.example .env
```

2) Запуск:

```bash
docker compose up --build
```

## Проверка

- Backend: `http://localhost:8000/health`
- Frontend: `http://localhost:8080` (ссылкой ведёт на `/api/health`)

## Миграции

Alembic подключён к SQLAlchemy metadata. Применить миграции:

```bash
docker compose run --rm backend alembic upgrade head
```

## CI/CD

- CI: GitHub Actions workflow в `.github/workflows/ci.yml` (backend lint+tests, frontend build, compose build).
- Подробности и рекомендации по CD: см. [docs/ci-cd.md](docs/ci-cd.md).