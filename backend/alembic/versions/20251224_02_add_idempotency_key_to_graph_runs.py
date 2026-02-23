"""add idempotency_key to graph runs

Revision ID: 20251224_02
Revises: 20251224_01
Create Date: 2025-12-24

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20251224_02"
down_revision = "20251224_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "node_graph_runs",
        sa.Column("idempotency_key", sa.String(), nullable=True),
    )
    op.create_index(
        "ix_node_graph_runs_idem_user_graph",
        "node_graph_runs",
        ["user_id", "graph_id", "idempotency_key", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_node_graph_runs_idem_user_graph", table_name="node_graph_runs")
    op.drop_column("node_graph_runs", "idempotency_key")
