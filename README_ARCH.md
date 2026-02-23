# Краткое описание архитектуры TRADE_SYSTEM

Источник истины по модели данных и хранению: [README_DATA_STORAGE_STRATEGIES.md](README_DATA_STORAGE_STRATEGIES.md).

- **frontend/** — UI, React/Vite, работает с backend через REST API
- **backend/** — FastAPI, бизнес-логика, работа с БД, AI, очередями
- **agents/** — ML/AI worker (опционально)
- **db** — Postgres, хранит основные сущности (стратегии/модели/алайнменты/версии конфигов/боты)
- **redis** — очередь задач, pub/sub

## Основные потоки

- Пользователь → frontend → backend → db/redis/AI
- backend → AI API (autotune, repair)
- backend → agents (через redis)
- backend → сохраняет config.json на диск при генерации бота

## Где что хранится

- Основные сущности и версии конфигов — в Postgres
- Очереди/таски — в Redis
- Артефакты (например финальный bot config.json, результаты бэктестов) — на диске, с метаданными/ссылками из БД
- Исходники стратегий — в git; backend может клонировать/кэшировать репозиторий на диск по запросу

## Как связаны контейнеры

- frontend ⇄ backend (REST)
- backend ⇄ db (SQL)
- backend ⇄ redis (pub/sub, очереди)
- backend ⇄ agents (через redis)
- backend ⇄ AI API (httpx)
