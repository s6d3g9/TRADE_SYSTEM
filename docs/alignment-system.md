# Alignment System - Automatic Configuration Compatibility

## Overview

Система **Alignment** автоматически анализирует совместимость конфигураций стратегий и AI моделей, предоставляя:
- **Compatibility Score** (0-100) - оценка согласованности параметров
- **Grade** (A/B/C/D/F) - категория качества настройки
- **Issues** - список проблем несовместимости
- **Recommendations** - рекомендации по оптимизации
- **Auto-Optimize** - автоматическая оптимизация конфигурации модели

## Architecture

### Backend API (`/api/alignment/`)

#### `GET /alignment/analyze/{alignment_id}`
Анализирует совместимость стратегии и модели в alignment.

**Response:**
```json
{
  "alignment_id": "abc123",
  "strategy": {
    "id": "strat1",
    "name": "EMA Cross",
    "params": {
      "timeframe": "5m",
      "indicators": ["ema", "rsi"],
      "ema_windows": [21, 55],
      "rsi_windows": [14]
    }
  },
  "model": {
    "id": "model1",
    "name": "LightGBM Basic",
    "params": {
      "train_period_days": 180,
      "feature_parameters": {
        "indicator_list": ["ema", "rsi", "macd"],
        "include_timeperiods": [5, 10, 20]
      },
      "n_estimators": 100,
      "max_depth": 10
    }
  },
  "compatibility": {
    "score": 85.5,
    "grade": "B",
    "issues": [
      "Training period (60 days) is relatively short"
    ],
    "recommendations": [
      "Consider increasing train_period_days to 180+ days"
    ],
    "details": {
      "timeframe_check": {
        "strategy_tf": "5m",
        "status": "ok"
      },
      "indicator_check": {
        "strategy_ema": [21, 55],
        "model_indicators": ["ema", "rsi", "macd"],
        "status": "ok"
      }
    }
  }
}
```

#### `POST /alignment/optimize/{alignment_id}`
Автоматически оптимизирует конфигурацию модели для максимальной совместимости со стратегией.

**Response:**
```json
{
  "alignment_id": "abc123",
  "changes_made": [
    "Added 'ema' to indicator_list",
    "Increased train_period_days from 60 to 180 days",
    "Set n_estimators to 100 (was 50)"
  ],
  "initial_score": 65.0,
  "final_score": 92.0,
  "improvement": 27.0,
  "final_compatibility": { ... }
}
```

## Scoring Algorithm

### 1. Timeframe Compatibility (max -15 pts)
- Проверяет соответствие timeframe стратегии и feature window модели
- Слишком короткий timeframe для большого окна фичей → штраф

### 2. Indicator Alignment (max -30 pts)
- Сравнивает индикаторы стратегии (EMA, RSI, MACD) с feature_list модели
- Отсутствие нужных индикаторов → штраф 10-20 pts

### 3. Data Sufficiency (max -15 pts)
- Проверяет достаточность train_period_days
- < 30 дней → -15 pts (critical)
- < 90 дней → -5 pts (warning)

### 4. Label Period Alignment (max -10 pts)
- Проверяет адекватность label_period_candles относительно timeframe
- Слишком длинный (>24h) или короткий (<1h) → штраф

### 5. Model Complexity (max -10 pts)
- Проверяет n_estimators (< 50 → слишком простая модель)
- Проверяет max_depth (> 15 → риск переобучения)

## Frontend Integration

### CombinatorPageSimple.tsx

**New Column: Alignment Score**
- Отображается между Model selector и Generate button
- Показывает score (0-100) с цветовой индикацией:
  - **Green** (≥75): отличная совместимость
  - **Orange** (50-74): средняя совместимость
  - **Red** (<50): плохая совместимость
- Grade badge (A/B/C/D/F)
- Первые 2 issue в превью
- Кнопка **"⚡ Auto-Optimize"** для автоматической оптимизации

**Workflow:**
1. Пользователь выбирает Strategy и Model
2. При нажатии "Generate" создается Alignment
3. Автоматически запускается анализ compatibility
4. Score отображается в UI
5. Пользователь может нажать Auto-Optimize для улучшения
6. После оптимизации score пересчитывается

## Optimization Logic

### Automatic Changes Applied:

1. **Indicator Synchronization**
   - Добавляет недостающие индикаторы в model.feature_parameters.indicator_list
   - Если стратегия использует EMA → добавляет "ema"
   - Если стратегия использует RSI → добавляет "rsi"
   - Всегда добавляет "macd" как базовый индикатор

2. **Training Period Extension**
   - Если train_period_days < 90 → устанавливает 180

3. **Model Complexity Tuning**
   - Если n_estimators < 50 → устанавливает 100
   - Если max_depth > 15 → устанавливает 10

4. **Label Period Adjustment**
   - Рассчитывает оптимальный label_period для target ~2-4h
   - Формула: `optimal = max(24, min(48, 180 / tf_minutes))`

## Data Sources for Analysis

### Strategy Parameters (extracted from):
- `strategy.meta.timeframe`
- `strategy.meta.indicators`
- `strategy.meta.code` (regex parsing для EMA/RSI windows)

### Model Parameters (extracted from):
- `model.config.freqai.feature_parameters.indicator_list`
- `model.config.freqai.train_period_days`
- `model.config.freqai.model_training_parameters.n_estimators`
- `model.config.freqai.model_training_parameters.max_depth`
- `model.config.freqai.label_parameters.label_period_candles`

### Backtest Results (future integration):
- `win_rate` - процент выигрышных сделок
- `total_return` - общая доходность
- `sharpe_ratio` - риск-adjusted return
- `max_drawdown` - максимальная просадка

## Future Enhancements

### Phase 2: Backtest Correlation
- Связывать параметры с результатами бэктестов
- Находить оптимальные комбинации параметров для конкретных рынков
- Machine Learning для предсказания performance

### Phase 3: Market Adaptation
- Анализировать текущую волатильность рынка
- Рекомендовать параметры под текущие условия
- Автоматическая адаптация к трендовым/флэтовым рынкам

### Phase 4: Multi-Alignment Comparison
- Сравнивать несколько alignments
- Ранжировать по compatibility score
- A/B testing разных конфигураций

## Usage Example

```typescript
// 1. Create alignment
const alignment = await createStrategyAlignment({
  strategy_id: "nostalgiaforinfinityx6",
  model_id: "lightgbm-basic",
  profile: "default"
})

// 2. Analyze compatibility
const analysis = await fetch(`/api/alignment/analyze/${alignment.alignment_id}`)
const score = await analysis.json()

console.log(`Score: ${score.compatibility.score}/100`)
console.log(`Grade: ${score.compatibility.grade}`)
console.log(`Issues: ${score.compatibility.issues.length}`)

// 3. Auto-optimize if needed
if (score.compatibility.score < 75) {
  const optimized = await fetch(`/api/alignment/optimize/${alignment.alignment_id}`, {
    method: 'POST'
  })
  const result = await optimized.json()
  console.log(`Improvement: +${result.improvement} points`)
}
```

## Testing

### Unit Tests (TODO)
```bash
pytest backend/tests/test_alignment.py -v
```

### Integration Tests
1. Create strategy with known parameters (5m timeframe, EMA indicators)
2. Create model with incomplete config (no indicators)
3. Analyze alignment → expect low score + indicator issues
4. Optimize alignment → expect indicator_list added + improved score
5. Verify changes persisted in database

### Manual Testing
1. Open CombinatorPageSimple
2. Select strategy "nostalgiaforinfinityx6"
3. Select model "LightGBM Basic"
4. Click "Generate" → observe alignment score
5. If score < 90, click "Auto-Optimize"
6. Verify score improved

## Performance Considerations

- Analysis is **synchronous** (fast, <100ms)
- No external API calls required
- All calculations in-memory
- Optimization modifies only model.config (no strategy changes)
- Database write only on optimize (single UPDATE query)

## Security

- Both endpoints require authentication (if enabled)
- Alignment must exist and belong to user
- Optimization cannot modify strategy (only model config)
- All parameter validation via Pydantic schemas

## Monitoring

- Log score distribution (histogram)
- Track optimization success rate
- Monitor common issues (e.g., "short training period" frequency)
- Alert if score consistently low across all alignments
