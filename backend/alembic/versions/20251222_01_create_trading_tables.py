"""create trading tables

Revision ID: 20251222_01
Revises: 20251218_07
Create Date: 2025-12-22

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20251222_01"
down_revision = "20251218_07"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop old simple bots table if exists
    op.execute("DROP TABLE IF EXISTS bots CASCADE")

    # Create new comprehensive bots table
    op.create_table(
        "bots",
        sa.Column("bot_id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("alignment_id", sa.String(), nullable=True),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("config_path", sa.String(), nullable=False),
        sa.Column("exchange", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="created"),
        sa.Column("mode", sa.String(), nullable=False, server_default="dry_run"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("tags", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("meta", postgresql.JSONB(), nullable=False, server_default="{}"),
    )

    # Create indexes for bots
    op.create_index("idx_bots_user_id", "bots", ["user_id"])
    op.create_index("idx_bots_status", "bots", ["status"])
    op.create_index("idx_bots_mode", "bots", ["mode"])
    op.create_index("idx_bots_alignment_id", "bots", ["alignment_id"])

    # Bot sessions
    op.create_table(
        "bot_sessions",
        sa.Column("session_id", sa.String(), primary_key=True),
        sa.Column("bot_id", sa.String(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("stopped_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="running"),
        sa.Column("container_id", sa.String(), nullable=True),
        sa.Column("container_name", sa.String(), nullable=True),
        sa.Column("initial_balance", sa.Numeric(20, 8), nullable=True),
        sa.Column("final_balance", sa.Numeric(20, 8), nullable=True),
        sa.Column("stats", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("logs_path", sa.String(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["bot_id"], ["bots.bot_id"], ondelete="CASCADE"),
    )

    op.create_index("idx_bot_sessions_bot_id", "bot_sessions", ["bot_id"])
    op.create_index("idx_bot_sessions_started_at", "bot_sessions", ["started_at"])
    op.create_index("idx_bot_sessions_status", "bot_sessions", ["status"])

    # Trades
    op.create_table(
        "trades",
        sa.Column("trade_id", sa.String(), primary_key=True),
        sa.Column("bot_id", sa.String(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=True),
        sa.Column("source_type", sa.String(), nullable=False),
        sa.Column("exchange", sa.String(), nullable=False),
        sa.Column("pair", sa.String(), nullable=False),
        sa.Column("side", sa.String(), nullable=False),
        sa.Column("order_type", sa.String(), nullable=False),
        sa.Column("amount", sa.Numeric(20, 8), nullable=False),
        sa.Column("price", sa.Numeric(20, 8), nullable=False),
        sa.Column("cost", sa.Numeric(20, 8), nullable=False),
        sa.Column("fee_cost", sa.Numeric(20, 8), nullable=True),
        sa.Column("fee_currency", sa.String(), nullable=True),
        sa.Column("exchange_order_id", sa.String(), nullable=True),
        sa.Column("exchange_trade_id", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="open"),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("meta", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["bot_id"], ["bots.bot_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["bot_sessions.session_id"], ondelete="SET NULL"),
    )

    op.create_index("idx_trades_bot_id", "trades", ["bot_id"])
    op.create_index("idx_trades_session_id", "trades", ["session_id"])
    op.create_index("idx_trades_pair", "trades", ["pair"])
    op.create_index("idx_trades_opened_at", "trades", ["opened_at"])
    op.create_index("idx_trades_status", "trades", ["status"])
    op.create_index("idx_trades_source_type", "trades", ["source_type"])

    # Positions
    op.create_table(
        "positions",
        sa.Column("position_id", sa.String(), primary_key=True),
        sa.Column("bot_id", sa.String(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=True),
        sa.Column("exchange", sa.String(), nullable=False),
        sa.Column("pair", sa.String(), nullable=False),
        sa.Column("side", sa.String(), nullable=False),
        sa.Column("amount", sa.Numeric(20, 8), nullable=False),
        sa.Column("entry_price", sa.Numeric(20, 8), nullable=False),
        sa.Column("current_price", sa.Numeric(20, 8), nullable=True),
        sa.Column("leverage", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("stop_loss", sa.Numeric(20, 8), nullable=True),
        sa.Column("take_profit", sa.Numeric(20, 8), nullable=True),
        sa.Column("unrealized_pnl", sa.Numeric(20, 8), nullable=True),
        sa.Column("unrealized_pnl_percent", sa.Numeric(10, 4), nullable=True),
        sa.Column("total_fees", sa.Numeric(20, 8), nullable=False, server_default="0"),
        sa.Column("status", sa.String(), nullable=False, server_default="open"),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("entry_trade_ids", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("meta", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["bot_id"], ["bots.bot_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["bot_sessions.session_id"], ondelete="SET NULL"),
    )

    op.create_index("idx_positions_bot_id", "positions", ["bot_id"])
    op.create_index("idx_positions_session_id", "positions", ["session_id"])
    op.create_index("idx_positions_pair", "positions", ["pair"])
    op.create_index("idx_positions_status", "positions", ["status"])
    op.create_index("idx_positions_opened_at", "positions", ["opened_at"])

    # Backtests
    op.create_table(
        "backtests",
        sa.Column("backtest_id", sa.String(), primary_key=True),
        sa.Column("bot_id", sa.String(), nullable=True),
        sa.Column("alignment_id", sa.String(), nullable=True),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("strategy_name", sa.String(), nullable=False),
        sa.Column("pair", sa.String(), nullable=False),
        sa.Column("timeframe", sa.String(), nullable=False),
        sa.Column("backtest_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("backtest_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_description", sa.String(), nullable=True),
        sa.Column("initial_capital", sa.Numeric(20, 8), nullable=False, server_default="1000"),
        sa.Column("final_capital", sa.Numeric(20, 8), nullable=True),
        sa.Column("total_return", sa.Numeric(10, 4), nullable=True),
        sa.Column("total_return_percent", sa.Numeric(10, 4), nullable=True),
        sa.Column("total_trades", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("winning_trades", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("losing_trades", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("win_rate", sa.Numeric(10, 4), nullable=True),
        sa.Column("avg_trade_return", sa.Numeric(10, 4), nullable=True),
        sa.Column("avg_winning_trade", sa.Numeric(10, 4), nullable=True),
        sa.Column("avg_losing_trade", sa.Numeric(10, 4), nullable=True),
        sa.Column("max_drawdown", sa.Numeric(10, 4), nullable=True),
        sa.Column("max_drawdown_percent", sa.Numeric(10, 4), nullable=True),
        sa.Column("sharpe_ratio", sa.Numeric(10, 4), nullable=True),
        sa.Column("sortino_ratio", sa.Numeric(10, 4), nullable=True),
        sa.Column("profit_factor", sa.Numeric(10, 4), nullable=True),
        sa.Column("result_file_path", sa.String(), nullable=True),
        sa.Column("trades_file_path", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("logs_path", sa.String(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("metrics", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["bot_id"], ["bots.bot_id"], ondelete="SET NULL"),
    )

    op.create_index("idx_backtests_bot_id", "backtests", ["bot_id"])
    op.create_index("idx_backtests_alignment_id", "backtests", ["alignment_id"])
    op.create_index("idx_backtests_user_id", "backtests", ["user_id"])
    op.create_index("idx_backtests_strategy_name", "backtests", ["strategy_name"])
    op.create_index("idx_backtests_pair", "backtests", ["pair"])
    op.create_index("idx_backtests_created_at", "backtests", ["created_at"])
    op.create_index("idx_backtests_status", "backtests", ["status"])

    # Bot metrics
    op.create_table(
        "bot_metrics",
        sa.Column("metric_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("bot_id", sa.String(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("balance", sa.Numeric(20, 8), nullable=True),
        sa.Column("available_balance", sa.Numeric(20, 8), nullable=True),
        sa.Column("locked_balance", sa.Numeric(20, 8), nullable=True),
        sa.Column("open_positions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_positions_value", sa.Numeric(20, 8), nullable=True),
        sa.Column("unrealized_pnl", sa.Numeric(20, 8), nullable=True),
        sa.Column("realized_pnl", sa.Numeric(20, 8), nullable=True),
        sa.Column("total_pnl", sa.Numeric(20, 8), nullable=True),
        sa.Column("total_trades", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("winning_trades", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("losing_trades", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("win_rate", sa.Numeric(10, 4), nullable=True),
        sa.Column("metrics", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.ForeignKeyConstraint(["bot_id"], ["bots.bot_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["bot_sessions.session_id"], ondelete="CASCADE"),
    )

    op.create_index("idx_bot_metrics_bot_id_timestamp", "bot_metrics", ["bot_id", sa.desc("timestamp")])
    op.create_index("idx_bot_metrics_session_id", "bot_metrics", ["session_id"])

    # Exchange accounts
    op.create_table(
        "exchange_accounts",
        sa.Column("account_id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("exchange", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("account_type", sa.String(), nullable=False, server_default="spot"),
        sa.Column("api_key_encrypted", sa.Text(), nullable=False),
        sa.Column("api_secret_encrypted", sa.Text(), nullable=False),
        sa.Column("passphrase_encrypted", sa.Text(), nullable=True),
        sa.Column("is_testnet", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("permissions", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_balance", sa.Numeric(20, 8), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_index("idx_exchange_accounts_user_id", "exchange_accounts", ["user_id"])
    op.create_index("idx_exchange_accounts_exchange", "exchange_accounts", ["exchange"])


def downgrade() -> None:
    op.drop_table("exchange_accounts")
    op.drop_table("bot_metrics")
    op.drop_table("backtests")
    op.drop_table("positions")
    op.drop_table("trades")
    op.drop_table("bot_sessions")
    op.drop_table("bots")
