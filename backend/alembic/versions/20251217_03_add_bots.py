"""add bots table

Revision ID: 20251217_03
Revises: 20251217_02
Create Date: 2025-12-17

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20251217_03"
down_revision = "20251217_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bots",
        sa.Column("bot_id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("config_path", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("bots")
