# Руководство по использованию системы торговли ботами

## Обзор

Новая архитектура хранения данных для торговых ботов обеспечивает полный контроль над жизненным циклом бота, его торговыми операциями и производительностью.

## Основные концепции

### 1. Бот (Bot)
Конфигурация и настройки торгового бота. Создается один раз и существует независимо от запусков.

**Статусы:**
- `created` - создан, но не запущен
- `running` - активно торгует
- `paused` - приостановлен
- `stopped` - остановлен пользователем
- `error` - остановлен из-за ошибки

**Режимы:**
- `backtest` - тестирование на исторических данных
- `dry_run` - виртуальная торговля (paper trading)
- `live` - реальная торговля

### 2. Сессия бота (BotSession)
Каждый раз когда бот запускается, создается новая сессия. Сессия отслеживает:
- Время работы (uptime)
- Начальный и финальный баланс
- Docker контейнер
- Логи и ошибки
- Статистику сессии

### 3. Сделки (Trade)
Индивидуальные торговые операции (покупка/продажа). Содержит:
- Пара (BTC/USDT)
- Сторона (buy/sell)
- Цена и объем
- Комиссии
- ID заказа на бирже

### 4. Позиции (Position)
Открытые торговые позиции (агрегация сделок). Отслеживает:
- Размер позиции
- Цену входа и текущую цену
- Stop-loss и Take-profit
- Нереализованный PnL
- Плечо (leverage)

### 5. Бектест (Backtest)
Результаты тестирования стратегии на исторических данных:
- Параметры теста (период, пара, таймфрейм)
- Метрики доходности
- Статистика сделок
- Риск-метрики (Sharpe ratio, max drawdown)

### 6. Метрики (BotMetric)
Периодические снимки состояния бота для мониторинга:
- Баланс (доступный/заблокированный)
- Открытые позиции
- PnL (реализованный/нереализованный)
- Win rate

## Примеры использования

### Создание нового бота

```python
# POST /api/trading/bots
{
  "name": "My BTC Strategy",
  "alignment_id": "align-123",
  "config_path": "/configs/bot-config.json",
  "exchange": "binance",
  "status": "created",
  "mode": "dry_run",
  "tags": ["btc", "scalping"],
  "meta": {
    "strategy": "NostalgiaForInfinityX",
    "model": "xgboost-optimized"
  }
}
```

**Ответ:**
```json
{
  "bot_id": "bot-abc-123",
  "name": "My BTC Strategy",
  "alignment_id": "align-123",
  "user_id": "user-456",
  "config_path": "/configs/bot-config.json",
  "exchange": "binance",
  "status": "created",
  "mode": "dry_run",
  "created_at": "2025-12-22T10:00:00Z",
  "updated_at": "2025-12-22T10:00:00Z",
  "tags": ["btc", "scalping"],
  "meta": {
    "strategy": "NostalgiaForInfinityX",
    "model": "xgboost-optimized"
  }
}
```

### Запуск бота (создание сессии)

```python
# POST /api/trading/sessions
{
  "bot_id": "bot-abc-123",
  "container_name": "freqtrade-bot-abc-123",
  "container_id": "docker-xyz-789",
  "initial_balance": 1000.0
}
```

**Параллельно обновить статус бота:**
```python
# PUT /api/trading/bots/bot-abc-123
{
  "status": "running"
}
```

### Получение списка ботов с текущим статусом

```python
# GET /api/trading/bots
```

**Ответ:**
```json
[
  {
    "bot_id": "bot-abc-123",
    "name": "My BTC Strategy",
    "status": "running",
    "mode": "dry_run",
    "exchange": "binance",
    "current_session": {
      "session_id": "sess-xyz-789",
      "started_at": "2025-12-22T10:05:00Z",
      "status": "running",
      "initial_balance": 1000.0,
      "container_name": "freqtrade-bot-abc-123"
    },
    "open_positions_count": 3,
    "current_balance": 1050.25,
    "current_pnl": 50.25
  }
]
```

### Запись торговой сделки

```python
# POST /api/trading/trades
{
  "bot_id": "bot-abc-123",
  "session_id": "sess-xyz-789",
  "source_type": "dry_run",
  "exchange": "binance",
  "pair": "BTC/USDT",
  "side": "buy",
  "order_type": "market",
  "amount": 0.01,
  "price": 42000.0,
  "cost": 420.0,
  "fee_cost": 0.42,
  "fee_currency": "USDT",
  "exchange_order_id": "order-12345",
  "status": "closed"
}
```

### Открытие позиции

```python
# POST /api/trading/positions
{
  "bot_id": "bot-abc-123",
  "session_id": "sess-xyz-789",
  "exchange": "binance",
  "pair": "BTC/USDT",
  "side": "long",
  "amount": 0.01,
  "entry_price": 42000.0,
  "leverage": 5,
  "stop_loss": 40000.0,
  "take_profit": 45000.0,
  "entry_trade_ids": ["trade-abc-123"]
}
```

### Обновление позиции (текущая цена и PnL)

```python
# PUT /api/trading/positions/pos-xyz-789
{
  "current_price": 42500.0,
  "unrealized_pnl": 5.0,
  "unrealized_pnl_percent": 1.19
}
```

### Закрытие позиции

```python
# POST /api/trading/positions/pos-xyz-789/close
```

### Получение открытых позиций бота

```python
# GET /api/trading/bots/bot-abc-123/positions?status=open
```

**Ответ:**
```json
[
  {
    "position_id": "pos-xyz-789",
    "bot_id": "bot-abc-123",
    "session_id": "sess-xyz-789",
    "pair": "BTC/USDT",
    "side": "long",
    "amount": 0.01,
    "entry_price": 42000.0,
    "current_price": 42500.0,
    "leverage": 5,
    "stop_loss": 40000.0,
    "take_profit": 45000.0,
    "unrealized_pnl": 5.0,
    "unrealized_pnl_percent": 1.19,
    "total_fees": 0.42,
    "status": "open",
    "opened_at": "2025-12-22T10:10:00Z",
    "entry_trade_ids": ["trade-abc-123"]
  }
]
```

### Запись метрик бота

```python
# POST /api/trading/bots/bot-abc-123/metrics
{
  "bot_id": "bot-abc-123",
  "session_id": "sess-xyz-789",
  "balance": 1050.25,
  "available_balance": 900.0,
  "locked_balance": 150.25,
  "open_positions": 3,
  "total_positions_value": 1260.0,
  "unrealized_pnl": 50.25,
  "realized_pnl": 30.0,
  "total_pnl": 80.25,
  "total_trades": 15,
  "winning_trades": 9,
  "losing_trades": 6,
  "win_rate": 60.0
}
```

### Получение истории метрик

```python
# GET /api/trading/bots/bot-abc-123/metrics?limit=100
```

Возвращает массив метрик для построения графиков.

### Остановка бота

```python
# 1. Остановить Docker контейнер (через /api/bots/stop)

# 2. Обновить сессию
# PUT /api/trading/sessions/sess-xyz-789
{
  "status": "stopped",
  "stopped_at": "2025-12-22T15:00:00Z",
  "final_balance": 1050.25
}

# 3. Обновить статус бота
# PUT /api/trading/bots/bot-abc-123
{
  "status": "stopped"
}
```

### Получение статистики бота

```python
# GET /api/trading/bots/bot-abc-123/stats
```

**Ответ:**
```json
{
  "bot_id": "bot-abc-123",
  "total_sessions": 5,
  "total_runtime_seconds": 86400,  // 24 hours
  "total_trades": 150,
  "winning_trades": 90,
  "losing_trades": 60,
  "win_rate": 60.0,
  "total_pnl": 250.50,
  "best_trade": 15.25,
  "worst_trade": -8.50,
  "avg_trade": 1.67
}
```

### Получение статистики сессии

```python
# GET /api/trading/sessions/sess-xyz-789/stats
```

**Ответ:**
```json
{
  "session_id": "sess-xyz-789",
  "bot_id": "bot-abc-123",
  "runtime_seconds": 14400,  // 4 hours
  "total_trades": 35,
  "open_positions": 3,
  "total_pnl": 50.25,
  "win_rate": 62.8,
  "balance_change": 50.25,
  "balance_change_percent": 5.02
}
```

### Создание бектеста

```python
# POST /api/trading/backtests
{
  "alignment_id": "align-123",
  "strategy_name": "NostalgiaForInfinityX",
  "pair": "BTC/USDT",
  "timeframe": "5m",
  "backtest_start": "2024-01-01T00:00:00Z",
  "backtest_end": "2024-12-31T23:59:59Z",
  "initial_capital": 1000.0
}
```

### Обновление результатов бектеста

```python
# PUT /api/trading/backtests/backtest-xyz-789
{
  "status": "completed",
  "final_capital": 1250.0,
  "total_return": 250.0,
  "total_return_percent": 25.0,
  "total_trades": 150,
  "winning_trades": 90,
  "losing_trades": 60,
  "win_rate": 60.0,
  "max_drawdown": 50.0,
  "max_drawdown_percent": 5.0,
  "sharpe_ratio": 1.8,
  "profit_factor": 1.5,
  "completed_at": "2025-12-22T15:30:00Z"
}
```

## Интеграция с фронтендом

### Dashboard бота

```typescript
// Получить бота с текущей сессией
const bot = await fetch(`/api/trading/bots/${botId}`).then(r => r.json())

// Отобразить:
// - bot.name
// - bot.status (running/stopped/paused)
// - bot.mode (backtest/dry_run/live)
// - bot.current_session.started_at (uptime)
// - bot.current_balance
// - bot.current_pnl
// - bot.open_positions_count

// Получить открытые позиции
const positions = await fetch(`/api/trading/bots/${botId}/positions?status=open`)
  .then(r => r.json())

// Получить метрики для графика
const metrics = await fetch(`/api/trading/bots/${botId}/metrics?limit=100`)
  .then(r => r.json())

// Построить график баланса/PnL
const chartData = metrics.map(m => ({
  timestamp: m.timestamp,
  balance: m.balance,
  pnl: m.total_pnl,
  win_rate: m.win_rate
}))
```

### Список ботов

```typescript
// Получить все боты пользователя
const bots = await fetch('/api/trading/bots').then(r => r.json())

// Фильтрация
const runningBots = bots.filter(b => b.status === 'running')
const liveBots = bots.filter(b => b.mode === 'live')

// Отображение в таблице
bots.forEach(bot => {
  // bot.name
  // bot.status
  // bot.mode
  // bot.current_session?.started_at (uptime)
  // bot.open_positions_count
  // bot.current_balance
  // bot.current_pnl
})
```

### Мониторинг позиций

```typescript
// Получить открытые позиции
const positions = await fetch(`/api/trading/bots/${botId}/positions?status=open`)
  .then(r => r.json())

positions.forEach(pos => {
  // pos.pair
  // pos.side (long/short)
  // pos.amount
  // pos.entry_price
  // pos.current_price
  // pos.unrealized_pnl
  // pos.unrealized_pnl_percent
  // pos.leverage
  
  // Кнопка "Close Position"
  // POST /api/trading/positions/${pos.position_id}/close
})
```

### История сделок

```typescript
// Получить сделки
const trades = await fetch(`/api/trading/bots/${botId}/trades?limit=100`)
  .then(r => r.json())

trades.forEach(trade => {
  // trade.pair
  // trade.side (buy/sell)
  // trade.amount
  // trade.price
  // trade.cost
  // trade.fee_cost
  // trade.opened_at
  // trade.status (open/closed)
})
```

## Миграция существующих данных

```bash
# Применить новую миграцию
cd backend
alembic upgrade head

# Если нужно откатить
alembic downgrade -1
```

## Производительность

### Индексация
Все критичные поля проиндексированы для быстрого доступа:
- `bots`: user_id, status, mode, alignment_id
- `bot_sessions`: bot_id, started_at, status
- `trades`: bot_id, session_id, pair, opened_at, status
- `positions`: bot_id, session_id, pair, status, opened_at
- `backtests`: bot_id, alignment_id, user_id, created_at, status
- `bot_metrics`: bot_id + timestamp (composite)

### Периодическое сохранение метрик

Рекомендуется сохранять метрики каждые 1-5 минут:

```python
# В фоновом воркере
async def save_bot_metrics():
    for bot in active_bots:
        # Получить текущее состояние из Freqtrade API
        balance = await get_balance(bot.bot_id)
        positions = await get_open_positions(bot.bot_id)
        trades = await get_recent_trades(bot.bot_id)
        
        # Сохранить метрики
        metric = BotMetricCreate(
            bot_id=bot.bot_id,
            session_id=bot.current_session_id,
            balance=balance.total,
            available_balance=balance.available,
            locked_balance=balance.locked,
            open_positions=len(positions),
            total_positions_value=sum(p.value for p in positions),
            unrealized_pnl=sum(p.pnl for p in positions),
            total_trades=len(trades),
            # ... другие метрики
        )
        
        await record_bot_metric(bot.bot_id, metric)
```

## Безопасность

1. **Аутентификация** - все эндпоинты требуют JWT токен
2. **Авторизация** - пользователь видит только свои боты
3. **Валидация** - все входные данные проверяются Pydantic
4. **Шифрование** - API ключи бирж хранятся в зашифрованном виде

## Следующие шаги

1. ✅ Создана архитектура базы данных
2. ✅ Созданы SQLAlchemy модели
3. ✅ Создана миграция Alembic
4. ✅ Созданы Pydantic схемы
5. ✅ Созданы API endpoints
6. 🔄 Обновить фронтенд для работы с новыми API
7. 🔄 Интегрировать с Freqtrade
8. 🔄 Добавить WebSocket для real-time обновлений
9. 🔄 Реализовать фоновые воркеры для метрик
10. 🔄 Добавить систему уведомлений
