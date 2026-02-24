"""Enhanced bot models with full trading lifecycle support

Архитектура связей:
- Bot → User (N:1) - бот принадлежит пользователю
- Bot → StrategyAlignment (N:1) - бот использует сонастройку
- Bot → BotSession (1:N) - бот имеет множество сессий запуска
- Bot → Trade (1:N) - все сделки бота
- Bot → Position (1:N) - все позиции бота
- BotSession → Trade (1:N) - сделки в рамках сессии
- BotSession → Position (1:N) - позиции в рамках сессии
- ExchangeAccount → User (N:1) - аккаунт принадлежит пользователю
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.strategylab import StrategyAlignment


class Bot(Base, TimestampMixin):
    """Trading bot configuration and state"""

    __tablename__ = "bots"

    bot_id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)

    # Relations with ForeignKey
    alignment_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("strategy_alignments.alignment_id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Configuration
    config_path: Mapped[str] = mapped_column(String, nullable=False)
    exchange: Mapped[str] = mapped_column(String, nullable=False)

    # State
    status: Mapped[str] = mapped_column(String, nullable=False, default="created", index=True)
    mode: Mapped[str] = mapped_column(String, nullable=False, default="dry_run", index=True)

    # Metadata

    # Additional
    tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    meta: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    # Relationships - навигация через ORM
    user: Mapped["User | None"] = relationship("User", back_populates="bots", lazy="selectin")
    alignment: Mapped["StrategyAlignment | None"] = relationship("StrategyAlignment", back_populates="bots", lazy="selectin")
    sessions: Mapped[list["BotSession"]] = relationship("BotSession", back_populates="bot", lazy="selectin", cascade="all, delete-orphan")
    trades: Mapped[list["Trade"]] = relationship("Trade", back_populates="bot", lazy="noload", cascade="all, delete-orphan")
    positions: Mapped[list["Position"]] = relationship("Position", back_populates="bot", lazy="selectin", cascade="all, delete-orphan")
    metrics: Mapped[list["BotMetric"]] = relationship("BotMetric", back_populates="bot", lazy="noload", cascade="all, delete-orphan")
    backtests: Mapped[list["Backtest"]] = relationship("Backtest", back_populates="bot", lazy="noload")


class BotSession(Base, TimestampMixin):
    """Bot execution session - created each time bot starts"""

    __tablename__ = "bot_sessions"

    session_id: Mapped[str] = mapped_column(String, primary_key=True)
    bot_id: Mapped[str] = mapped_column(
        String, ForeignKey("bots.bot_id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Timing
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    stopped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # State
    status: Mapped[str] = mapped_column(String, nullable=False, default="running", index=True)

    # Docker container
    container_id: Mapped[str | None] = mapped_column(String, nullable=True)
    container_name: Mapped[str | None] = mapped_column(String, nullable=True)

    # Balance tracking
    initial_balance: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    final_balance: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)

    # Session statistics
    stats: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    # Logs and errors
    logs_path: Mapped[str | None] = mapped_column(String, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)


    # Relationships
    bot: Mapped["Bot"] = relationship("Bot", back_populates="sessions", lazy="selectin")
    trades: Mapped[list["Trade"]] = relationship("Trade", back_populates="session", lazy="noload")
    positions: Mapped[list["Position"]] = relationship("Position", back_populates="session", lazy="noload")
    metrics: Mapped[list["BotMetric"]] = relationship("BotMetric", back_populates="session", lazy="noload")


class Trade(Base, TimestampMixin):
    """Individual trade execution"""

    __tablename__ = "trades"

    trade_id: Mapped[str] = mapped_column(String, primary_key=True)

    # Relations with ForeignKey
    bot_id: Mapped[str] = mapped_column(
        String, ForeignKey("bots.bot_id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("bot_sessions.session_id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Source type: backtest, dry_run, live
    source_type: Mapped[str] = mapped_column(String, nullable=False, index=True)

    # Trade details
    exchange: Mapped[str] = mapped_column(String, nullable=False)
    pair: Mapped[str] = mapped_column(String, nullable=False, index=True)
    side: Mapped[str] = mapped_column(String, nullable=False)  # buy, sell
    order_type: Mapped[str] = mapped_column(String, nullable=False)  # market, limit, stop_loss

    # Amount and price
    amount: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    cost: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)  # amount * price

    # Fees
    fee_cost: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    fee_currency: Mapped[str | None] = mapped_column(String, nullable=True)

    # Exchange IDs
    exchange_order_id: Mapped[str | None] = mapped_column(String, nullable=True)
    exchange_trade_id: Mapped[str | None] = mapped_column(String, nullable=True)

    # Status: open, closed, canceled
    status: Mapped[str] = mapped_column(String, nullable=False, default="open", index=True)

    # Decision log - why this trade was opened (from README_DATA_STORAGE_STRATEGIES.md)
    decision_log: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    # Structure: {
    #   "reason": "FreqAI prediction",
    #   "signal_id": "...",
    #   "market_regime": "bull|bear|flat|regular",
    #   "indicators": {"rsi": 30, "macd": 0.5},
    #   "freqai_prediction": 0.85,
    #   "confidence": 0.92,
    #   "timestamp": "2025-01-01T12:00:00Z"
    # }

    # Timing
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Additional
    meta: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)


    # Relationships
    bot: Mapped["Bot"] = relationship("Bot", back_populates="trades", lazy="selectin")
    session: Mapped["BotSession | None"] = relationship("BotSession", back_populates="trades", lazy="selectin")


class Position(Base, TimestampMixin):
    """Open position (aggregated trades)"""

    __tablename__ = "positions"

    position_id: Mapped[str] = mapped_column(String, primary_key=True)

    # Relations with ForeignKey
    bot_id: Mapped[str] = mapped_column(
        String, ForeignKey("bots.bot_id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("bot_sessions.session_id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Position details
    exchange: Mapped[str] = mapped_column(String, nullable=False)
    pair: Mapped[str] = mapped_column(String, nullable=False, index=True)
    side: Mapped[str] = mapped_column(String, nullable=False)  # long, short

    # Size
    amount: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    entry_price: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    current_price: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)

    # Leverage
    leverage: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Stop loss and take profit
    stop_loss: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    take_profit: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)

    # PnL
    unrealized_pnl: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    unrealized_pnl_percent: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)

    # Fees
    total_fees: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False, default=0)

    # Status: open, closing, closed
    status: Mapped[str] = mapped_column(String, nullable=False, default="open", index=True)

    # Decision log - why this position was opened
    decision_log: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    # Timing
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Related trades
    entry_trade_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

    # Additional
    meta: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)


    # Relationships
    bot: Mapped["Bot"] = relationship("Bot", back_populates="positions", lazy="selectin")
    session: Mapped["BotSession | None"] = relationship("BotSession", back_populates="positions", lazy="selectin")


class Backtest(Base, TimestampMixin):
    """Backtest results - связь с ботом, alignment и пользователем"""

    __tablename__ = "backtests"

    backtest_id: Mapped[str] = mapped_column(String, primary_key=True)

    # Relations with ForeignKey
    bot_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("bots.bot_id", ondelete="SET NULL"), nullable=True, index=True
    )
    alignment_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("strategy_alignments.alignment_id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Parameters
    strategy_name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    pair: Mapped[str] = mapped_column(String, nullable=False, index=True)
    timeframe: Mapped[str] = mapped_column(String, nullable=False)

    # Period
    backtest_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    backtest_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_description: Mapped[str | None] = mapped_column(String, nullable=True)

    # Capital
    initial_capital: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False, default=1000)
    final_capital: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    total_return: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    total_return_percent: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)

    # Trade statistics
    total_trades: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    winning_trades: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    losing_trades: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    win_rate: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)

    # Averages
    avg_trade_return: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    avg_winning_trade: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    avg_losing_trade: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)

    # Risk metrics
    max_drawdown: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    max_drawdown_percent: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    sharpe_ratio: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    sortino_ratio: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    profit_factor: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)

    # Files
    result_file_path: Mapped[str | None] = mapped_column(String, nullable=True)
    trades_file_path: Mapped[str | None] = mapped_column(String, nullable=True)

    # Status: pending, running, completed, failed
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending", index=True)

    # Logs
    logs_path: Mapped[str | None] = mapped_column(String, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Additional metrics (хранит полный JSON отчёта Freqtrade)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    bot: Mapped["Bot | None"] = relationship("Bot", back_populates="backtests", lazy="selectin")
    alignment: Mapped["StrategyAlignment | None"] = relationship("StrategyAlignment", back_populates="backtests", lazy="selectin")
    user: Mapped["User | None"] = relationship("User", back_populates="backtests", lazy="selectin")


class BotMetric(Base, TimestampMixin):
    """Real-time bot metrics snapshots - снимки состояния каждые 1-5 минут"""

    __tablename__ = "bot_metrics"

    metric_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Relations with ForeignKey
    bot_id: Mapped[str] = mapped_column(
        String, ForeignKey("bots.bot_id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("bot_sessions.session_id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Timestamp
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    # Balance
    balance: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    available_balance: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    locked_balance: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)

    # Positions
    open_positions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_positions_value: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)

    # PnL
    unrealized_pnl: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    realized_pnl: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    total_pnl: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)

    # Statistics
    total_trades: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    winning_trades: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    losing_trades: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    win_rate: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)

    # Additional metrics
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    # Relationships
    bot: Mapped["Bot"] = relationship("Bot", back_populates="metrics", lazy="selectin")
    session: Mapped["BotSession | None"] = relationship("BotSession", back_populates="metrics", lazy="selectin")


class ExchangeAccount(Base, TimestampMixin):
    """Exchange API credentials - зашифрованные ключи бирж"""

    __tablename__ = "exchange_accounts"

    account_id: Mapped[str] = mapped_column(String, primary_key=True)

    # User with ForeignKey
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Exchange
    exchange: Mapped[str] = mapped_column(String, nullable=False, index=True)

    # Name (user-defined)
    name: Mapped[str] = mapped_column(String, nullable=False)

    # Account type: spot, futures, margin
    account_type: Mapped[str] = mapped_column(String, nullable=False, default="spot")

    # API keys (encrypted!)
    api_key_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    api_secret_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    passphrase_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Settings
    is_testnet: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Permissions
    permissions: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    # Last sync
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_balance: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)


    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="exchange_accounts", lazy="selectin")
