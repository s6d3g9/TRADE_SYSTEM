from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class EmailLoginToken(Base):
    __tablename__ = "email_login_tokens"

    token_id: Mapped[str] = mapped_column(String, primary_key=True)

    email: Mapped[str] = mapped_column(String, index=True, nullable=False)
    user_id: Mapped[str | None] = mapped_column(String, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)

    token_hash: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    ip: Mapped[str | None] = mapped_column(String, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String, nullable=True)

    __table_args__ = (
        Index("ix_email_login_tokens_email_expires", "email", "expires_at"),
        Index("ix_email_login_tokens_user_expires", "user_id", "expires_at"),
    )
