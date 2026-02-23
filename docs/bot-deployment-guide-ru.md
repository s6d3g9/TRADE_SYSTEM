# 🤖 Руководство по созданию и запуску торгового бота

## Быстрый старт

### Шаг 1: Выбор стратегии и модели

1. Откройте страницу: **http://localhost:8090/strategylab/combinator**
2. В левой колонке выберите **стратегию** (например, `SampleStrategy`)
3. В средней колонке выберите **AI модель** (например, `LightGBM`)

### Шаг 2: Создание Alignment

После выбора стратегии и модели автоматически создастся **Alignment** - это комбинация стратегии + модели с конфигурацией.

### Шаг 3: Генерация бота

Нажмите одну из кнопок:

- **🚀 Generate Bot** - создаст бота с конфигом FreqAI
- **🧪 Generate & Backtest** - создаст бота И сразу запустит бэктест (займёт ~10 минут)

### Шаг 4: Запуск бота

После генерации бот появится в таблице **"Generated Bots"**.

Нажмите кнопку **▶ START** рядом с ботом:
- Бот развернётся в Docker контейнере
- Начнётся торговля с вашими настройками
- Кнопка станет зелёной: **● ON**

## Подробно

### Что происходит при генерации бота?

1. **Создание конфига**: Система генерирует `config.json` с настройками:
   - Базовые параметры Freqtrade (stake, pairs, timeframe)
   - Конфигурация FreqAI (model, features, training)
   - Параметры стратегии

2. **Сохранение**: Конфиг сохраняется в `/data/configs/alignment/{alignment_id}/config.json`

3. **Создание бота**: В базе создаётся запись бота с привязкой к конфигу

### Что происходит при Deploy (START)?

1. **Docker контейнер**:
   ```bash
   docker run -d \
     --name freqtrade-bot-{bot_id} \
     --network trade_system_default \
     -v {config_path}:/freqtrade/config.json:ro \
     -v /freqtrade/user_data:/freqtrade/user_data \
     freqtradeorg/freqtrade:stable trade
   ```

2. **Freqtrade запускается** с вашим конфигом
3. **FreqAI начинает**:
   - Загружать исторические данные
   - Обучать модель
   - Делать предсказания
   - Открывать сделки

### Структура конфига

```json
{
  "max_open_trades": 3,
  "stake_currency": "USDT",
  "dry_run": true,
  "dry_run_wallet": 1000,
  
  "exchange": {
    "name": "binance",
    "pair_whitelist": ["BTC/USDT", "ETH/USDT"]
  },
  
  "strategy": "YourStrategyName",
  "strategy_path": "/freqtrade/user_data/strategies",
  
  "freqai": {
    "enabled": true,
    "identifier": "strategy_model",
    "train_period_days": 30,
    "backtest_period_days": 7,
    "feature_parameters": {
      "include_timeframes": ["5m", "15m", "1h"],
      "label_period_candles": 24
    },
    "model_training_parameters": {
      "n_estimators": 1000,
      "learning_rate": 0.02
    }
  }
}
```

## Действия с ботом

### ▶ START / ● ON
- **Серая кнопка "▶ START"**: Бот не запущен, нажмите для deploy
- **Зелёная кнопка "● ON"**: Бот работает в Docker

### 🧪 Run Backtest
Запустить исторический тест стратегии:
- Загрузит данные из `/freqtrade/user_data/data/`
- Запустит backtest в отдельном контейнере
- Результаты появятся в таблице **"Backtests"**
- Кликните 📈 для детального просмотра

### ⏰ Schedule Timer
(В разработке) Настройка расписания запуска/остановки

### 📊 View Details
Детальная информация о боте

## Проверка работы бота

### Логи контейнера
```bash
docker logs freqtrade-bot-{alignment_id}
```

### Статус контейнера
```bash
docker ps | grep freqtrade-bot
```

### API статус
```http
GET /api/bots/{bot_id}/status
```

Ответ:
```json
{
  "bot_id": "abc-123",
  "container_name": "freqtrade-bot-abc-123",
  "status": "running",
  "logs": "..."
}
```

## Режимы работы

### Dry Run (по умолчанию)
- `"dry_run": true`
- Симуляция торговли без реальных денег
- Виртуальный кошелёк: $1000
- Безопасно для тестирования

### Live Trading
⚠️ **Внимание! Реальные деньги!**

Для включения:
1. Измените конфиг: `"dry_run": false`
2. Добавьте API ключи биржи:
   ```json
   "exchange": {
     "name": "binance",
     "key": "YOUR_API_KEY",
     "secret": "YOUR_API_SECRET"
   }
   ```
3. Перезапустите бота

## Мониторинг

### В UI показывается:
- **Статус**: Running / Stopped
- **Uptime**: Время работы бота
- **P&L**: Прибыль/убыток (mock данные пока)
- **Open Positions**: Количество открытых позиций
- **Win Rate**: Процент успешных сделок
- **Total Trades**: Общее количество сделок

### Реальные данные
Для получения реальных данных нужно интегрировать Freqtrade REST API:
- `GET /api/v1/status` - текущие позиции
- `GET /api/v1/profit` - P&L
- `GET /api/v1/trades` - история сделок

## Troubleshooting

### Бот не запускается
```bash
# Проверить логи
docker logs freqtrade-bot-{bot_id}

# Проверить конфиг
cat /data/configs/alignment/{alignment_id}/config.json

# Перезапустить
docker stop freqtrade-bot-{bot_id}
docker rm freqtrade-bot-{bot_id}
# Нажать START снова в UI
```

### Нет данных для бэктеста
```bash
# Скачать данные
docker exec -it freqtrade freqtrade download-data \
  --exchange binance \
  --pairs BTC/USDT ETH/USDT \
  --timeframe 5m \
  --days 90
```

### Ошибка "Config not found"
- Убедитесь что бот был сгенерирован через UI
- Проверьте существование файла конфига
- Пересоздайте бота через "Generate Bot"

## Best Practices

1. **Сначала бэктест**: Всегда запускайте бэктест перед live деплоем
2. **Проверьте конфиг**: Убедитесь что параметры правильные
3. **Начните с Dry Run**: Тестируйте на виртуальных деньгах
4. **Мониторьте логи**: Регулярно проверяйте работу бота
5. **Малые суммы**: Начинайте с минимального stake

## Следующие шаги

- [ ] Добавить real-time метрики из Freqtrade API
- [ ] Интеграция WebSocket для live обновлений
- [ ] Графики equity curve
- [ ] Кнопка Stop для остановки ботов
- [ ] Редактирование конфига в UI
- [ ] Множественные пары и таймфреймы
- [ ] Оптимизация гиперпараметров
