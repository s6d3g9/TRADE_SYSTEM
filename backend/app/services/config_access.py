from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError
from app.models.trading import Bot


async def assert_scope_owner_access(
    session: AsyncSession,
    *,
    scope: str,
    owner_id: str,
    user_id: str,
) -> None:
    """Authorize access to config scope/owner pair.

    Policy:
    - strategy, model: shared catalog (read/write allowed for authenticated users).
    - alignment: only owners with at least one bot linked to alignment.
    """

    if scope in {"strategy", "model"}:
        return

    if scope == "alignment":
        found = (
            await session.execute(
                select(Bot.bot_id).where(Bot.alignment_id == owner_id, Bot.user_id == user_id).limit(1)
            )
        ).first()
        if found is None:
            raise ForbiddenError("Config access denied")
        return

    raise ForbiddenError("Config access denied")
