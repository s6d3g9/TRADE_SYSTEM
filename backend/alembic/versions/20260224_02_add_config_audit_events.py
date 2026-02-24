"""add config audit events table

Revision ID: 20260224_02
Revises: 20260224_01
Create Date: 2026-02-24

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260224_02"
down_revision = "20260224_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "config_audit_events",
        sa.Column("event_id", sa.String(), primary_key=True),
        sa.Column("config_id", sa.String(), nullable=True),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("scope", sa.String(), nullable=False),
        sa.Column("owner_id", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["config_id"], ["config_files.config_id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"], ondelete="SET NULL"),
    )

    op.create_index("ix_config_audit_events_config_created", "config_audit_events", ["config_id", "created_at"])
    op.create_index(
        "ix_config_audit_events_scope_owner_created",
        "config_audit_events",
        ["scope", "owner_id", "created_at"],
    )
    op.create_index("ix_config_audit_events_user_created", "config_audit_events", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_config_audit_events_user_created", table_name="config_audit_events")
    op.drop_index("ix_config_audit_events_scope_owner_created", table_name="config_audit_events")
    op.drop_index("ix_config_audit_events_config_created", table_name="config_audit_events")
    op.drop_table("config_audit_events")
