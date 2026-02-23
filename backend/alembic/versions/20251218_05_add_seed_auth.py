"""add seed auth support

Revision ID: 20251218_05
Revises: 20251217_04
Create Date: 2025-12-18

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20251218_05"
down_revision = "20251217_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Allow seed-based users without an email address.
    op.alter_column("users", "email", existing_type=sa.String(), nullable=True)

    op.add_column("users", sa.Column("seed_fingerprint", sa.String(), nullable=True))
    op.create_unique_constraint("uq_users_seed_fingerprint", "users", ["seed_fingerprint"])
    op.create_index("ix_users_seed_fingerprint", "users", ["seed_fingerprint"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_users_seed_fingerprint", table_name="users")
    op.drop_constraint("uq_users_seed_fingerprint", "users", type_="unique")
    op.drop_column("users", "seed_fingerprint")

    op.alter_column("users", "email", existing_type=sa.String(), nullable=False)
