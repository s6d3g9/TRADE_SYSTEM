"""add node graphs

Revision ID: 20251222_07
Revises: 20251222_06
Create Date: 2025-12-22

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20251222_07"
down_revision = "20251222_06"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "node_graphs",
        sa.Column("graph_id", sa.String(), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.user_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("scope", sa.String(), nullable=False, server_default="user"),
        sa.Column("owner_id", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_node_graphs_user_created", "node_graphs", ["user_id", "created_at"])
    op.create_index("ix_node_graphs_scope_owner", "node_graphs", ["scope", "owner_id"])
    op.create_index("ix_node_graphs_user_id", "node_graphs", ["user_id"])

    op.create_table(
        "node_graph_versions",
        sa.Column("version_id", sa.String(), primary_key=True),
        sa.Column(
            "graph_id",
            sa.String(),
            sa.ForeignKey("node_graphs.graph_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("definition", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_node_graph_versions_graph_created",
        "node_graph_versions",
        ["graph_id", "created_at"],
    )
    op.create_index(
        "ix_node_graph_versions_graph_version",
        "node_graph_versions",
        ["graph_id", "version"],
    )
    op.create_index("ix_node_graph_versions_graph_id", "node_graph_versions", ["graph_id"])

    op.create_table(
        "node_graph_runs",
        sa.Column("run_id", sa.String(), primary_key=True),
        sa.Column(
            "graph_id",
            sa.String(),
            sa.ForeignKey("node_graphs.graph_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "version_id",
            sa.String(),
            sa.ForeignKey("node_graph_versions.version_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.user_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(), nullable=False, server_default="queued"),
        sa.Column("inputs", sa.JSON(), nullable=False),
        sa.Column("outputs", sa.JSON(), nullable=False),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_node_graph_runs_user_created", "node_graph_runs", ["user_id", "created_at"])
    op.create_index("ix_node_graph_runs_graph_created", "node_graph_runs", ["graph_id", "created_at"])
    op.create_index("ix_node_graph_runs_status", "node_graph_runs", ["status"])
    op.create_index("ix_node_graph_runs_graph_id", "node_graph_runs", ["graph_id"])
    op.create_index("ix_node_graph_runs_version_id", "node_graph_runs", ["version_id"])
    op.create_index("ix_node_graph_runs_user_id", "node_graph_runs", ["user_id"])

    op.create_table(
        "node_graph_run_nodes",
        sa.Column("run_node_id", sa.String(), primary_key=True),
        sa.Column(
            "run_id",
            sa.String(),
            sa.ForeignKey("node_graph_runs.run_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("node_id", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="queued"),
        sa.Column("inputs", sa.JSON(), nullable=False),
        sa.Column("outputs", sa.JSON(), nullable=False),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_node_graph_run_nodes_run", "node_graph_run_nodes", ["run_id"])
    op.create_index("ix_node_graph_run_nodes_run_node", "node_graph_run_nodes", ["run_id", "node_id"])
    op.create_index("ix_node_graph_run_nodes_status", "node_graph_run_nodes", ["status"])


def downgrade() -> None:
    op.drop_index("ix_node_graph_run_nodes_status", table_name="node_graph_run_nodes")
    op.drop_index("ix_node_graph_run_nodes_run_node", table_name="node_graph_run_nodes")
    op.drop_index("ix_node_graph_run_nodes_run", table_name="node_graph_run_nodes")
    op.drop_table("node_graph_run_nodes")

    op.drop_index("ix_node_graph_runs_user_id", table_name="node_graph_runs")
    op.drop_index("ix_node_graph_runs_version_id", table_name="node_graph_runs")
    op.drop_index("ix_node_graph_runs_graph_id", table_name="node_graph_runs")
    op.drop_index("ix_node_graph_runs_status", table_name="node_graph_runs")
    op.drop_index("ix_node_graph_runs_graph_created", table_name="node_graph_runs")
    op.drop_index("ix_node_graph_runs_user_created", table_name="node_graph_runs")
    op.drop_table("node_graph_runs")

    op.drop_index("ix_node_graph_versions_graph_id", table_name="node_graph_versions")
    op.drop_index("ix_node_graph_versions_graph_version", table_name="node_graph_versions")
    op.drop_index("ix_node_graph_versions_graph_created", table_name="node_graph_versions")
    op.drop_table("node_graph_versions")

    op.drop_index("ix_node_graphs_user_id", table_name="node_graphs")
    op.drop_index("ix_node_graphs_scope_owner", table_name="node_graphs")
    op.drop_index("ix_node_graphs_user_created", table_name="node_graphs")
    op.drop_table("node_graphs")
