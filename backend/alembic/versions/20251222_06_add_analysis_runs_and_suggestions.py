"""add analysis runs and tuning suggestions

Revision ID: 20251222_06
Revises: 20251222_05
Create Date: 2025-12-22

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision = "20251222_06"
down_revision = "20251222_05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "analysis_runs",
        sa.Column("run_id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(), nullable=False, server_default="compare"),
        sa.Column("status", sa.String(), nullable=False, server_default="queued"),
        sa.Column("inputs", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("outputs", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("evidence", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index("ix_analysis_runs_user_created", "analysis_runs", ["user_id", "created_at"], unique=False)
    op.create_index("ix_analysis_runs_kind", "analysis_runs", ["kind"], unique=False)
    op.create_index("ix_analysis_runs_status", "analysis_runs", ["status"], unique=False)

    op.create_table(
        "tuning_suggestions",
        sa.Column("suggestion_id", sa.String(), primary_key=True),
        sa.Column("run_id", sa.String(), sa.ForeignKey("analysis_runs.run_id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_scope", sa.String(), nullable=False),
        sa.Column("owner_id", sa.String(), nullable=False),
        sa.Column("base_config_id", sa.String(), sa.ForeignKey("config_files.config_id", ondelete="SET NULL"), nullable=True),
        sa.Column(
            "proposed_config_id",
            sa.String(),
            sa.ForeignKey("config_files.config_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("proposed_patch", sa.JSON(), nullable=True),
        sa.Column("expected_impact", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("risk_notes", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("state", sa.String(), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_index("ix_tuning_suggestions_run", "tuning_suggestions", ["run_id"], unique=False)
    op.create_index("ix_tuning_suggestions_state", "tuning_suggestions", ["state"], unique=False)
    op.create_index("ix_tuning_suggestions_target", "tuning_suggestions", ["target_scope", "owner_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_tuning_suggestions_target", table_name="tuning_suggestions")
    op.drop_index("ix_tuning_suggestions_state", table_name="tuning_suggestions")
    op.drop_index("ix_tuning_suggestions_run", table_name="tuning_suggestions")
    op.drop_table("tuning_suggestions")

    op.drop_index("ix_analysis_runs_status", table_name="analysis_runs")
    op.drop_index("ix_analysis_runs_kind", table_name="analysis_runs")
    op.drop_index("ix_analysis_runs_user_created", table_name="analysis_runs")
    op.drop_table("analysis_runs")
