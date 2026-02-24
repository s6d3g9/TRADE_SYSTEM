"""add check constraints and composite indexes

Revision ID: 20260224_01
Revises: 20251224_02
Create Date: 2026-02-24

Adds:
- CHECK constraints for status/mode/scope/regime/kind enums.
- Composite indexes for common query patterns.

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260224_01"
down_revision = "20251224_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # bots
    op.create_index("ix_bots_user_status", "bots", ["user_id", "status"])
    op.create_check_constraint(
        "ck_bots_status", "bots", "status IN ('created','running','stopped','failed')"
    )
    op.create_check_constraint(
        "ck_bots_mode", "bots", "mode IN ('dry_run','live','backtest')"
    )

    # bot_sessions
    op.create_index("ix_bot_sessions_bot_started_at", "bot_sessions", ["bot_id", "started_at"])
    op.create_check_constraint(
        "ck_bot_sessions_status", "bot_sessions", "status IN ('starting','running','stopped','failed')"
    )

    # trades
    op.create_index("ix_trades_bot_opened_at", "trades", ["bot_id", "opened_at"])
    op.create_index("ix_trades_bot_status", "trades", ["bot_id", "status"])
    op.create_check_constraint(
        "ck_trades_status", "trades", "status IN ('open','closed','canceled')"
    )
    op.create_check_constraint(
        "ck_trades_side", "trades", "side IN ('buy','sell')"
    )

    # positions
    op.create_index("ix_positions_bot_opened_at", "positions", ["bot_id", "opened_at"])
    op.create_index("ix_positions_bot_status", "positions", ["bot_id", "status"])
    op.create_check_constraint(
        "ck_positions_status", "positions", "status IN ('open','closing','closed')"
    )
    op.create_check_constraint(
        "ck_positions_side", "positions", "side IN ('long','short')"
    )

    # backtests
    op.create_index("ix_backtests_user_created_at", "backtests", ["user_id", "created_at"])
    op.create_index("ix_backtests_bot_created_at", "backtests", ["bot_id", "created_at"])
    op.create_check_constraint(
        "ck_backtests_status", "backtests", "status IN ('pending','running','completed','failed')"
    )

    # strategy_alignments
    op.create_check_constraint(
        "ck_strategy_alignments_status",
        "strategy_alignments",
        "status IN ('draft','active','archived')",
    )

    # config_files
    op.create_check_constraint(
        "ck_config_files_scope",
        "config_files",
        "scope IN ('strategy','model','alignment')",
    )
    op.create_check_constraint(
        "ck_config_files_regime",
        "config_files",
        "regime IN ('bull','bear','flat','regular')",
    )
    op.create_check_constraint(
        "ck_config_files_kind",
        "config_files",
        "kind IN ('base','variant')",
    )


def downgrade() -> None:
    # config_files
    op.drop_constraint("ck_config_files_kind", "config_files", type_="check")
    op.drop_constraint("ck_config_files_regime", "config_files", type_="check")
    op.drop_constraint("ck_config_files_scope", "config_files", type_="check")

    # strategy_alignments
    op.drop_constraint("ck_strategy_alignments_status", "strategy_alignments", type_="check")

    # backtests
    op.drop_constraint("ck_backtests_status", "backtests", type_="check")
    op.drop_index("ix_backtests_bot_created_at", table_name="backtests")
    op.drop_index("ix_backtests_user_created_at", table_name="backtests")

    # positions
    op.drop_constraint("ck_positions_side", "positions", type_="check")
    op.drop_constraint("ck_positions_status", "positions", type_="check")
    op.drop_index("ix_positions_bot_status", table_name="positions")
    op.drop_index("ix_positions_bot_opened_at", table_name="positions")

    # trades
    op.drop_constraint("ck_trades_side", "trades", type_="check")
    op.drop_constraint("ck_trades_status", "trades", type_="check")
    op.drop_index("ix_trades_bot_status", table_name="trades")
    op.drop_index("ix_trades_bot_opened_at", table_name="trades")

    # bot_sessions
    op.drop_constraint("ck_bot_sessions_status", "bot_sessions", type_="check")
    op.drop_index("ix_bot_sessions_bot_started_at", table_name="bot_sessions")

    # bots
    op.drop_constraint("ck_bots_mode", "bots", type_="check")
    op.drop_constraint("ck_bots_status", "bots", type_="check")
    op.drop_index("ix_bots_user_status", table_name="bots")
