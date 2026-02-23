"""add regime and kind to config_files

Revision ID: 20251222_02
Revises: 20251222_01
Create Date: 2025-12-22

Adds regime and kind fields to config_files table as per README_DATA_STORAGE_STRATEGIES.md:
- regime: bull, bear, flat, regular (market regime)
- kind: base, variant (config type)
- parent_config_id: FK to parent config for variants
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20251222_02"
down_revision = "20251222_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new columns to config_files
    op.add_column(
        "config_files",
        sa.Column("regime", sa.String(), nullable=False, server_default="regular"),
    )
    op.add_column(
        "config_files",
        sa.Column("kind", sa.String(), nullable=False, server_default="base"),
    )
    op.add_column(
        "config_files",
        sa.Column("parent_config_id", sa.String(), nullable=True),
    )

    # Add FK constraint
    op.create_foreign_key(
        "fk_config_files_parent",
        "config_files",
        "config_files",
        ["parent_config_id"],
        ["config_id"],
        ondelete="SET NULL",
    )

    # Add indexes
    op.create_index("ix_config_files_regime", "config_files", ["regime"])
    op.create_index("ix_config_files_kind", "config_files", ["kind"])
    op.create_index("ix_config_files_parent_id", "config_files", ["parent_config_id"])

    # Add ForeignKey constraints to bots table for user_id and alignment_id
    # These were missing in the original migration
    op.create_foreign_key(
        "fk_bots_user_id",
        "bots",
        "users",
        ["user_id"],
        ["user_id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_bots_alignment_id",
        "bots",
        "strategy_alignments",
        ["alignment_id"],
        ["alignment_id"],
        ondelete="SET NULL",
    )

    # Add FK to backtests
    op.create_foreign_key(
        "fk_backtests_user_id",
        "backtests",
        "users",
        ["user_id"],
        ["user_id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_backtests_alignment_id",
        "backtests",
        "strategy_alignments",
        ["alignment_id"],
        ["alignment_id"],
        ondelete="SET NULL",
    )

    # Add FK to exchange_accounts
    op.create_foreign_key(
        "fk_exchange_accounts_user_id",
        "exchange_accounts",
        "users",
        ["user_id"],
        ["user_id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    # Drop FKs
    op.drop_constraint("fk_exchange_accounts_user_id", "exchange_accounts", type_="foreignkey")
    op.drop_constraint("fk_backtests_alignment_id", "backtests", type_="foreignkey")
    op.drop_constraint("fk_backtests_user_id", "backtests", type_="foreignkey")
    op.drop_constraint("fk_bots_alignment_id", "bots", type_="foreignkey")
    op.drop_constraint("fk_bots_user_id", "bots", type_="foreignkey")
    op.drop_constraint("fk_config_files_parent", "config_files", type_="foreignkey")

    # Drop indexes
    op.drop_index("ix_config_files_parent_id", table_name="config_files")
    op.drop_index("ix_config_files_kind", table_name="config_files")
    op.drop_index("ix_config_files_regime", table_name="config_files")

    # Drop columns
    op.drop_column("config_files", "parent_config_id")
    op.drop_column("config_files", "kind")
    op.drop_column("config_files", "regime")
