"""create strategylab catalog tables

Revision ID: 20251217_01
Revises: 20241216_02
Create Date: 2025-12-17

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20251217_01"
down_revision = "20241216_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "strategy_templates",
        sa.Column("strategy_id", sa.String(), primary_key=True),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("source_type", sa.String(), nullable=False, server_default="git"),
        sa.Column("source_url", sa.String(), nullable=False),
        sa.Column("source_ref", sa.String(), nullable=True),
        sa.Column("strategy_class", sa.String(), nullable=True),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("meta", sa.JSON(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("slug", name="uq_strategy_templates_slug"),
    )

    op.create_table(
        "freqai_model_variants",
        sa.Column("model_id", sa.String(), primary_key=True),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("algorithm", sa.String(), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("slug", name="uq_freqai_model_variants_slug"),
    )

    op.create_table(
        "strategy_alignments",
        sa.Column("alignment_id", sa.String(), primary_key=True),
        sa.Column(
            "strategy_id",
            sa.String(),
            sa.ForeignKey("strategy_templates.strategy_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "model_id",
            sa.String(),
            sa.ForeignKey("freqai_model_variants.model_id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("profile", sa.String(), nullable=True),
        sa.Column("scope", sa.JSON(), nullable=True),
        sa.Column("defaults", sa.JSON(), nullable=True),
        sa.Column("mapping", sa.JSON(), nullable=True),
        sa.Column("freqtrade_overrides", sa.JSON(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("freqai_overrides", sa.JSON(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_index("ix_strategy_alignments_strategy_id", "strategy_alignments", ["strategy_id"])
    op.create_index("ix_strategy_alignments_model_id", "strategy_alignments", ["model_id"])


def downgrade() -> None:
    op.drop_index("ix_strategy_alignments_model_id", table_name="strategy_alignments")
    op.drop_index("ix_strategy_alignments_strategy_id", table_name="strategy_alignments")
    op.drop_table("strategy_alignments")
    op.drop_table("freqai_model_variants")
    op.drop_table("strategy_templates")
