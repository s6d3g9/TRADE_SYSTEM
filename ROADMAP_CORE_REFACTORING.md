# Дорожная карта: Глобальный Архитектурный Рефакторинг (Core Refactoring)

Этот документ описывает строгий пошаговый план перевода проекта TRADE_SYSTEM на чистую слоистую архитектуру (Clean Architecture), где Freqtrade выступает в роли вычислительного ядра.

## Фаза 1: Фундамент (Core Layer) - ✅ ЗАВЕРШЕНО
- [x] Создание ветки `epic/core-refactoring`.
- [x] Рефакторинг `config.py` (Pydantic BaseSettings, строгая валидация).
- [x] Рефакторинг `db.py` (DatabaseManager, пулы соединений, безопасное закрытие сессий).
- [x] Рефакторинг `models/base.py` (Создание `TimestampMixin` для автоматического трекинга времени).
- [x] Фиксация в Git.

## Фаза 2: Слой Данных (Data Layer / Models) - ✅ ЗАВЕРШЕНО
- [x] Рефакторинг `models/trading.py` (Bot, BotSession, Trade, Backtest). Применение `TimestampMixin`, проверка связей (Relationships).
- [x] Рефакторинг `models/strategylab.py` (StrategyTemplate, FreqAIModelVariant).
- [x] Создание миграций Alembic для обновленных моделей (схема не изменилась, миграции не требуются).
- [x] Фиксация в Git.

## Фаза 3: Доменный Слой (Domain Layer / Schemas) - ⏳ В ПРОЦЕССЕ
- [ ] Обновление Pydantic схем в `schemas/trading.py` до стандарта Pydantic V2 (ConfigDict, строгая типизация).
- [ ] Обновление схем в `schemas/strategylab.py`.
- [ ] Фиксация в Git.

## Фаза 4: Слой Бизнес-логики (Service Layer) - 📝 ОЖИДАЕТ
*Здесь мы пишем "Умную обертку" для Freqtrade.*
- [ ] Создание `services/bot_service.py` (Логика генерации конфигов и запуска Docker-контейнеров Freqtrade).
- [ ] Создание `services/backtest_service.py` (Логика запуска бэктестов и парсинга результатов).
- [ ] Создание `services/freqai_service.py` (Управление моделями машинного обучения).
- [ ] Фиксация в Git.

## Фаза 5: Транспортный Слой (API Layer) - 📝 ОЖИДАЕТ
- [ ] Очистка `api/trading.py`. Удаление бизнес-логики, вызов методов из `bot_service.py`.
- [ ] Очистка `api/strategylab.py`.
- [ ] Настройка глобальной обработки ошибок (Exception Handlers) для доменных исключений.
- [ ] Фиксация в Git.

## Правила работы:
1. **Строгий Git Flow:** Каждый логический шаг завершается коммитом. Никаких "висящих" изменений.
2. **Изоляция слоев:** Роутеры не делают SQL-запросы. Сервисы не знают про HTTP.
3. **Freqtrade как ядро:** Мы не пишем свой торговый движок, мы пишем систему управления для Freqtrade.
