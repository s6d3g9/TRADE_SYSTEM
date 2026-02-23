"""add users and email login tokens

Revision ID: 20251217_04
Revises: 20251217_03
Create Date: 2025-12-17

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20251217_04"
down_revision = "20251217_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("user_id", sa.String(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("picture_url", sa.String(), nullable=True),
        sa.Column("google_sub", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("email", name="uq_users_email"),
        sa.UniqueConstraint("google_sub", name="uq_users_google_sub"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=False)
    op.create_index("ix_users_google_sub", "users", ["google_sub"], unique=False)
    op.create_index("ix_users_email_verified", "users", ["email", "email_verified"], unique=False)

    op.create_table(
        "email_login_tokens",
        sa.Column("token_id", sa.String(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip", sa.String(), nullable=True),
        sa.Column("user_agent", sa.String(), nullable=True),
        sa.UniqueConstraint("token_hash", name="uq_email_login_tokens_token_hash"),
    )
    op.create_index("ix_email_login_tokens_email", "email_login_tokens", ["email"], unique=False)
    op.create_index("ix_email_login_tokens_token_hash", "email_login_tokens", ["token_hash"], unique=False)
    op.create_index("ix_email_login_tokens_email_expires", "email_login_tokens", ["email", "expires_at"], unique=False)
    op.create_index("ix_email_login_tokens_user_expires", "email_login_tokens", ["user_id", "expires_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_email_login_tokens_user_expires", table_name="email_login_tokens")
    op.drop_index("ix_email_login_tokens_email_expires", table_name="email_login_tokens")
    op.drop_index("ix_email_login_tokens_token_hash", table_name="email_login_tokens")
    op.drop_index("ix_email_login_tokens_email", table_name="email_login_tokens")
    op.drop_table("email_login_tokens")

    op.drop_index("ix_users_email_verified", table_name="users")
    op.drop_index("ix_users_google_sub", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
