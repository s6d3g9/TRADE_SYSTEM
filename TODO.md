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
- [x] Переведены роуты `signals/analysis/neuro` с `HTTPException` на доменные ошибки (`BadRequestError/NotFoundError/ConflictError`).
- [x] Добавлен `UnauthorizedError` и переведены `api/deps.py` + `api/market.py` на доменные ошибки.
- [x] Переведены `api/store.py` и `api/alignment.py` с `HTTPException` на доменные ошибки (`NotFoundError`).
- [x] Переведены `api/ai.py` и `api/auth.py` с `HTTPException` на доменные ошибки (`AppError`-иерархия).
- [x] Переведен `api/graphs.py` на доменные ошибки; завершен sweep `backend/app/api` по `HTTPException`.
- [x] Cleanup workers: удалена неиспользуемая `_set_run_status` и заменены silent `pass` на явное поведение/логирование в `analysis_worker.py` и `graph_worker.py`.
- [x] Cleanup services: в `trading_backtest.py` и `freqtrade_data.py` silent `except ...: pass` заменены на `debug`-логирование.
- [x] Hardening services: `BacktestService.run_backtest` переведен с заглушки на реальный запуск через `trading_backtest`, а `strategylab_export.py` переведен на доменные ошибки.
