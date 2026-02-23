# Контейнеры TRADE_SYSTEM и их взаимодействие

Источник истины по модели данных/хранению: [README_DATA_STORAGE_STRATEGIES.md](README_DATA_STORAGE_STRATEGIES.md).

## Состав

- **frontend**: nginx (статика Vite build + proxy /api), порт 8090
- **backend**: FastAPI, порт 8000
- **agents**: ML/AI worker (опционально)
- **db**: Postgres (основные сущности/версии конфигов), порт 5432
- **redis**: Redis, порт 6379

## Взаимодействие

- frontend → backend: HTTP REST API (ws для логов/статусов)
- backend → db: SQLAlchemy (postgresql://...)
- backend → redis: aioredis (очереди, pub/sub)
- backend → agents: через redis (таски) или HTTP (если реализовано)
- backend → AI API: httpx (AI_MODELS_API_URL)

## Сеть

- Все контейнеры в одной docker-compose сети (обычно `default`)
- Порты проброшены наружу только для frontend/backend (и, возможно, для отладки db/redis)

## Примеры

- Пользователь в браузере → frontend:8090 → backend:8000 → db/redis/AI
- agents слушает redis, выполняет задачи, пишет результат в БД или redis
