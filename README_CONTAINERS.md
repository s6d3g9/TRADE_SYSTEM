# Связь и назначение контейнеров

Источник истины по хранению данных: [README_DATA_STORAGE_STRATEGIES.md](README_DATA_STORAGE_STRATEGIES.md).

- **frontend**: UI, React/Vite, порт 8090
- **backend**: FastAPI, порт 8000
- **agents**: ML/AI worker (опционально)
- **db**: Postgres (основные сущности/версии конфигов), порт 5432
- **redis**: Redis, порт 6379

## Взаимодействие

- frontend → backend: HTTP REST API
- backend → db: SQLAlchemy
- backend → redis: aioredis
- backend → agents: через redis или HTTP
- backend → AI API: httpx
