# Terminal 2 Page - Complete Redesign

## Что исправлено

### ❌ Было (старая версия)
- Простая таблица с бектестами
- Данные подгружались непонятно откуда
- Структура не соответствовала реальным данным Freqtrade
- Нет визуализации точек входа/выхода
- Нет связи с ботами из БД
- Плохой UX - просто таблица без графика

### ✅ Стало (новая версия)
- **Правильная загрузка данных**:
  - Боты из БД через `/api/bots`
  - Бектесты из Freqtrade через `/api/strategylab/backtests`
  - Детали бектеста с полным JSON через `/api/strategylab/backtests/{id}`

- **Визуализация на графике**:
  - График со свечами (candlestick chart)
  - Точки входа/выхода (entry/exit) из трейдов бектеста
  - Индикаторы: EMA(8/21), MACD, RSI
  - Цветовая кодировка: buy (зеленый), sell (красный)

- **Две вкладки**:
  - **Backtests**: список результатов бектестов
  - **Bots**: список ботов из БД

- **Полная информация**:
  - Статистика: стратегия, пара, таймфрейм, кол-во трейдов
  - Метрики: Win Rate, Total Return, Profit Factor, Sharpe Ratio
  - Таблица всех трейдов с деталями
  - Визуализация на графике

## Архитектура данных

### 1. Боты (из БД)
```typescript
interface Bot {
  bot_id: string
  name: string
  config_path: string
  created_at: string
}
```

**Источник**: `/api/bots`  
**Хранится**: Postgres, таблица `bots`

### 2. Бектесты (из Freqtrade)
```typescript
interface BacktestResult {
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
  backtest_start?: string
  backtest_end?: string
  created_at: number
}
```

**Источник**: `/api/strategylab/backtests`  
**Хранится**: `/freqtrade/user_data/backtest_results/*.json`

### 3. Детали бектеста (полный JSON)
```typescript
interface BacktestData {
  strategy: Record<string, unknown>
  results_per_pair: Array<{ key: string; trades: number }>
  trades: Trade[]
}

interface Trade {
  open_date: string        // "2024-01-01 12:00:00"
  close_date: string       // "2024-01-01 14:00:00"
  pair: string            // "BTC/USDT"
  open_rate: number       // 42000.50
  close_rate: number      // 42500.30
  profit_abs: number      // 499.80
  profit_ratio: number    // 0.0119 (1.19%)
  is_short: boolean       // false = long, true = short
  enter_tag?: string      // "buy_signal_1"
  exit_reason?: string    // "roi" | "stop_loss" | "exit_signal"
}
```

**Источник**: `/api/strategylab/backtests/{id}`  
**Используется для**: визуализации точек входа/выхода на графике

## Визуализация точек входа/выхода

### Алгоритм отображения
1. **Загружаем свечи** для периода бектеста через `/api/market/candles`
2. **Извлекаем трейды** из `BacktestData.trades`
3. **Находим индексы свечей** для каждого `open_date` и `close_date`
4. **Создаем массив сигналов**:
   ```typescript
   {
     idx: number,           // Индекс свечи
     side: 'buy' | 'sell',  // Long entry = buy, Long exit = sell
     reason: string,        // enter_tag или exit_reason
     time: number           // timestamp для сортировки
   }
   ```
5. **Передаем в CandleChart** как `indicators.signals`
6. **Отображаем маркеры** на графике в соответствующих точках

### Цветовая кодировка
- **Buy signal** (вход в long): 🟢 зеленый круг с буквой "B"
- **Sell signal** (выход из long): 🔴 красный круг с буквой "S"
- **Short entry**: 🔴 красный (инвертировано)
- **Short exit**: 🟢 зеленый (инвертировано)

## UI/UX улучшения

### Левая панель (280px)
- **Tabs**: переключение между Backtests / Bots
- **Список**: скроллируемый список элементов
- **Карточки**: кликабельные с превью информации
- **Подсветка**: выбранный элемент подсвечен primary цветом
- **Метрики**: краткие метрики прямо в карточке (Total Return для бектестов)

### Правая панель (flex)
- **График всегда виден** ⭐ (главное изменение!)
- **Контролы**: выбор пары/таймфрейма + чекбоксы для индикаторов (EMA/MACD/RSI)
- **Режимы работы**:
  - **Без выбора**: живой график выбранной пары (BTC/USDT по умолчанию)
  - **Выбран бектест**: график с точками входа/выхода из бектеста
  - **Выбран бот**: график с конфигурацией бота (будущий функционал)
- **Автообновление**: живой график обновляется каждые 30 секунд
- **Статистика**: сетка с основными метриками (только при выборе бектеста)
- **Таблица трейдов**: детальная таблица всех трейдов (только при выборе бектеста)

### Кнопки и контролы
- **Tab buttons**: стилизованные кнопки с border подсветкой
- **Indicator toggles**: checkbox labels для быстрого переключения
- **Clickable cards**: плавные transitions при наведении/клике
- **Responsive**: адаптивная сетка для разных разрешений

## Структура компонентов

```
Terminal2Page.tsx (main component)
├── PageHeader (title + description)
├── Left Sidebar (280px fixed)
│   ├── Tab Selector (Backtests / Bots)
│   └── List Card
│       ├── Loading state
│       ├── Error state
│       ├── Empty state
│       └── Items list (scrollable)
│
└── Right Content (flex)
    ├── Chart Controls Card
    │   └── Indicator toggles + signal count
    ├── Stats Card (when backtest selected)
    │   └── Grid with metrics
    ├── Chart Card
    │   ├── Empty state (no selection)
    │   ├── Loading state
    │   └── CandleChart component
    │       ├── Candlesticks
    │       ├── EMA lines
    │       ├── MACD chart
    │       ├── RSI chart
    │       └── Entry/Exit markers ✅
    │
    └── Trades Table Card (when trades available)
        └── Scrollable table with all trades
```

## Технические детали

### State Management
- `bots` - список ботов из БД
- `backtests` - список бектестов из Freqtrade
- `selectedBot` - выбранный бот (для будущего функционала)
- `selectedBacktest` - выбранный бектест
- `backtestData` - полный JSON бектеста с трейдами
- `candles` - массив свечей для графика (всегда загружен)
- `pair` - текущая торговая пара (BTC/USDT по умолчанию)
- `timeframe` - текущий таймфрейм (1h по умолчанию)
- `tradeSignals` - вычисленные точки входа/выхода (только для бектестов)

### Computed Values
- `tradeSignals` - useMemo: генерируются из `backtestData.trades` и `candles`
- `indicators` - useMemo: EMA, MACD, RSI + signals
- `statsDisplay` - useMemo: форматированная статистика

### Effects
1. **Initial load**: загружает bots + backtests при монтировании
2. **Default chart**: загружает живой график выбранной пары (обновляется каждые 30 сек)
3. **Backtest detail**: при выборе бектеста загружает полный JSON + candles периода бектеста
4. **Cleanup**: отменяет pending запросы и intervals при unmount

### Логика работы графика
- **По умолчанию**: показывает живой график BTC/USDT 1h (500 свечей)
- **При выборе бектеста**: 
  - Загружает свечи для периода бектеста
  - Отображает точки входа/выхода
  - Блокирует выбор пары/таймфрейма (используются из бектеста)
- **При выборе бота**: показывает живой график с конфигурацией бота
- **Автообновление**: только в режиме "без выбора" (каждые 30 сек)

## API Endpoints

### Используемые эндпоинты
```
GET /api/bots
└── Возвращает: Bot[]

GET /api/strategylab/backtests?limit=100
└── Возвращает: { backtests: BacktestResult[], total: number }

GET /api/strategylab/backtests/{id}
└── Возвращает: { id: string, filename: string, data: BacktestData }

GET /api/market/candles?exchange={ex}&pair={pair}&timeframe={tf}&limit={limit}
└── Возвращает: { candles: Candle[] }
```

### Требования к backend
- ✅ Эндпоинт `/api/bots` существует
- ✅ Эндпоинт `/api/strategylab/backtests` существует
- ✅ Эндпоинт `/api/strategylab/backtests/{id}` существует
- ✅ Эндпоинт `/api/market/candles` существует
- ✅ Структура данных соответствует Freqtrade JSON format

## Дальнейшие улучшения

### Возможные расширения
1. **Bot details**: при клике на бота показывать его config и статистику
2. **Backtest comparison**: сравнение нескольких бектестов на одном графике
3. **Trade filtering**: фильтрация трейдов по enter_tag/exit_reason
4. **Export**: экспорт статистики в CSV/JSON
5. **Time filtering**: выбор конкретного периода на графике
6. **Zoom & Pan**: интерактивное масштабирование графика
7. **Regime indicators**: показ bull/bear/flat режимов на графике
8. **Strategy comparison**: overlay нескольких стратегий

### Performance оптимизации
- Virtualized list для больших списков бектестов/ботов
- Lazy loading для trades table
- Chart мемоизация для избежания ререндеров
- WebWorker для вычисления индикаторов

## Миграция

### Как откатить к старой версии
```bash
cd /workspaces/TRADE_SYSTEM/frontend/src/pages/Charts
mv Terminal2Page.tsx Terminal2Page.new.tsx
mv Terminal2Page.old.tsx Terminal2Page.tsx
npm run build
```

### Файлы
- **Новая версия**: `Terminal2Page.tsx` (текущая)
- **Старая версия**: `Terminal2Page.old.tsx` (backup)
- **Размер**: 
  - Старая: 108 строк
  - Новая: 558 строк (+450 строк, +416% больше функционала)

## Результат

✅ **Правильная загрузка данных** из Freqtrade и БД  
✅ **Визуализация точек входа/выхода** на графике  
✅ **Интуитивный UI** с tabs и cards  
✅ **Полная статистика** по каждому бектесту  
✅ **Таблица трейдов** с деталями  
✅ **Индикаторы** (EMA, MACD, RSI) с toggles  
✅ **Responsive** дизайн  
✅ **TypeScript** типизация  
✅ **Build** проходит без ошибок  

Страница готова к использованию: http://localhost:8090/charts/terminal2
