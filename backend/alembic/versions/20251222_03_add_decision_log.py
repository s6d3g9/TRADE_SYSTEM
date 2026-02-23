"""add decision_log to trades and positions

Revision ID: 20251222_03
Revises: 20251222_02
Create Date: 2025-12-22

Adds decision_log field to trades and positions as per README_DATA_STORAGE_STRATEGIES.md.
This stores the reason for opening a trade/position including:
- reason (text description)
- signal_id (reference to signal that triggered)
- market_regime (bull, bear, flat, regular)
- indicators (dict of indicator values)
- freqai_prediction (model prediction)
- confidence (prediction confidence)
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20251222_03"
down_revision = "20251222_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add decision_log to trades
    op.add_column(
        "trades",
        sa.Column("decision_log", sa.JSON(), nullable=True),
    )

    # Add decision_log to positions
    op.add_column(
        "positions",
        sa.Column("decision_log", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("positions", "decision_log")
    op.drop_column("trades", "decision_log")
