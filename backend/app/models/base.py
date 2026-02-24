from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def new_id() -> str:
    return uuid4().hex

class Base(DeclarativeBase):
    """
    Базовый класс для всех SQLAlchemy моделей (Data Layer).
    """
    pass

class TimestampMixin:
    """
    Миксин для автоматического добавления полей created_at и updated_at.
    Используется для всех сущностей, где важно отслеживать время изменения
    (например, стратегии, боты, сессии).
    """
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now(), 
        nullable=False,
        comment="Время создания записи"
    )
    
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now(), 
        onupdate=func.now(), 
        nullable=False,
        comment="Время последнего обновления записи"
    )
