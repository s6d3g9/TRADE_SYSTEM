# Где и как хранятся данные в TRADE_SYSTEM

Источник истины по модели данных (StrategyModule/base+variants/regime/alignment/bots) и хранению артефактов: [README_DATA_STORAGE_STRATEGIES.md](README_DATA_STORAGE_STRATEGIES.md).

- **Postgres**: основные сущности (StrategyTemplate≈StrategyModule, модели, сонастройки, версии конфигов, реестр ботов)
- **Redis**: очереди задач, pub/sub
- **Файлы (артефакты)**: финальный bot config.json, результаты бэктестов/прогона, и другие тяжёлые артефакты; исходники стратегий — в git, могут кэшироваться на диск

## Примеры

- Создание стратегии — запись в таблице `strategy_templates` (модель StrategyTemplate)
- Autotune — новая версия `config_files` (scope=strategy|model|alignment)
- Генерация бота — config.json на диск, запись в bots
