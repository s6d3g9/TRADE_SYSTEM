from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.trading import Bot, Backtest, ExchangeAccount


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[str] = mapped_column(String, primary_key=True)

    email: Mapped[str | None] = mapped_column(String, unique=True, index=True, nullable=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    name: Mapped[str | None] = mapped_column(String, nullable=True)
    picture_url: Mapped[str | None] = mapped_column(String, nullable=True)

    google_sub: Mapped[str | None] = mapped_column(String, unique=True, index=True, nullable=True)

    seed_fingerprint: Mapped[str | None] = mapped_column(String, unique=True, index=True, nullable=True)

    password_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    password_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)

    # Relationships
    bots: Mapped[list["Bot"]] = relationship("Bot", back_populates="user", lazy="noload")
    backtests: Mapped[list["Backtest"]] = relationship("Backtest", back_populates="user", lazy="noload")
    exchange_accounts: Mapped[list["ExchangeAccount"]] = relationship("ExchangeAccount", back_populates="user", lazy="noload")

    __table_args__ = (
        Index("ix_users_email_verified", "email", "email_verified"),
        Index("ix_users_seed_fingerprint", "seed_fingerprint"),
    )
