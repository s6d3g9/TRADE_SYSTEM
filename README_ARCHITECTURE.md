# TRADE_SYSTEM: Архитектура и компоненты

## Последние улучшения архитектуры (2025-12-18)

### Рефакторинг Backend
1. **Консолидация типов**: `Exchange` вынесен в `schemas/market.py` как единый источник истины
2. **Слой сервисов**: Бизнес-логика вынесена из API handlers в `services/` (начало с `backtest_parser.py`)
3. **Полные схемы**: Добавлены Pydantic схемы для `ConfigFile` и общие модели (`schemas/common.py`)
4. **Централизованная обработка ошибок**: Унифицированные exception handlers в `main.py`
5. **CORS middleware**: Настроено для взаимодействия frontend-backend
6. **Чистота импортов**: Устранены дублирования и потенциальные циркулярные зависимости

### Архитектурные паттерны
```
Frontend → Nginx → FastAPI → API Handler → Service → Model → Database
                              ↓
                           Schema (validation)
```

Источник истины по модели данных и хранению (StrategyModule/base+variants/regime/alignment/bots, артефакты бэктестов и т.д.): [README_DATA_STORAGE_STRATEGIES.md](README_DATA_STORAGE_STRATEGIES.md).

## 1. Общая структура

- **frontend/** — React/Vite SPA, UI для управления стратегиями, моделями, конфигами, ботами.
- **backend/** — FastAPI, REST API, бизнес-логика, работа с БД, AI-интеграция.
- **agents/** — отдельный сервис (Docker), возможно для AI/ML задач или worker-агентов.
- **docs/** — документация.
- **docker-compose.yml** — оркестрация контейнеров (frontend, backend, agents, БД, etc).

## 2. Контейнеры и их связь

- **frontend**: Vite/React, общается с backend по HTTP (обычно порт 8000).
- **backend**: FastAPI, общается с БД (Postgres), Redis, AI API (внешний или локальный).
- **agents**: отдельный контейнер, может выполнять ML/AI задачи, общается с backend через API или очередь (Redis).
- **db**: Postgres, хранит основные сущности и версии конфигов (артефакты хранятся на диске, см. DSS).
- **redis**: очередь задач, pub/sub, кеширование.

Связь:
- frontend ⇄ backend (REST API)
- backend ⇄ db (SQLAlchemy)
- backend ⇄ redis (aioredis)
- backend ⇄ agents (через redis или HTTP)
- backend ⇄ AI API (httpx)

## 3. Хранение пользовательской информации

- Основные сущности (стратегии/модули, модели, сонастройки, версии конфигов, реестр ботов) — в Postgres через ORM-модели (см. backend/app/models/).
- Сессии/очереди/таски — в Redis (например, для задач AI autotune).
- Конфиги (JSON) — версионируются в БД (таблица `config_files`); финальные и/или “тяжёлые” артефакты (bot config.json, результаты бэктестов) — на диске с метаданными/ссылками из БД.

## 4. Хранение и структура данных

- **StrategyTemplate** — “модуль стратегий” (StrategyModule) с привязкой к git repo (url/ref) и метаданными
- **FreqAIModelVariant** — ML-модель (slug, algorithm, config...)
- **StrategyAlignment** — сонастройка стратегия+модель (profile, mapping, overrides...)
- **ConfigFile** — версия конфигурации (scope: strategy/model/alignment, owner_id, content, is_active)
- **Bot** — сгенерированный бот (bot_id, name, config_path)

- Все сущности versioned (есть created_at/updated_at).
- Конфиги могут быть активными/неактивными (is_active).
- Исходники стратегий (.py) живут в git; backend может клонировать/кэшировать репозиторий на диск по запросу.

## 5. Пример потока данных

1. Пользователь через UI создаёт стратегию и модель.
2. Создаёт alignment (пару стратегия+модель).
3. Запускает autotune (AI), результат — новый config.json (ConfigFile, scope=alignment, is_active=True).
4. Генерирует бота — config.json сохраняется на диск, создаётся запись Bot.
5. Все действия отражаются в БД и доступны через API/интерфейс.

---

См. также: README_BACKEND_COMPONENTS.md, README_DATA_FLOW.md, README_CONTAINERS.md, README_CONTAINERS_SYSTEM.md
