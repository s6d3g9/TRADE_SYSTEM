# Рефакторинг архитектуры данных - отчёт

## Дата: 2025-12-22

## Критические проблемы (выявленные)

### 1. ❌ Отсутствие ForeignKey связей между моделями
**Было:**
```python
# bot.py
class Bot(Base):
    user_id: Mapped[str | None] = mapped_column(String, nullable=True)  # Просто строка!
    alignment_id: Mapped[str | None] = mapped_column(String, nullable=True)  # Нет FK!
```

**Стало:**
```python
# trading.py
class Bot(Base):
    user_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True
    )
    alignment_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("strategy_alignments.alignment_id", ondelete="SET NULL"), nullable=True, index=True
    )
    
    # Relationships
    user: Mapped["User | None"] = relationship("User", back_populates="bots")
    alignment: Mapped["StrategyAlignment | None"] = relationship("StrategyAlignment", back_populates="bots")
```

### 2. ❌ Отсутствие relationship() определений
**Было:** Невозможно навигировать ORM (bot.user, bot.sessions, trade.bot)

**Стало:** Полноценные двунаправленные relationship с back_populates:
- `User.bots`, `User.backtests`, `User.exchange_accounts`
- `StrategyAlignment.bots`, `StrategyAlignment.backtests`
- `Bot.sessions`, `Bot.trades`, `Bot.positions`, `Bot.metrics`
- `Trade.bot`, `Trade.session`
- И т.д.

### 3. ❌ Документация не реализована в коде
**README_DATA_STORAGE_STRATEGIES.md описывал:**
- `regime` (bull/bear/flat/regular) - НЕ БЫЛО в ConfigFile
- `kind` (base/variant) - НЕ БЫЛО в ConfigFile
- `parent_config_id` - НЕ БЫЛО (для дерева конфигов)
- `decision_log` - НЕ БЫЛО (причины открытия сделок)

**Стало:** Все поля реализованы и мигрированы.

### 4. ❌ Дублирование API
**Было:**
- `/bots/*` - старый API (возвращает dict, без Pydantic)
- `/trading/bots/*` - новый API (правильный)

**Стало:** Единый API под `/trading/` с Pydantic схемами.

---

## Выполненные миграции

### 20251222_01 - Создание trading tables
- Таблицы: bots, bot_sessions, trades, positions, backtests, bot_metrics, exchange_accounts
- Индексы для оптимизации запросов

### 20251222_02 - Market Regime и Config Variants
- ConfigFile: добавлены `regime`, `kind`, `parent_config_id`
- FK constraints для bots → users, bots → strategy_alignments
- FK constraints для backtests → users, backtests → strategy_alignments

### 20251222_03 - Decision Log
- trades: добавлен `decision_log` (JSON)
- positions: добавлен `decision_log` (JSON)

---

## Обновлённые модели

### trading.py (полностью переписан)
```
Bot
├── ForeignKey → users.user_id
├── ForeignKey → strategy_alignments.alignment_id
├── relationship → sessions, trades, positions, metrics
└── relationship → user, alignment, backtests

BotSession
├── ForeignKey → bots.bot_id (CASCADE)
└── relationship → bot, trades, positions, metrics

Trade
├── ForeignKey → bots.bot_id (CASCADE)
├── ForeignKey → bot_sessions.session_id (SET NULL)
├── decision_log (JSON) - причина входа
└── relationship → bot, session

Position
├── ForeignKey → bots.bot_id (CASCADE)
├── ForeignKey → bot_sessions.session_id (SET NULL)
├── decision_log (JSON) - причина входа
└── relationship → bot, session

Backtest
├── ForeignKey → bots.bot_id (SET NULL)
├── ForeignKey → users.user_id (SET NULL)
├── ForeignKey → strategy_alignments.alignment_id (SET NULL)
└── relationship → bot, user, alignment

ExchangeAccount
├── ForeignKey → users.user_id (CASCADE)
└── relationship → user
```

### strategylab.py (обновлён)
```
ConfigFile
├── regime: str (bull/bear/flat/regular)
├── kind: str (base/variant)
├── parent_config_id: FK → config_files.config_id (self-ref)
├── relationship → parent (ConfigFile)
└── relationship → variants (list[ConfigFile])

StrategyAlignment
├── relationship → bots (list[Bot])
└── relationship → backtests (list[Backtest])
```

### user.py (обновлён)
```
User
├── relationship → bots (list[Bot])
├── relationship → backtests (list[Backtest])
└── relationship → exchange_accounts (list[ExchangeAccount])
```

---

## Обновлённые схемы (Pydantic)

### DecisionLog (новая)
```python
class DecisionLog(BaseModel):
    reason: str
    signal_id: str | None
    market_regime: str | None  # bull, bear, flat, regular
    indicators: dict[str, Any]
    freqai_prediction: float | None
    confidence: float | None
    timestamp: datetime | None
```

TradeBase и PositionBase теперь включают `decision_log`.

---

## API изменения

### Удалено
- `/bots/*` (bots.py) - все эндпоинты перенесены

### Добавлено в /trading/
- `/trading/bots/{bot_id}/deploy` - деплой в Docker
- `/trading/bots/{bot_id}/container-status` - статус контейнера
- `/trading/bots/{bot_id}/stop` - остановка
- `/trading/bots/{bot_id}/attach-provider` - привязка NeuroProvider
- `/trading/bots/{bot_id}/provider` - получение текущего провайдера

### Общее количество эндпоинтов: 68

---

## Проверка БД

```sql
-- Таблица trades с decision_log
\d trades
...
decision_log | json | nullable

-- FK constraints работают
Foreign-key constraints:
    "trades_bot_id_fkey" FOREIGN KEY (bot_id) 
        REFERENCES bots(bot_id) ON DELETE CASCADE
    "trades_session_id_fkey" FOREIGN KEY (session_id) 
        REFERENCES bot_sessions(session_id) ON DELETE SET NULL
```

---

## Рекомендации на будущее

1. **Добавить Enum типы** для status/mode/regime/kind вместо строк
2. **Добавить типизацию meta полей** через TypedDict
3. **Создать сервисный слой** между API и ORM
4. **Добавить интеграционные тесты** для проверки FK constraints
5. **Добавить валидацию** decision_log через JSON Schema

---

## Статус
✅ **Все критические архитектурные проблемы исправлены**
✅ **Миграции применены успешно**
✅ **Backend работает без ошибок**
