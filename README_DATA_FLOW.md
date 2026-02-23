# Поток данных и хранение информации

Источник истины по деталям хранения (включая артефакты и отчёты): [README_DATA_STORAGE_STRATEGIES.md](README_DATA_STORAGE_STRATEGIES.md).

## Пользовательские данные

- **Postgres** (через backend):
  - Стратегии, модели, сонастройки, версии конфигов, боты
  - Все изменения versioned (created_at, updated_at)
- **Redis**:
  - Очереди задач (например, autotune, agent alignment)
  - Pub/sub для событий
- **Файлы**:
  - финальный bot config.json и другие тяжёлые артефакты (например результаты бэктестов) — сохраняются на диск, с метаданными/ссылками из БД
  - исходники стратегий — в git; backend может клонировать/кэшировать репозиторий на диск по запросу

## Пример сценария

1. Пользователь создаёт стратегию и модель (POST /strategylab/strategies, /models)
2. Создаёт alignment (POST /alignments)
3. Запускает autotune (POST /alignments/{id}/autotune) — задача может идти через AI API или очередь
4. Результат autotune — новый ConfigFile (scope=alignment, is_active=True)
5. Генерирует бота (POST /alignments/{id}/generate-bot) — config.json пишется на диск, создаётся Bot
6. Все данные доступны через API и UI
