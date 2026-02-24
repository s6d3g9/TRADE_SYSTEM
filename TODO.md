# Текущие задачи (TODO)

Агенты используют этот файл для отслеживания микро-задач в рамках текущего Эпика.

## Done (Фаза 2: Слой Данных)
- [x] Рефакторинг `backend/app/models/trading.py` (применение `TimestampMixin`, проверка связей).
- [x] Рефакторинг `backend/app/models/strategylab.py`.

## Done
- [x] Создан `ROADMAP_CORE_REFACTORING.md` с четким планом действий.
- [x] **Backend Models:** Создан `TimestampMixin` в `backend/app/models/base.py`.
- [x] **Backend Core:** Рефакторинг `config.py` и `db.py`.

## Done (Архитектурный hardening)
- [x] Вынесены доменные ошибки в `backend/app/core/exceptions.py` и подключен глобальный handler.
- [x] Реализованы materialized config params (`ConfigParam`) для табличного редактирования.
- [x] Добавлены diff/audit/export (JSON/CSV) для конфигов в StrategyLab.
- [x] Добавлены фильтры/сортировка/пагинация с `total` для audit endpoints.
- [x] Добавлены проверки доступа `scope/owner_id` в config params/diff/audit потоках.
- [x] Удалены дубли схем `ConfigFile*` в `backend/app/schemas/strategylab.py`.
- [x] Устранен warning Pydantic о поле `schema` в `backend/app/api/signals.py` без ломки API-контракта.
