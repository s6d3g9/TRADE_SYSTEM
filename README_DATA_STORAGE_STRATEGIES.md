# 4. Хранение и структура данных: стратегии/модели/сонастройки (пересобрано)

Цель этого документа — описать хранение данных **так, как ты сформулировал**:

- есть “модуль стратегий” (пример: NostalgiaForInfinity) и он живёт в git-репозитории;
- у стратегий и у моделей есть **базовые конфиги** и их **вариации** (редакции);
- на рынке есть режимы **растущий / падающий / флэт**, под которые могут существовать разные базовые профили;
- есть отдельный слой **сонастройки** (связи параметров между конфигами стратегии и модели);
- есть “файл промптов” для ИИ-агентов;
- есть временное хранилище ответов ИИ, которые применяются к конфигам;
- есть реестр/список ботов, которые получаются из сонастройки и запуска конфигов.

Ниже — логическое дерево и разбиение на сущности.

---

## 4.1. Термины

- **Стратегия (Strategy module / папка)**: “семейство” стратегий, привязанное к git-репозиторию (например NostalgiaForInfinity).
- **Базовый конфиг**: стартовая точка настроек для стратегии/модели под определённый режим рынка.
- **Вариация конфига**: редакция базового конфига (тюнинг, правки, A/B варианты).
- **Режим рынка (Market regime)**: `bull` (растущий), `bear` (падающий), `flat` (флэт), `regular` (усреднённая).
  Важно: режим — это **свойство конфига/сонастройки**, а не отдельная физическая папка/таблица.
- **Сонастройка (Alignment)**: правила согласования параметров стратегии и модели (если изменили X в модели — меняем Y в стратегии).
- **Бот**: “запускаемый артефакт” (финальный config.json + метаданные), полученный из сонастройки.

---

## 4.2. Дерево данных (целевая логика)

### 4.2.1. Стратегия (папка) → базовые конфиги → вариации (режим как свойство)

```
StrategyModule
├─ Repo (git)
│  ├─ url
│  ├─ ref
│  └─ strategy sources (.py)
│
└─ StrategyConfigs (в одном месте)
  ├─ base.json      (kind=base,   regime=regular)
  ├─ base-bull.json (kind=base,   regime=bull)
  ├─ base-bear.json (kind=base,   regime=bear)
  ├─ base-flat.json (kind=base,   regime=flat)
  ├─ v1.json        (kind=variant, regime=bull,    parent=base-bull.json)
  ├─ v2.json        (kind=variant, regime=bull,    parent=base-bull.json)
  ├─ v1-bear.json   (kind=variant, regime=bear,    parent=base-bear.json)
  └─ ...
```

Смысл:
- “папка стратегии” определяет источник кода и идентичность (что это за стратегия).
- режим рынка — это **атрибут конфига**, по которому мы фильтруем/группируем, но физически все конфиги лежат “вместе”.
- “base → variants” — это дерево по `parent`.

### 4.2.2. Модель → базовые конфиги → вариации (режим как свойство)

```
Model
└─ ModelConfigs (в одном месте)
  ├─ base.json      (kind=base,   regime=regular)
  ├─ base-bull.json (kind=base,   regime=bull)
  ├─ base-bear.json (kind=base,   regime=bear)
  ├─ base-flat.json (kind=base,   regime=flat)
  ├─ v1.json        (kind=variant, regime=bull, parent=base-bull.json)
  └─ ...
```

### 4.2.3. Сонастройка (стратегия+модель) → связи параметров → сборка бота

```
Alignment (StrategyModule + Model)
├─ Regime (bull|bear|flat|regular)
│
├─ ParamLinks (rules)
│  ├─ if Model.freqai.training.window_days changes
│  │    -> Strategy.freqtrade.timeframe / protections adjust
│  └─ ... (мэппинг параметров)
│
├─ AI Prompts
│  ├─ prompt_strategy_autotune
│  ├─ prompt_model_autotune
│  └─ prompt_alignment_combine
│
├─ AI Responses (temporary)
│  ├─ raw response
│  ├─ parsed json
│  ├─ diff/patch proposal
│  └─ status (accepted/rejected/applied)
│
└─ Bot(s)
   ├─ bot config.json (final)
   └─ bot registry entry
```

Ключевая идея: alignment — это **не просто “ещё один конфиг”**, а:
- выбранный режим рынка,
- набор правил согласования параметров,
- плюс (опционально) работа ИИ, который предлагает правки,
- результатом является один или несколько “ботов” (готовых конфигов к запуску).

---

## 4.3. Где это хранить физически (с учётом текущего проекта)

### 4.3.1. Что уже есть сейчас в коде

Сейчас в проекте ближайший эквивалент твоей схемы выглядит так:

- StrategyModule ≈ `StrategyTemplate` (БД)
  - хранит repo url/ref и метаданные
- BaseConfigs/Variations ≈ `ConfigFile(scope=strategy)` и `ConfigFile(scope=model)` (БД)
  - версии уже поддерживаются через `created_at/updated_at` и `is_active`
- Alignment ≈ `StrategyAlignment` (БД)
  - есть поля `profile/scope/defaults/mapping` + overrides
- Bot registry ≈ `Bot` (БД) + config на диске

То, чего **явно не хватает** для твоей логики:
- явное поле/сущность **MarketRegime** (bull/bear/flat/regular) привязанное к конфигам/алайнментам;
- явная сущность/формат **ParamLinks** (правила связей параметров);
- явная сущность **AI Prompts** (файл/таблица с промптами);
- явная сущность **AI Responses (temporary)** (таблица или файлы с историей ответов).

### 4.3.2. Как представить “базовый конфиг” и “вариацию” в БД

Минимальная модель без усложнений:

- В `ConfigFile.content` хранить JSON.
- В `ConfigFile.name` и/или `ConfigFile.content.meta` хранить:
  - `regime`: bull|bear|flat|regular
  - `kind`: base|variant
  - `parent_config_id`: ссылка на base (если это вариация)

Это позволит построить дерево “base → variants”, не ломая существующую таблицу.

---

## 4.4. Рекомендуемое дерево “в данных” (как мы будем мыслить в UI/API)

Ниже дерево, которое можно прямо использовать как “ментальную модель” при разработке.

```
StrategyModule (NostalgiaForInfinity)
├─ Repo
└─ StrategyConfigs (единый список)
  ├─ base (regime=regular)
  ├─ base (regime=bull)
  ├─ base (regime=bear)
  ├─ base (regime=flat)
  └─ variants... (каждый variant с regime + parent)

Model (например xgboost-default)
└─ ModelConfigs (единый список)
  ├─ base (regime=regular)
  ├─ base (regime=bull)
  ├─ base (regime=bear)
  ├─ base (regime=flat)
  └─ variants...

Alignment (StrategyModule + Model + Regime)
├─ ParamLinks (правила)
├─ AI Prompts
├─ AI Responses (temporary)
└─ Bot(s)
```

---

## 4.5. Что за чем следует (логический порядок)

1) Подключаем стратегию как модуль (repo)
2) Выбираем режим рынка (bull/bear/flat/regular)
3) Выбираем базовый конфиг стратегии под этот режим
4) (опционально) создаём вариацию и правим её
5) Выбираем модель
6) Выбираем базовый конфиг модели под этот режим
7) (опционально) создаём вариацию и правим её
8) Создаём/настраиваем сонастройку (ParamLinks + overrides)
9) (опционально) запускаем ИИ:
   - ИИ генерит предложения (AI Responses temporary)
   - пользователь принимает/отклоняет
   - применяем патчи к вариациям конфигов
10) Собираем финальный bot config и регистрируем бота

---

## 4.6. Следующий шаг (что нужно поменять в реализации, чтобы это стало “как ты описал”)

Чтобы текущая реализация соответствовала твоей схеме 1:1, потребуется ввести явные сущности/атрибуты:

- `MarketRegime` (или хотя бы поле regime) в конфиги и/или alignment
- `ConfigKind` (base/variant) + `parent_config_id` для дерева вариаций
- `ParamLinks` как отдельный документ/таблица (правила синхронизации параметров)
- `AI Prompts` как файл/таблица (версионирование промптов)
- `AI Responses` как таблица/файлы (кэш/история ответов)

Этот документ фиксирует требуемую структуру. Реализацию можно делать по шагам, начиная с режима рынка + base/variant.

---

## 4.7. Хранение бэктестов (Backtests)

### 4.7.1. Как это обычно устроено

Бэктест — это **артефакт запуска** (как правило большой JSON/zip), который логически относится к:
- стратегии (или конкретной версии стратегии)
- конфигу (какой именно `config.json` использовали)
- датасету/парам (пары, таймфреймы, период)

Т.е. для корректной воспроизводимости важно хранить **ссылку на конфиг** и **параметры запуска**.

### 4.7.2. Где хранить

Рекомендуемая (DB-first) схема:

- **Postgres**:
  - метаданные бэктеста (id, время, стратегия, конфиг, период, пары, метрики)
  - ссылки на артефакты (путь к файлу/объектному хранилищу)
- **Файлы (артефакты)**:
  - сырые результаты freqtrade (JSON) и/или упакованные артефакты

Почему так:
- в БД удобно фильтровать/сравнивать бэктесты,
- файлы лучше держать как “тяжёлые” артефакты.

### 4.7.3. Как сейчас в проекте

Сейчас backend читает результаты из папки Freqtrade user_data:
- `/freqtrade/user_data/backtest_results/*.json`
- API: `GET /strategylab/backtests`

Это ок как первый шаг, но это **filesystem-first**. Чтобы прийти к DB-first, можно сделать импорт:
- после каждого бэктеста сохранять в БД метаданные,
- а путь к json держать как artifact reference.

### 4.7.4. Логическое дерево бэктестов

```
Backtest
├─ strategy_module / strategy_class
├─ regime (bull|bear|flat|regular) (опционально)
├─ config_ref
│  ├─ strategy_config_id? (base/variant)
│  ├─ model_config_id? (base/variant)
│  └─ alignment_config_id (обычно финальный)
├─ dataset_ref
│  ├─ timeframe
│  ├─ pairlist / whitelist
│  └─ date range
├─ metrics
│  ├─ win_rate, profit_factor, sharpe, drawdown...
│  └─ trades count
└─ artifact
   └─ path to backtest_results JSON
```

### 4.7.5. Метрики бэктеста (что считать и хранить)

Ниже — **реальная структура статистики Freqtrade backtesting** (как в отчёте/экспорте результатов). Это удобно хранить так же: в БД — метаданные + основные поля, а полный JSON/zip-артефакт оставить как файл.

#### A) Таблицы отчёта (то, что Freqtrade печатает как tables)

1) **BACKTESTING REPORT** (по парам + строка `TOTAL`) и **LEFT OPEN TRADES REPORT** (форс-выходы в конце)
- Колонки: `Pair`, `Trades`, `Avg Profit %`, `Tot Profit <STAKE>`, `Tot Profit %`, `Avg Duration`, `Win`, `Draw`, `Loss`, `Win%`.

2) **ENTER TAG STATS**
- Колонки: `Enter Tag`, `Entries`, `Avg Profit %`, `Tot Profit <STAKE>`, `Tot Profit %`, `Avg Duration`, `Win`, `Draw`, `Loss`, `Win%`.

3) **EXIT REASON STATS**
- Колонки: `Exit Reason`, `Exits`, `Avg Profit %`, `Tot Profit <STAKE>`, `Tot Profit %`, `Avg Duration`, `Win`, `Draw`, `Loss`, `Win%`.

4) **MIXED TAG STATS** (Enter Tag + Exit Reason)
- Колонки: `Enter Tag`, `Exit Reason`, `Trades`, `Avg Profit %`, `Tot Profit <STAKE>`, `Tot Profit %`, `Avg Duration`, `Win`, `Draw`, `Loss`, `Win%`.

5) **STRATEGY SUMMARY** (когда сравниваем несколько стратегий)
- Колонки: `Strategy`, `Trades`, `Avg Profit %`, `Tot Profit <STAKE>`, `Tot Profit %`, `Avg Duration`, `Win`, `Draw`, `Loss`, `Win%`, `Drawdown`.

6) **BREAKDOWN** (если включать `--breakdown day/week/month/year/weekday`)
- Колонки: период (`Day/Week/Month/Year/Weekday`), `Trades`, `Tot Profit <STAKE>`, `Profit Factor`, `Win`, `Draw`, `Loss`, `Win%`.

#### B) Summary metrics (то, что Freqtrade печатает как “SUMMARY METRICS”)

Рекомендуемый формат хранения: `metrics.summary` (JSON) + несколько полей продублировать в отдельных колонках для фильтрации.

- `backtesting_from`, `backtesting_to`
- `trading_mode`
- `max_open_trades`
- `total_daily_avg_trades` (в отчёте показывается как `Total/Daily Avg Trades`)
- `starting_balance`
- `final_balance`
- `absolute_profit`
- `total_profit_pct`
- `cagr_pct`
- `sortino`
- `sharpe`
- `calmar`
- `sqn`
- `profit_factor`
- `expectancy_ratio` и `expectancy` (в отчёте показывается как `Expectancy (Ratio)` — 2 значения)
- `avg_daily_profit`
- `avg_stake_amount`
- `total_trade_volume`

Дополнительно (появляется в отчёте при наличии соответствующих данных):
- `long_short_trades` (например `67 / 10`)
- `long_short_profit_pct`
- `long_short_profit_abs` (в валюте стейка)

Экстремумы/лучшее-худшее:
- `best_pair`, `worst_pair`
- `best_trade`, `worst_trade`
- `best_day`, `worst_day`
- `days_win_draw_lose`

Длительности:
- `duration_winners_min_max_avg`
- `duration_losers_min_max_avg`

Серии и ограничения исполнения:
- `max_consecutive_wins_loss`
- `rejected_entry_signals`
- `entry_exit_timeouts`

Баланс и просадки:
- `min_balance`, `max_balance`
- `max_pct_of_account_underwater`
- `absolute_drawdown_abs` и `absolute_drawdown_pct` (в отчёте выводится как `Absolute drawdown`)
- `drawdown_duration`
- `profit_at_drawdown_start`, `profit_at_drawdown_end`
- `drawdown_start`, `drawdown_end`

Рынок:
- `market_change`

Практичный минимум (если нужен быстрый индекс/сортировка): `total_profit_pct`, `profit_factor`, `sharpe`, `max_pct_of_account_underwater` (или `absolute_drawdown_pct`), `total_daily_avg_trades`, `total_trade_volume`.

---

## 4.8. Хранение данных о торговле (Live/Sim trading)

Чтобы понимать “как торговали” и делать аналитику, надо хранить минимум 4 слоя данных:

1) **Рынок**: свечи/тикеры/стакан (market data)
2) **Сигналы стратегии**: enter/exit, значения индикаторов (signal data)
3) **Исполнение**: ордера и сделки на бирже (execution data)
4) **Состояние бота**: какая стратегия/конфиг активны, режим, риски (runtime state)

### 4.8.1. Где хранить

- **Postgres** (долговременно):
  - свечи (если нужно и если объём приемлем) или агрегаты
  - сделки (trades), ордера (orders), позиции
  - сигналы и значения индикаторов (по необходимости)
  - привязка “сделка → конфиг/бот/стратегия/режим”

- **Redis** (операционно):
  - текущие состояния (последние цены, health, краткие статусы)
  - очереди событий

### 4.8.2. Минимальная модель данных (логическая)

```
BotRun
├─ bot_id
├─ started_at / ended_at
├─ config_path or config_id (лучше config_id)
├─ regime
└─ exchange

Order
├─ bot_run_id
├─ exchange_order_id
├─ pair, side, type, price, amount
├─ status + timestamps
└─ raw payload (опционально)

Trade
├─ bot_run_id
├─ order refs
├─ entry/exit price, amount, fees
├─ pnl
└─ timestamps
```

Важное: “торговые данные” должны ссылаться на **какой именно config/variant был активен**, иначе потом нельзя объяснить результат.

### 4.8.3. Метрики реальной торговли (что считать и хранить)

Для реальных сделок метрики делятся на 3 класса: **результат**, **риск**, **качество исполнения**.

**A) PnL и результативность (realized/unrealized)**
- `realized_pnl_abs`, `realized_pnl_pct`: реализованный PnL.
- `unrealized_pnl_abs`, `unrealized_pnl_pct`: нереализованный PnL на открытых позициях.
- `equity_curve`: кривая капитала (можно агрегировать/сэмплировать).
- `fees_paid_abs`: комиссии.
- `funding_paid_abs` (если деривативы): funding.
- `net_pnl_abs`: PnL после комиссий/фандинга.

**B) Риск и просадки (live)**
- `max_drawdown_pct`, `max_drawdown_abs` по реальной equity.
- `var` / `cvar` (если внедрим): оценка хвостового риска.
- `exposure_time_pct`: доля времени в позиции.
- `leverage_avg`, `leverage_max` (если применимо).

**C) Эффективность системы сделок (как в бэктесте, но на live)**
- `total_trades`, `wins`, `losses`, `win_rate`.
- `profit_factor`, `expectancy`, `avg_win`, `avg_loss`, `payoff_ratio`.
- `best_trade`, `worst_trade`, `avg_trade_duration`.

**D) Качество исполнения (execution quality)**
- `slippage_abs/pct`: отклонение цены исполнения от ожидаемой (mid/limit price/last).
- `fill_rate`: доля полностью исполненных ордеров.
- `partial_fill_count`: число частичных исполнений.
- `reject_rate`: доля отклонённых ордеров.
- `latency_ms`: задержка от сигнала до выставления/исполнения (если логируем).
- `order_to_trade_ratio`: сколько ордеров на одну завершённую сделку.

**E) Стабильность по времени и режимам**
- метрики по режиму рынка: `metrics_by_regime.{bull|bear|flat|regular}`.
- метрики по парам: `metrics_by_pair`.
- метрики по таймфрейму (если несколько): `metrics_by_timeframe`.

**F) Метрики "причин входа" (DecisionLog analytics)**
- `reasons_frequency`: частота причин (топ причин входа/выхода).
- `reason_win_rate`: win_rate по каждой причине/комбинации причин.
- `reason_expectancy`: expectancy по причине.
- `model_confidence_buckets`: результативность по бинам уверенности.

Минимум для старта live (чтобы было не пусто): net PnL, win_rate, profit_factor, max_drawdown, fees, slippage.

### 4.8.4. Отчёт по открытым сделкам (аналог Freqtrade `status` / `status table`)

Ниже — **структура того, как Freqtrade показывает открытые сделки** (и что удобно воспроизвести в нашем UI/API).

#### A) Табличный список (аналог `/status table`)

В Freqtrade `/status table` показывает открытые сделки в виде таблицы:

- Колонки: `ID`, `L/S`, `Pair`, `Since`, `Profit`.

Это минимальный “overview” по всем открытым позициям.

#### B) Детали одной сделки (аналог `/status`)

В Freqtrade `/status` для каждой открытой сделки включает следующие поля:

- `Trade ID` + возраст сделки (например “since 1 days ago”)
- `Current Pair`
- `Direction` (Long/Short)
- `Leverage`
- `Amount`
- `Enter Tag`
- `Open Rate`
- `Current Rate`
- `Unrealized Profit`
- `Stoploss` (абсолют + процент в скобках)

#### C) Как хранить/отдавать в нашей системе

Чтобы “отчёт по открытым сделкам” был воспроизводимым и пригодным для истории, удобный минимум:

- `open_trades_table`: снимок массива строк с колонками ровно как в `/status table`.
- `open_trade_details`: детализация для каждой сделки с полями ровно как в `/status`.

Источник данных (в терминах Freqtrade): список открытых сделок доступен через REST API (`GET /status`) и/или telegram-команды `/status` и `/status table`.

---

## 4.9. Причины входа в сделку (Why did we enter?)

Твоя потребность “причины входа” означает, что нам нужен слой **Decision Log**.

### 4.9.1. Что именно хранить

Минимально (без перегруза):
- момент времени
- пара/таймфрейм
- решение: enter/exit/hold
- причина(ы) в виде списка “флагов”
- значения ключевых индикаторов/фич
- ссылка на стратегию/версию конфига/бота

### 4.9.2. Пример структуры Decision Log (логическая)

```
DecisionLog
├─ bot_run_id
├─ ts
├─ pair
├─ decision: ENTER | EXIT | HOLD
├─ reasons: ["rsi_oversold", "trend_up", "model_confidence>0.7"]
├─ features_snapshot: { rsi: 23.1, ema_fast: ..., prediction: ... }
├─ config_refs
│  ├─ strategy_config_id
│  ├─ model_config_id
│  └─ alignment_config_id
└─ extra
   ├─ raw strategy debug
   └─ raw model debug
```

### 4.9.3. Почему это важно хранить в БД

- можно отвечать на вопросы “почему бот вошёл здесь?”
- можно обучать/валидировать модели
- можно строить отчёты по режимам рынка

---

## 4.10. Резюме: DB-first + артефакты

Рекомендуемая стратегия хранения:
- **БД**: всё, что является “истиной” и должно быть сравнимо/версионируемо (конфиги, варианты, режимы, сонастройки, решения, сделки, метаданные бэктестов)
- **Redis**: всё, что временно/операционно (очереди, статусы)
- **Файлы**: только артефакты запуска (config.json для freqtrade, backtest json/zip)

---

## 4.11. Магазин стратегий и моделей (Marketplace)

Цель модуля “Store” — дать пользователю **галерею** стратегий и моделей, которые можно “купить”, а при клике открыть **страницу товара** с:
- статистикой бэктестов (как в отчётах Freqtrade),
- списком/количеством купивших пользователей.

Важно: Store не хранит исходный код стратегий “внутри БД”. Мы остаёмся в парадигме:
- **DB-first** для каталога/покупок/метаданных,
- **артефакты на диске** (или в объектном хранилище) для тяжёлых результатов бэктестов.

### 4.11.1. Термины

- **StoreItem (товар)**: карточка в магазине. Тип: `strategy` или `model`.
- **Listing (листинг)**: публикация/активация товара в магазине (в MVP это просто флаг `is_active`).
- **Purchase (покупка)**: связь `user ↔ store_item` с датой.
- **Backtest stats (статистика бэктестов)**: агрегированные метрики и список последних бэктестов.

### 4.11.2. Логическая модель (как будем мыслить в UI/API)

```
Store
├─ StoreItems
│  ├─ StrategyItem -> StrategyTemplate (StrategyLab catalog)
│  └─ ModelItem    -> FreqAIModelVariant (StrategyLab catalog)
│
└─ Purchases
  └─ user_id + item_id (+ timestamps)

StoreItem Detail Page
├─ Item metadata (name, description, tags)
├─ Backtest stats
│  ├─ latest_backtests[] (табличный список)
│  └─ optional aggregates (avg total_return, avg sharpe, etc.)
└─ Buyers
  ├─ purchaser_count
  └─ purchasers[] (минимально: user_id + имя/email + когда купил)
```

### 4.11.3. Где это хранить физически (DB-first + артефакты)

**Postgres (истина):**
- `store_items`: карточки магазина.
  - `item_type`: `strategy|model`
  - `strategy_id` или `model_id`: ссылка на соответствующую сущность StrategyLab-каталога (`StrategyTemplate` / `FreqAIModelVariant`).
  - `slug/name/description/tags/meta`.
  - `is_active`.

- `store_purchases`: покупки.
  - `item_id`, `user_id`, `created_at`
  - уникальность `(item_id, user_id)` чтобы “повторная покупка” была идемпотентной.

**Файлы (артефакты):**
- сырые результаты бэктестов Freqtrade (`backtest_results/*.json|*.zip`) остаются артефактами запуска.

**Как связать StoreItem ↔ Backtests:**
- В MVP: связываем “по имени стратегии” (например `StrategyTemplate.strategy_class`/`name`) и подтягиваем последние результаты из артефактов.
- В целевом варианте DB-first: после каждого бэктеста делаем импорт метаданных в таблицу `backtests` и связываем `backtest.strategy_id` / `model_id` с каталогом/StoreItem.

### 4.11.4. Минимальный поток действий

1) Пользователь открывает `/store` и видит галерею карточек `StoreItems`.
2) Клик по карточке → `/store/items/{id}`.
3) На детальной странице:
  - показываем метаданные,
  - показываем список последних бэктестов (если есть),
  - показываем `purchaser_count` и список купивших,
  - кнопка “Buy” создаёт запись в `store_purchases`.

