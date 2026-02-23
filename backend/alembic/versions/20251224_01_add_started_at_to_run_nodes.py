"""add started_at to run nodes

Revision ID: 20251224_01
Revises: 20251222_07
Create Date: 2025-12-24

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20251224_01"
down_revision = "20251222_07"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "node_graph_run_nodes",
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Backfill for existing rows.
    op.execute("UPDATE node_graph_run_nodes SET started_at = created_at WHERE started_at IS NULL")

    op.alter_column(
        "node_graph_run_nodes",
        "started_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
    )


def downgrade() -> None:
    op.drop_column("node_graph_run_nodes", "started_at")
