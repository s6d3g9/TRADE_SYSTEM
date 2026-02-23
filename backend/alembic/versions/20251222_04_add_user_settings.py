"""add user settings

Revision ID: 20251222_05
Revises: 20251222_04
Create Date: 2025-12-22

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20251222_05"
down_revision = "20251222_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_settings",
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("ai_provider", sa.String(), nullable=True),
        sa.Column("ai_token", sa.Text(), nullable=True),
        sa.Column("openrouter_model_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("user_settings")
