"""add store marketplace tables

Revision ID: 20251218_07
Revises: 20251218_06
Create Date: 2025-12-18

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20251218_07"
down_revision = "20251218_06"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "store_items",
        sa.Column("item_id", sa.String(), primary_key=True),
        sa.Column("item_type", sa.String(), nullable=False),
        sa.Column("strategy_id", sa.String(), sa.ForeignKey("strategy_templates.strategy_id", ondelete="CASCADE"), nullable=True),
        sa.Column("model_id", sa.String(), sa.ForeignKey("freqai_model_variants.model_id", ondelete="CASCADE"), nullable=True),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("meta", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("price_cents", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("currency", sa.String(), nullable=False, server_default=sa.text("'USD'")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("item_type", "strategy_id", name="uq_store_items_type_strategy"),
        sa.UniqueConstraint("item_type", "model_id", name="uq_store_items_type_model"),
    )
    op.create_index("ix_store_items_active_type", "store_items", ["is_active", "item_type"], unique=False)
    op.create_index("ix_store_items_strategy", "store_items", ["strategy_id"], unique=False)
    op.create_index("ix_store_items_model", "store_items", ["model_id"], unique=False)
    op.create_index("ix_store_items_slug", "store_items", ["slug"], unique=False)

    op.create_table(
        "store_purchases",
        sa.Column("purchase_id", sa.String(), primary_key=True),
        sa.Column("item_id", sa.String(), sa.ForeignKey("store_items.item_id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("item_id", "user_id", name="uq_store_purchases_item_user"),
    )
    op.create_index("ix_store_purchases_item", "store_purchases", ["item_id"], unique=False)
    op.create_index("ix_store_purchases_user", "store_purchases", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_store_purchases_user", table_name="store_purchases")
    op.drop_index("ix_store_purchases_item", table_name="store_purchases")
    op.drop_table("store_purchases")

    op.drop_index("ix_store_items_slug", table_name="store_items")
    op.drop_index("ix_store_items_model", table_name="store_items")
    op.drop_index("ix_store_items_strategy", table_name="store_items")
    op.drop_index("ix_store_items_active_type", table_name="store_items")
    op.drop_table("store_items")
