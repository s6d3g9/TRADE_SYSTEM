# Основные компоненты backend

Источник истины по структуре данных и хранению: [README_DATA_STORAGE_STRATEGIES.md](README_DATA_STORAGE_STRATEGIES.md).

## FastAPI endpoints

- /strategylab/strategies — CRUD стратегий
- /strategylab/models — CRUD моделей
- /strategylab/alignments — CRUD сонастроек
- /strategylab/configs — CRUD версий конфигов
- /strategylab/alignments/{id}/autotune — AI autotune (alignment)
- /strategylab/strategies/{id}/autotune — AI autotune (strategy)
- /strategylab/models/{id}/autotune — AI autotune (model)
- /strategylab/alignments/{id}/autotune/combined — объединённый autotune
- /strategylab/alignments/{id}/generate-bot — генерация бота
- /bots — список/создание ботов

## Модели данных (SQLAlchemy)

- StrategyTemplate
- FreqAIModelVariant
- StrategyAlignment
- ConfigFile
- Bot

## Внешние зависимости

- Postgres (SQLAlchemy)
- Redis (aioredis)
- AI API (httpx, env: AI_MODELS_API_URL, AI_MODELS_TOKEN)

## Вспомогательные функции

- _call_ai_model — запрос к AI API
- _validate_config_payload — валидация структуры config.json
- _deep_merge — слияние конфигов
- _clone_repo — клонирование git-репозитория для исходников стратегий
