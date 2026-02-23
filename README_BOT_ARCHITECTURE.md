# Архитектура хранения данных для торговых ботов

## Обзор

Система поддерживает несколько режимов работы ботов:
- **BACKTEST** - исторический бектест на старых данных
- **DRY_RUN** - торговля на тестовом депозите (paper trading)
- **LIVE** - реальная торговля с реальными деньгами

## Структура таблиц базы данных

### 1. `bots` - Основная таблица ботов

```sql
CREATE TABLE bots (
    bot_id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    
    -- Связи
    alignment_id VARCHAR REFERENCES strategy_alignments(alignment_id),
    user_id VARCHAR REFERENCES users(user_id),
    
    -- Конфигурация
    config_path VARCHAR NOT NULL,
    exchange VARCHAR NOT NULL,  -- binance, okx, bybit, etc.
    
    -- Состояние
    status VARCHAR NOT NULL DEFAULT 'created',  -- created, running, paused, stopped, error
    mode VARCHAR NOT NULL DEFAULT 'dry_run',    -- backtest, dry_run, live
    
    -- Метаданные
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Дополнительно
    tags JSONB DEFAULT '[]',
    meta JSONB DEFAULT '{}'
);

CREATE INDEX idx_bots_user_id ON bots(user_id);
CREATE INDEX idx_bots_status ON bots(status);
CREATE INDEX idx_bots_mode ON bots(mode);
CREATE INDEX idx_bots_alignment_id ON bots(alignment_id);
```

**Статусы бота:**
- `created` - бот создан, но не запущен
- `running` - бот активно торгует
- `paused` - бот приостановлен
- `stopped` - бот остановлен пользователем
- `error` - бот остановлен из-за ошибки

**Режимы работы:**
- `backtest` - тестирование на исторических данных
- `dry_run` - виртуальная торговля (бумажный трейдинг)
- `live` - реальная торговля

---

### 2. `bot_sessions` - Сессии работы бота

Каждый раз когда бот запускается - создается новая сессия.

```sql
CREATE TABLE bot_sessions (
    session_id VARCHAR PRIMARY KEY,
    bot_id VARCHAR NOT NULL REFERENCES bots(bot_id) ON DELETE CASCADE,
    
    -- Время работы
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    stopped_at TIMESTAMP WITH TIME ZONE,
    
    -- Состояние
    status VARCHAR NOT NULL DEFAULT 'running',  -- running, stopped, crashed
    
    -- Docker контейнер
    container_id VARCHAR,
    container_name VARCHAR,
    
    -- Депозит
    initial_balance DECIMAL(20, 8),
    final_balance DECIMAL(20, 8),
    
    -- Статистика сессии
    stats JSONB DEFAULT '{}',  -- total_trades, win_rate, pnl, etc.
    
    -- Логи и ошибки
    logs_path VARCHAR,
    error_message TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bot_sessions_bot_id ON bot_sessions(bot_id);
CREATE INDEX idx_bot_sessions_started_at ON bot_sessions(started_at);
CREATE INDEX idx_bot_sessions_status ON bot_sessions(status);
```

---

### 3. `trades` - Торговые сделки

Хранит все сделки (открытие и закрытие позиций) для всех режимов.

```sql
CREATE TABLE trades (
    trade_id VARCHAR PRIMARY KEY,
    
    -- Связи
    bot_id VARCHAR NOT NULL REFERENCES bots(bot_id) ON DELETE CASCADE,
    session_id VARCHAR REFERENCES bot_sessions(session_id) ON DELETE SET NULL,
    
    -- Тип источника
    source_type VARCHAR NOT NULL,  -- bot, backtest, dry_run, live
    
    -- Основная информация о сделке
    exchange VARCHAR NOT NULL,
    pair VARCHAR NOT NULL,           -- BTC/USDT
    side VARCHAR NOT NULL,           -- buy, sell
    order_type VARCHAR NOT NULL,     -- market, limit, stop_loss, etc.
    
    -- Количество и цена
    amount DECIMAL(20, 8) NOT NULL,
    price DECIMAL(20, 8) NOT NULL,
    cost DECIMAL(20, 8) NOT NULL,    -- amount * price
    
    -- Комиссия
    fee_cost DECIMAL(20, 8),
    fee_currency VARCHAR,
    
    -- ID из биржи
    exchange_order_id VARCHAR,
    exchange_trade_id VARCHAR,
    
    -- Статус
    status VARCHAR NOT NULL DEFAULT 'open',  -- open, closed, canceled
    
    -- Временные метки
    opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,
    
    -- Дополнительно
    meta JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trades_bot_id ON trades(bot_id);
CREATE INDEX idx_trades_session_id ON trades(session_id);
CREATE INDEX idx_trades_pair ON trades(pair);
CREATE INDEX idx_trades_opened_at ON trades(opened_at);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_source_type ON trades(source_type);
```

---

### 4. `positions` - Открытые позиции

Текущие открытые позиции бота (агрегация сделок).

```sql
CREATE TABLE positions (
    position_id VARCHAR PRIMARY KEY,
    
    -- Связи
    bot_id VARCHAR NOT NULL REFERENCES bots(bot_id) ON DELETE CASCADE,
    session_id VARCHAR REFERENCES bot_sessions(session_id) ON DELETE SET NULL,
    
    -- Основная информация
    exchange VARCHAR NOT NULL,
    pair VARCHAR NOT NULL,
    side VARCHAR NOT NULL,  -- long, short
    
    -- Размер позиции
    amount DECIMAL(20, 8) NOT NULL,
    entry_price DECIMAL(20, 8) NOT NULL,
    current_price DECIMAL(20, 8),
    
    -- Плечо
    leverage INTEGER DEFAULT 1,
    
    -- Стоп-лосс и тейк-профит
    stop_loss DECIMAL(20, 8),
    take_profit DECIMAL(20, 8),
    
    -- PnL
    unrealized_pnl DECIMAL(20, 8),
    unrealized_pnl_percent DECIMAL(10, 4),
    
    -- Комиссии
    total_fees DECIMAL(20, 8) DEFAULT 0,
    
    -- Статус
    status VARCHAR NOT NULL DEFAULT 'open',  -- open, closing, closed
    
    -- Время
    opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,
    
    -- Связь со сделками
    entry_trade_ids JSONB DEFAULT '[]',
    
    -- Дополнительно
    meta JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_positions_bot_id ON positions(bot_id);
CREATE INDEX idx_positions_session_id ON positions(session_id);
CREATE INDEX idx_positions_pair ON positions(pair);
CREATE INDEX idx_positions_status ON positions(status);
CREATE INDEX idx_positions_opened_at ON positions(opened_at);
```

---

### 5. `backtests` - Результаты бектестов

```sql
CREATE TABLE backtests (
    backtest_id VARCHAR PRIMARY KEY,
    
    -- Связи
    bot_id VARCHAR REFERENCES bots(bot_id) ON DELETE SET NULL,
    alignment_id VARCHAR REFERENCES strategy_alignments(alignment_id) ON DELETE SET NULL,
    user_id VARCHAR REFERENCES users(user_id),
    
    -- Параметры бектеста
    strategy_name VARCHAR NOT NULL,
    pair VARCHAR NOT NULL,
    timeframe VARCHAR NOT NULL,  -- 1m, 5m, 1h, etc.
    
    -- Период
    backtest_start TIMESTAMP WITH TIME ZONE NOT NULL,
    backtest_end TIMESTAMP WITH TIME ZONE NOT NULL,
    period_description VARCHAR,
    
    -- Начальный капитал
    initial_capital DECIMAL(20, 8) NOT NULL DEFAULT 1000,
    
    -- Результаты
    final_capital DECIMAL(20, 8),
    total_return DECIMAL(10, 4),
    total_return_percent DECIMAL(10, 4),
    
    -- Статистика сделок
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    losing_trades INTEGER DEFAULT 0,
    win_rate DECIMAL(10, 4),
    
    -- Средние значения
    avg_trade_return DECIMAL(10, 4),
    avg_winning_trade DECIMAL(10, 4),
    avg_losing_trade DECIMAL(10, 4),
    
    -- Риск-метрики
    max_drawdown DECIMAL(10, 4),
    max_drawdown_percent DECIMAL(10, 4),
    sharpe_ratio DECIMAL(10, 4),
    sortino_ratio DECIMAL(10, 4),
    profit_factor DECIMAL(10, 4),
    
    -- Файлы результатов
    result_file_path VARCHAR,
    trades_file_path VARCHAR,
    
    -- Статус
    status VARCHAR NOT NULL DEFAULT 'pending',  -- pending, running, completed, failed
    
    -- Логи
    logs_path VARCHAR,
    error_message TEXT,
    
    -- Дополнительные метрики
    metrics JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_backtests_bot_id ON backtests(bot_id);
CREATE INDEX idx_backtests_alignment_id ON backtests(alignment_id);
CREATE INDEX idx_backtests_user_id ON backtests(user_id);
CREATE INDEX idx_backtests_strategy_name ON backtests(strategy_name);
CREATE INDEX idx_backtests_pair ON backtests(pair);
CREATE INDEX idx_backtests_created_at ON backtests(created_at);
CREATE INDEX idx_backtests_status ON backtests(status);
```

---

### 6. `bot_metrics` - Метрики бота в реальном времени

Периодически сохраняются метрики для мониторинга и аналитики.

```sql
CREATE TABLE bot_metrics (
    metric_id BIGSERIAL PRIMARY KEY,
    
    -- Связи
    bot_id VARCHAR NOT NULL REFERENCES bots(bot_id) ON DELETE CASCADE,
    session_id VARCHAR REFERENCES bot_sessions(session_id) ON DELETE CASCADE,
    
    -- Время снимка
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Баланс
    balance DECIMAL(20, 8),
    available_balance DECIMAL(20, 8),
    locked_balance DECIMAL(20, 8),
    
    -- Позиции
    open_positions INTEGER DEFAULT 0,
    total_positions_value DECIMAL(20, 8),
    
    -- PnL
    unrealized_pnl DECIMAL(20, 8),
    realized_pnl DECIMAL(20, 8),
    total_pnl DECIMAL(20, 8),
    
    -- Статистика
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    losing_trades INTEGER DEFAULT 0,
    win_rate DECIMAL(10, 4),
    
    -- Дополнительные метрики
    metrics JSONB DEFAULT '{}'
);

CREATE INDEX idx_bot_metrics_bot_id_timestamp ON bot_metrics(bot_id, timestamp DESC);
CREATE INDEX idx_bot_metrics_session_id ON bot_metrics(session_id);
```

---

### 7. `exchange_accounts` - Аккаунты на биржах

Хранит API ключи и настройки для подключения к биржам.

```sql
CREATE TABLE exchange_accounts (
    account_id VARCHAR PRIMARY KEY,
    
    -- Пользователь
    user_id VARCHAR NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Биржа
    exchange VARCHAR NOT NULL,  -- binance, okx, bybit, etc.
    
    -- Название (пользовательское)
    name VARCHAR NOT NULL,
    
    -- Тип аккаунта
    account_type VARCHAR NOT NULL DEFAULT 'spot',  -- spot, futures, margin
    
    -- API ключи (зашифрованы!)
    api_key_encrypted TEXT NOT NULL,
    api_secret_encrypted TEXT NOT NULL,
    passphrase_encrypted TEXT,  -- для OKX и др.
    
    -- Настройки
    is_testnet BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Лимиты и права
    permissions JSONB DEFAULT '{}',  -- trading, withdrawal, etc.
    
    -- Последняя синхронизация
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_balance DECIMAL(20, 8),
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exchange_accounts_user_id ON exchange_accounts(user_id);
CREATE INDEX idx_exchange_accounts_exchange ON exchange_accounts(exchange);
```

---

## Связи между таблицами

```
users (1) ----< (N) bots
users (1) ----< (N) exchange_accounts

strategy_alignments (1) ----< (N) bots
strategy_alignments (1) ----< (N) backtests

bots (1) ----< (N) bot_sessions
bots (1) ----< (N) trades
bots (1) ----< (N) positions
bots (1) ----< (N) backtests
bots (1) ----< (N) bot_metrics

bot_sessions (1) ----< (N) trades
bot_sessions (1) ----< (N) positions
bot_sessions (1) ----< (N) bot_metrics

positions (1) ----< (N) trades (via entry_trade_ids)
```

---

## Примеры использования

### Создание нового бота

```python
bot = Bot(
    bot_id=str(uuid.uuid4()),
    name="My BTC Bot",
    alignment_id="alignment-123",
    user_id="user-456",
    config_path="/configs/bot-123.json",
    exchange="binance",
    status="created",
    mode="dry_run"
)
```

### Запуск бота (создание сессии)

```python
session = BotSession(
    session_id=str(uuid.uuid4()),
    bot_id=bot.bot_id,
    started_at=datetime.now(timezone.utc),
    status="running",
    container_id="docker-container-id",
    container_name="freqtrade-bot-123",
    initial_balance=1000.0
)
```

### Запись сделки

```python
trade = Trade(
    trade_id=str(uuid.uuid4()),
    bot_id=bot.bot_id,
    session_id=session.session_id,
    source_type="dry_run",
    exchange="binance",
    pair="BTC/USDT",
    side="buy",
    order_type="market",
    amount=0.01,
    price=42000.0,
    cost=420.0,
    fee_cost=0.42,
    fee_currency="USDT",
    status="closed",
    opened_at=datetime.now(timezone.utc)
)
```

### Открытие позиции

```python
position = Position(
    position_id=str(uuid.uuid4()),
    bot_id=bot.bot_id,
    session_id=session.session_id,
    exchange="binance",
    pair="BTC/USDT",
    side="long",
    amount=0.01,
    entry_price=42000.0,
    current_price=42500.0,
    leverage=5,
    stop_loss=40000.0,
    take_profit=45000.0,
    unrealized_pnl=5.0,
    unrealized_pnl_percent=1.19,
    entry_trade_ids=["trade-123"],
    status="open"
)
```

### Сохранение метрик

```python
metrics = BotMetrics(
    bot_id=bot.bot_id,
    session_id=session.session_id,
    timestamp=datetime.now(timezone.utc),
    balance=1050.0,
    available_balance=900.0,
    locked_balance=150.0,
    open_positions=2,
    total_positions_value=150.0,
    unrealized_pnl=5.0,
    realized_pnl=45.0,
    total_pnl=50.0,
    total_trades=10,
    winning_trades=6,
    losing_trades=4,
    win_rate=60.0
)
```

### Создание бектеста

```python
backtest = Backtest(
    backtest_id=str(uuid.uuid4()),
    alignment_id="alignment-123",
    user_id="user-456",
    strategy_name="NostalgiaForInfinityX",
    pair="BTC/USDT",
    timeframe="5m",
    backtest_start=datetime(2024, 1, 1),
    backtest_end=datetime(2024, 12, 31),
    initial_capital=1000.0,
    final_capital=1250.0,
    total_return=250.0,
    total_return_percent=25.0,
    total_trades=150,
    winning_trades=90,
    losing_trades=60,
    win_rate=60.0,
    max_drawdown=50.0,
    max_drawdown_percent=5.0,
    sharpe_ratio=1.8,
    profit_factor=1.5,
    status="completed"
)
```

---

## API Endpoints

### Боты

- `GET /api/bots` - список всех ботов пользователя
- `GET /api/bots/{bot_id}` - детали бота
- `POST /api/bots` - создать нового бота
- `PUT /api/bots/{bot_id}` - обновить бота
- `DELETE /api/bots/{bot_id}` - удалить бота
- `POST /api/bots/{bot_id}/start` - запустить бота
- `POST /api/bots/{bot_id}/stop` - остановить бота
- `POST /api/bots/{bot_id}/pause` - приостановить бота
- `GET /api/bots/{bot_id}/status` - текущий статус бота

### Сессии

- `GET /api/bots/{bot_id}/sessions` - список сессий бота
- `GET /api/sessions/{session_id}` - детали сессии
- `GET /api/sessions/{session_id}/stats` - статистика сессии

### Торговля

- `GET /api/bots/{bot_id}/trades` - сделки бота
- `GET /api/bots/{bot_id}/positions` - открытые позиции
- `POST /api/positions/{position_id}/close` - закрыть позицию

### Метрики

- `GET /api/bots/{bot_id}/metrics` - метрики бота за период
- `GET /api/bots/{bot_id}/metrics/current` - текущие метрики

### Бектесты

- `GET /api/backtests` - список бектестов
- `GET /api/backtests/{backtest_id}` - детали бектеста
- `POST /api/backtests` - запустить новый бектест
- `GET /api/backtests/{backtest_id}/trades` - сделки бектеста

---

## Миграция данных

Для перехода от старой структуры к новой:

1. Создать новые таблицы
2. Мигрировать существующие боты
3. Создать начальные сессии для активных ботов
4. Импортировать исторические данные из логов Freqtrade

---

## Мониторинг и аналитика

### Дашборд бота показывает:

1. **Текущее состояние**
   - Статус (running/stopped/paused)
   - Режим (backtest/dry_run/live)
   - Время работы (uptime)
   - Текущая сессия

2. **Баланс**
   - Начальный баланс сессии
   - Текущий баланс
   - Доступный/заблокированный
   - Изменение за сессию

3. **Позиции**
   - Количество открытых позиций
   - Общая стоимость позиций
   - Нереализованный PnL
   - Список позиций с деталями

4. **Статистика торговли**
   - Всего сделок
   - Выигрышных/проигрышных
   - Win rate
   - Средняя прибыль на сделку
   - Общий PnL

5. **График метрик**
   - Баланс во времени
   - PnL во времени
   - Количество сделок
   - Win rate динамика

---

## Безопасность

1. **API ключи** - хранятся в зашифрованном виде
2. **Доступ** - каждый пользователь видит только свои боты
3. **Логирование** - все действия логируются
4. **Валидация** - проверка всех входных данных

---

## Производительность

1. **Индексы** - созданы для всех частых запросов
2. **Партиционирование** - для больших таблиц (trades, metrics)
3. **Архивирование** - старые данные архивируются
4. **Кэширование** - метрики кэшируются в Redis

---

Эта архитектура обеспечивает полное отслеживание жизненного цикла бота, всех его торговых операций и метрик производительности.
