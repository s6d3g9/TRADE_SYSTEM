"""add config files table

Revision ID: 20251217_02
Revises: 20251217_01
Create Date: 2025-12-17

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20251217_02"
down_revision = "20251217_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "config_files",
        sa.Column("config_id", sa.String(), primary_key=True),
        sa.Column("scope", sa.String(), nullable=False),
        sa.Column("owner_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False, server_default="config.json"),
        sa.Column("content", sa.JSON(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_config_files_scope_owner", "config_files", ["scope", "owner_id"], unique=False)
    op.create_index("ix_config_files_owner_active", "config_files", ["scope", "owner_id", "is_active"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_config_files_owner_active", table_name="config_files")
    op.drop_index("ix_config_files_scope_owner", table_name="config_files")
    op.drop_table("config_files")
