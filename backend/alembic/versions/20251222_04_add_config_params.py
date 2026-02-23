"""add config params table

Revision ID: 20251222_04
Revises: 20251222_03
Create Date: 2025-12-22

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20251222_04"
down_revision = "20251222_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "config_params",
        sa.Column("param_id", sa.String(), primary_key=True),
        sa.Column(
            "config_id",
            sa.String(),
            sa.ForeignKey("config_files.config_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("path", sa.String(), nullable=False),
        sa.Column("value", sa.JSON(), nullable=False),
        sa.Column("value_type", sa.String(), nullable=False, server_default="json"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("config_id", "path", name="uq_config_params_config_path"),
    )

    op.create_index("ix_config_params_config", "config_params", ["config_id"], unique=False)
    op.create_index("ix_config_params_path", "config_params", ["path"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_config_params_path", table_name="config_params")
    op.drop_index("ix_config_params_config", table_name="config_params")
    op.drop_table("config_params")
