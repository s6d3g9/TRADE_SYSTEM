from __future__ import annotations

from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import decode_access_token
from app.models.user import User


def _get_bearer_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization")
    if not auth:
        return None
    parts = auth.split(" ", 1)
    if len(parts) != 2:
        return None
    scheme, value = parts[0].lower(), parts[1]
    if scheme != "bearer":
        return None
    return value


async def get_current_user(request: Request, session: AsyncSession = Depends(get_db)) -> User:
    token = _get_bearer_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def maybe_current_user(request: Request, session: AsyncSession = Depends(get_db)) -> User | None:
    token = _get_bearer_token(request)
    if not token:
        return None
    try:
        payload = decode_access_token(token)
    except Exception:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    return await session.get(User, user_id)
