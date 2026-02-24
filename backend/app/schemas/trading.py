"""Pydantic schemas for trading data"""
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_serializer


# Bot schemas
class BotBase(BaseModel):
    name: str
    alignment_id: str | None = None
    user_id: str | None = None
    config_path: str
    exchange: str
    status: str = "created"
    mode: str = "dry_run"
    tags: list[str] = Field(default_factory=list)
    meta: dict[str, Any] = Field(default_factory=dict)


class BotCreate(BotBase):
    pass


class BotUpdate(BaseModel):
    name: str | None = None
    status: str | None = None
    mode: str | None = None
    tags: list[str] | None = None
    meta: dict[str, Any] | None = None


class Bot(BotBase):
    bot_id: str
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# Bot Session schemas
class BotSessionBase(BaseModel):
    bot_id: str
    container_id: str | None = None
    container_name: str | None = None
    initial_balance: Decimal | None = None
    stats: dict[str, Any] = Field(default_factory=dict)


class BotSessionCreate(BotSessionBase):
    pass


class BotSessionUpdate(BaseModel):
    status: str | None = None
    stopped_at: datetime | None = None
    final_balance: Decimal | None = None
    stats: dict[str, Any] | None = None
    logs_path: str | None = None
    error_message: str | None = None


class BotSession(BotSessionBase):
    session_id: str
    started_at: datetime
    stopped_at: datetime | None = None
    status: str
    final_balance: Decimal | None = None
    logs_path: str | None = None
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# Trade schemas
class DecisionLog(BaseModel):
    """Decision log for trade entry reasons (from README_DATA_STORAGE_STRATEGIES.md)"""
    reason: str
    signal_id: str | None = None
    market_regime: str | None = None  # bull, bear, flat, regular
    indicators: dict[str, Any] = Field(default_factory=dict)
    freqai_prediction: float | None = None
    confidence: float | None = None
    timestamp: datetime | None = None


class TradeBase(BaseModel):
    bot_id: str
    session_id: str | None = None
    source_type: str
    exchange: str
    pair: str
    side: str
    order_type: str
    amount: Decimal
    price: Decimal
    cost: Decimal
    fee_cost: Decimal | None = None
    fee_currency: str | None = None
    exchange_order_id: str | None = None
    exchange_trade_id: str | None = None
    status: str = "open"
    decision_log: DecisionLog | dict[str, Any] | None = None
    meta: dict[str, Any] = Field(default_factory=dict)


class TradeCreate(TradeBase):
    pass


class TradeUpdate(BaseModel):
    status: str | None = None
    closed_at: datetime | None = None
    current_price: Decimal | None = None
    meta: dict[str, Any] | None = None


class Trade(TradeBase):
    trade_id: str
    opened_at: datetime
    closed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# Position schemas
class PositionBase(BaseModel):
    bot_id: str
    session_id: str | None = None
    exchange: str
    pair: str
    side: str
    amount: Decimal
    entry_price: Decimal
    current_price: Decimal | None = None
    leverage: int = 1
    stop_loss: Decimal | None = None
    take_profit: Decimal | None = None
    unrealized_pnl: Decimal | None = None
    unrealized_pnl_percent: Decimal | None = None
    total_fees: Decimal = Decimal("0")
    status: str = "open"
    decision_log: DecisionLog | dict[str, Any] | None = None
    entry_trade_ids: list[str] = Field(default_factory=list)
    meta: dict[str, Any] = Field(default_factory=dict)


class PositionCreate(PositionBase):
    pass


class PositionUpdate(BaseModel):
    current_price: Decimal | None = None
    stop_loss: Decimal | None = None
    take_profit: Decimal | None = None
    unrealized_pnl: Decimal | None = None
    unrealized_pnl_percent: Decimal | None = None
    total_fees: Decimal | None = None
    status: str | None = None
    closed_at: datetime | None = None
    meta: dict[str, Any] | None = None


class Position(PositionBase):
    position_id: str
    opened_at: datetime
    closed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# Backtest schemas
class BacktestBase(BaseModel):
    bot_id: str | None = None
    alignment_id: str | None = None
    user_id: str | None = None
    strategy_name: str
    pair: str
    timeframe: str
    backtest_start: datetime
    backtest_end: datetime
    period_description: str | None = None
    initial_capital: Decimal = Decimal("1000")


class BacktestCreate(BacktestBase):
    pass


class BacktestUpdate(BaseModel):
    status: str | None = None
    final_capital: Decimal | None = None
    total_return: Decimal | None = None
    total_return_percent: Decimal | None = None
    total_trades: int | None = None
    winning_trades: int | None = None
    losing_trades: int | None = None
    win_rate: Decimal | None = None
    avg_trade_return: Decimal | None = None
    avg_winning_trade: Decimal | None = None
    avg_losing_trade: Decimal | None = None
    max_drawdown: Decimal | None = None
    max_drawdown_percent: Decimal | None = None
    sharpe_ratio: Decimal | None = None
    sortino_ratio: Decimal | None = None
    profit_factor: Decimal | None = None
    result_file_path: str | None = None
    trades_file_path: str | None = None
    logs_path: str | None = None
    error_message: str | None = None
    metrics: dict[str, Any] | None = None
    completed_at: datetime | None = None


class Backtest(BacktestBase):
    backtest_id: str
    final_capital: Decimal | None = None
    total_return: Decimal | None = None
    total_return_percent: Decimal | None = None
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: Decimal | None = None
    avg_trade_return: Decimal | None = None
    avg_winning_trade: Decimal | None = None
    avg_losing_trade: Decimal | None = None
    max_drawdown: Decimal | None = None
    max_drawdown_percent: Decimal | None = None
    sharpe_ratio: Decimal | None = None
    sortino_ratio: Decimal | None = None
    profit_factor: Decimal | None = None
    result_file_path: str | None = None
    trades_file_path: str | None = None
    status: str
    logs_path: str | None = None
    error_message: str | None = None
    metrics: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    completed_at: datetime | None = None
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# Bot Metric schemas
class BotMetricBase(BaseModel):
    bot_id: str
    session_id: str | None = None
    balance: Decimal | None = None
    available_balance: Decimal | None = None
    locked_balance: Decimal | None = None
    open_positions: int = 0
    total_positions_value: Decimal | None = None
    unrealized_pnl: Decimal | None = None
    realized_pnl: Decimal | None = None
    total_pnl: Decimal | None = None
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: Decimal | None = None
    metrics: dict[str, Any] = Field(default_factory=dict)


class BotMetricCreate(BotMetricBase):
    pass


class BotMetric(BotMetricBase):
    metric_id: int
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)


# Exchange Account schemas
class ExchangeAccountBase(BaseModel):
    user_id: str
    exchange: str
    name: str
    account_type: str = "spot"
    is_testnet: bool = False
    is_active: bool = True
    permissions: dict[str, Any] = Field(default_factory=dict)


class ExchangeAccountCreate(ExchangeAccountBase):
    api_key: str
    api_secret: str
    passphrase: str | None = None


class ExchangeAccountUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None
    api_key: str | None = None
    api_secret: str | None = None
    passphrase: str | None = None
    permissions: dict[str, Any] | None = None
    last_sync_at: datetime | None = None
    last_balance: Decimal | None = None


class ExchangeAccount(ExchangeAccountBase):
    account_id: str
    last_sync_at: datetime | None = None
    last_balance: Decimal | None = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# Response schemas for complex queries
class BotWithSession(Bot):
    """Bot with current session info"""

    current_session: BotSession | None = None
    open_positions_count: int = 0
    current_balance: Decimal | None = None
    current_pnl: Decimal | None = None


class BotStats(BaseModel):
    """Aggregated bot statistics"""

    @field_serializer(
        "win_rate",
        "total_pnl",
        "best_trade",
        "worst_trade",
        "avg_trade",
        when_used="json",
    )
    def _ser_decimals(self, v: Decimal | None) -> float | None:  # noqa: ANN001
        return float(v) if v is not None else None

    bot_id: str
    total_sessions: int
    total_runtime_seconds: int
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: Decimal
    total_pnl: Decimal
    best_trade: Decimal | None = None
    worst_trade: Decimal | None = None
    avg_trade: Decimal | None = None


class SessionStats(BaseModel):
    """Session statistics"""

    @field_serializer(
        "total_pnl",
        "win_rate",
        "balance_change",
        "balance_change_percent",
        when_used="json",
    )
    def _ser_decimals(self, v: Decimal) -> float:  # noqa: ANN001
        return float(v)

    session_id: str
    bot_id: str
    runtime_seconds: int
    total_trades: int
    open_positions: int
    total_pnl: Decimal
    win_rate: Decimal
    balance_change: Decimal
    balance_change_percent: Decimal


class MarketSummary(BaseModel):
    """Trading pair summary"""

    @field_serializer(
        "total_volume",
        "win_rate",
        "avg_profit",
        "best_trade",
        "worst_trade",
        when_used="json",
    )
    def _ser_decimals(self, v: Decimal) -> float:  # noqa: ANN001
        return float(v)

    pair: str
    total_trades: int
    total_volume: Decimal
    win_rate: Decimal
    avg_profit: Decimal
    best_trade: Decimal
    worst_trade: Decimal
