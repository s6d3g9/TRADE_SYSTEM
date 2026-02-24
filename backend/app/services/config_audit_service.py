from __future__ import annotations

from datetime import datetime

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategylab import ConfigAuditEvent, ConfigFile
from app.services.config_access import assert_scope_owner_access


async def record_config_audit_event(
    session: AsyncSession,
    *,
    user_id: str,
    action: str,
    scope: str,
    owner_id: str,
    config_id: str | None,
    details: dict,
) -> ConfigAuditEvent:
    event = ConfigAuditEvent(
        config_id=config_id,
        user_id=user_id,
        scope=scope,
        owner_id=owner_id,
        action=action,
        details=details or {},
    )
    session.add(event)
    return event


async def list_config_audit_events(
    session: AsyncSession,
    *,
    config_id: str,
    user_id: str,
    limit: int,
    offset: int,
    action: str | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
) -> list[ConfigAuditEvent]:
    cfg = await session.get(ConfigFile, config_id)
    if not cfg:
        return []

    await assert_scope_owner_access(session, scope=cfg.scope, owner_id=cfg.owner_id, user_id=user_id)

    stmt = select(ConfigAuditEvent).where(ConfigAuditEvent.config_id == config_id)
    if action:
        stmt = stmt.where(ConfigAuditEvent.action == action)
    if created_from:
        stmt = stmt.where(ConfigAuditEvent.created_at >= created_from)
    if created_to:
        stmt = stmt.where(ConfigAuditEvent.created_at <= created_to)

    return (
        await session.execute(
            stmt.order_by(desc(ConfigAuditEvent.created_at)).limit(limit).offset(offset)
        )
    ).scalars().all()
