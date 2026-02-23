# Bot Generator & Backtest System Usage

## Overview

Система генерации и тестирования ботов позволяет:
1. Создавать ботов из комбинаций Strategy + Model (Alignment)
2. Запускать бэктесты для ботов
3. Деплоить ботов в Docker контейнеры
4. Просматривать детальные результаты бэктестов

## Архитектура

```
Strategy Template + FreqAI Model + Config
        ↓
    Alignment (комбинация)
        ↓
    Generate Bot
        ↓
   /-----------\
   |           |
   Deploy    Backtest
   (live)    (historical)
```

## UI Компоненты

### 1. Combinator Page (Strategy Lab)

**Путь:** `/strategylab/combinator`

**Функции:**
- Выбор стратегии из списка
- Выбор AI модели
- Создание Alignment
- Генерация бота из Alignment
- **Новое:** Кнопка "Generate & Backtest" - создаёт бота и сразу запускает бэктест

**Кнопки:**
- `🚀 Generate Bot` - создаёт бота с конфигом
- `🧪 Generate & Backtest` - создаёт бота + запускает бэктест (может занять до 10 минут)

### 2. Bot Actions

В таблице ботов доступны действия:
- `▶️` Deploy Bot - запускает бота в Docker контейнере для живой торговли
- `🧪` Run Backtest - запускает бэктест для существующего бота
- `⏰` Schedule Timer - настройка расписания (UI only)
- `📊` View Details - детальный просмотр бота

### 3. Backtest Detail Page

**Путь:** `/strategylab/backtests/:backtestId`

**Отображает:**
- Ключевые метрики (Total Return, Win Rate, Profit Factor, Max Drawdown, Sharpe Ratio)
- Таблица всех трейдов с фильтрацией
- Подробности каждой сделки

## API Endpoints

### Backend (FastAPI)

#### Generate Bot
```http
POST /api/strategylab/alignments/{alignment_id}/generate-bot
Response: { bot_id, config_path, created_at }
```

#### Run Backtest for Bot
```http
POST /api/strategylab/bots/{bot_id}/backtest
Query params: timerange (optional, format: YYYYMMDD-YYYYMMDD)
Response: {
  bot_id,
  strategy,
  status,
  output,
  backtest: { /* metrics */ }
}
Timeout: 600 seconds (10 minutes)
```

#### Generate & Backtest (Alignment)
```http
POST /api/strategylab/alignments/{alignment_id}/backtest
Query params: timerange (optional)
Response: same as above
Process: generates bot if not exists → runs backtest
```

#### List Backtests
```http
GET /api/strategylab/backtests?limit=50&strategy=MyStrategy
Response: {
  backtests: [/* array */],
  total: number,
  path: string
}
```

#### Get Backtest Detail
```http
GET /api/strategylab/backtests/{backtest_id}
Response: {
  id, filename, strategy_name, pair, timeframe,
  total_trades, win_rate, profit_factor, max_drawdown,
  sharpe_ratio, total_return, avg_trade, period,
  wins, losses, draws,
  trades: [/* up to 1000 trades */]
}
```

#### Deploy Bot
```http
POST /api/bots/{bot_id}/deploy
Response: { container_name, status }
```

## Docker Integration

### Backtest Execution

Команда, которую выполняет система:
```bash
docker run --rm \
  --name backtest-{bot_id}-{timestamp} \
  --network trade_system_default \
  -v {config_path}:/freqtrade/config.json:ro \
  -v {user_data_path}:/freqtrade/user_data \
  freqtradeorg/freqtrade:stable \
  backtesting \
  --config /freqtrade/config.json \
  --strategy {strategy_name} \
  --export trades \
  [--timerange YYYYMMDD-YYYYMMDD]
```

### Результаты

Файлы сохраняются в:
```
/freqtrade/user_data/backtest_results/
  ├── backtest-result-2024-12-16_12-30-45.json
  ├── backtest-result-2024-12-16_13-15-22.zip
  └── ...
```

Система автоматически парсит оба формата (JSON и ZIP).

## Workflow Examples

### 1. Quick Backtest

1. Открыть `/strategylab/combinator`
2. Выбрать Strategy
3. Выбрать Model
4. Создать Alignment (если нет)
5. Нажать `🧪 Generate & Backtest`
6. Дождаться завершения (индикатор "⏳ Processing...")
7. Результат появится в таблице "Backtests"
8. Кликнуть 📈 для детального просмотра

### 2. Generate Bot → Test → Deploy

1. Создать Alignment
2. Нажать `🚀 Generate Bot`
3. В таблице ботов нажать `🧪 Run Backtest`
4. Проверить результаты
5. Если результаты хорошие, нажать `▶️ Deploy Bot`

### 3. Manual Timerange Backtest

```bash
curl -X POST "http://localhost:8000/strategylab/bots/{bot_id}/backtest?timerange=20240101-20240630"
```

## Data Structures

### Bot Object
```typescript
interface Bot {
  bot_id: string
  name: string
  config_path: string
  created_at: string
  alignment_id?: string
  status?: string  // 'running' | 'stopped' | undefined
}
```

### Backtest Object
```typescript
interface Backtest {
  id: string
  filename: string
  strategy_name: string
  pair: string
  timeframe: string
  total_trades: number
  win_rate: number
  profit_factor: number
  max_drawdown: number
  sharpe_ratio: number
  total_return: number
  avg_trade: number
  period: string
  backtest_start: string
  backtest_end: string
  created_at: number
  
  // Extended fields
  wins?: number
  losses?: number
  draws?: number
  best_pair?: string
  worst_pair?: string
  avg_duration?: string
  max_drawdown_abs?: number
  trades?: Trade[]  // up to 1000
}
```

### Trade Object
```typescript
interface Trade {
  pair: string
  open_date: string
  close_date: string
  profit_abs: number
  profit_ratio: number
  close_rate: number
  open_rate: number
  amount: number
  trade_duration: number  // in minutes
}
```

## Performance Notes

- **Backtest Timeout:** 10 minutes (600s)
- **Trades Limit:** 1000 сделок в детальном просмотре (для производительности)
- **Parallel Backtests:** Не рекомендуется, может перегрузить систему
- **File Scanning:** Результаты кэшируются по mtime

## Troubleshooting

### Backtest не завершается
- Проверьте доступность данных в `/freqtrade/user_data/data/`
- Убедитесь что указан правильный timerange
- Проверьте логи: `docker logs $(docker ps -qf name=backtest)`

### Нет результатов после бэктеста
- Проверьте права доступа к `/freqtrade/user_data/backtest_results/`
- Убедитесь что стратегия компилируется без ошибок
- Проверьте output в ответе API

### Bot не деплоится
- Проверьте что config_path существует
- Убедитесь что порты не заняты
- Проверьте Docker network: `trade_system_default`

## Future Enhancements

- [ ] WebSocket для real-time прогресса бэктеста
- [ ] Сравнение нескольких бэктестов
- [ ] Экспорт результатов в CSV/Excel
- [ ] График Equity Curve
- [ ] Параллельные бэктесты с очередью
- [ ] A/B тестирование стратегий
- [ ] Auto-optimization после бэктеста
