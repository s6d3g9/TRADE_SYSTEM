# Текущие задачи (TODO)

Агенты используют этот файл для отслеживания микро-задач в рамках текущего Эпика.

## In Progress
- [ ] **Backend Models:** Привести все SQLAlchemy модели к единому стандарту (Base, TimestampMixin).

## Done
- [x] **Backend Models:** Создан `TimestampMixin` в `backend/app/models/base.py` для автоматического отслеживания времени создания и обновления записей.
- [x] **Backend Core:** Проведен аудит и рефакторинг `backend/app/core/config.py` (настройки приложения, валидация переменных окружения через Pydantic BaseSettings).
- [x] **Backend Core:** Проведен аудит и рефакторинг `backend/app/core/db.py` (настройка асинхронного движка SQLAlchemy, пула соединений, сессий).
- [x] Создана ветка `epic/core-refactoring` для глобального архитектурного рефакторинга.
- [x] Обновлен `AGENT_PLAN.md` с дорожной картой рефакторинга (Core -> Models -> Services -> API -> Frontend).
