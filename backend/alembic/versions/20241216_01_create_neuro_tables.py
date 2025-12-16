"""create neuro tables

Revision ID: 20241216_01
Revises: 
Create Date: 2025-12-16
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20241216_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "neuro_providers",
        sa.Column("provider_id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("module_type", sa.String(), nullable=False),
        sa.Column("connector", sa.String(), nullable=False),
        sa.Column("connector_config", sa.JSON(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("scope", sa.JSON(), nullable=True),
        sa.Column("defaults", sa.JSON(), nullable=True),
        sa.Column("mapping", sa.JSON(), nullable=True),
        sa.Column("health_status", sa.String(), nullable=False, server_default="unknown"),
        sa.Column("last_seen_ts", sa.DateTime(timezone=True), nullable=True),
        sa.Column("errors_5m", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("latency_ms_avg", sa.Float(), nullable=True),
        sa.Column("stale_rate_5m", sa.Float(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "provider_bindings",
        sa.Column("binding_id", sa.String(), primary_key=True),
        sa.Column("bot_id", sa.String(), nullable=False, unique=True),
        sa.Column(
            "provider_id",
            sa.String(),
            sa.ForeignKey("neuro_providers.provider_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("overrides", sa.JSON(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_provider_bindings_bot_id", "provider_bindings", ["bot_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_provider_bindings_bot_id", table_name="provider_bindings")
    op.drop_table("provider_bindings")
    op.drop_table("neuro_providers")
