"""add password auth

Revision ID: 20251218_06
Revises: 20251218_05
Create Date: 2025-12-18

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20251218_06"
down_revision = "20251218_05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.String(), nullable=True))
    op.add_column("users", sa.Column("password_updated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "password_updated_at")
    op.drop_column("users", "password_hash")
