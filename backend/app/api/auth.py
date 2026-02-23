from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from uuid import uuid4

import httpx
from pydantic import BaseModel
from mnemonic import Mnemonic
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.core.emailer import send_email_async
from app.core.redis import get_redis
from app.core.security import create_access_token, decode_access_token, hash_login_token, hash_password, seed_phrase_fingerprint, verify_password
from app.models.email_login import EmailLoginToken
from app.models.user import User
from app.models.user_settings import UserSettings
from app.api.deps import get_current_user
from app.schemas.auth import (
    EmailLoginStartIn,
    EmailLoginStartOut,
    EmailLoginVerifyIn,
    MeOut,
    PasswordLoginIn,
    PasswordRegisterIn,
    PasswordRegisterOut,
    PasswordResetIn,
    TokenOut,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])


# NOTE: keep settings schemas local to avoid expanding public API surface too much.
class MeSettingsOut(BaseModel):
    ai_provider: str | None = None
    openrouter_model_id: str | None = None
    has_ai_token: bool = False


class MeSettingsUpdate(BaseModel):
    ai_provider: str | None = None
    openrouter_model_id: str | None = None
    ai_token: str | None = None


_mnemo = Mnemonic("english")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _issue_token_for_user(user: User) -> TokenOut:
    token = create_access_token(
        subject=user.user_id,
        claims={
            "email": user.email,
            "email_verified": bool(user.email_verified),
            "name": user.name,
        },
    )
    return TokenOut(access_token=token)


@router.post("/seed/generate")
async def seed_generate() -> dict:
    # 128 bits entropy => 12 words.
    phrase = _mnemo.generate(strength=128)
    return {"mnemonic": phrase}


@router.post("/password/register", response_model=PasswordRegisterOut)
async def password_register(p: PasswordRegisterIn, session: AsyncSession = Depends(get_db)) -> PasswordRegisterOut:
    email = p.email.lower().strip()

    # Prevent overwriting existing accounts.
    result = await session.execute(select(User).where(User.email == email))
    existing: User | None = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")

    recovery_mnemonic = _mnemo.generate(strength=128)
    seed_fp = seed_phrase_fingerprint(recovery_mnemonic)

    user = User(
        user_id=str(uuid4()),
        email=email,
        email_verified=False,
        seed_fingerprint=seed_fp,
        password_hash=hash_password(p.password),
        password_updated_at=_utcnow(),
    )
    session.add(user)
    await session.commit()

    token = (await _issue_token_for_user(user)).access_token
    return PasswordRegisterOut(access_token=token, recovery_mnemonic=recovery_mnemonic)


@router.post("/password/login", response_model=TokenOut)
async def password_login(p: PasswordLoginIn, session: AsyncSession = Depends(get_db)) -> TokenOut:
    email = p.email.lower().strip()
    result = await session.execute(select(User).where(User.email == email))
    user: User | None = result.scalar_one_or_none()
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(user.password_hash, p.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return await _issue_token_for_user(user)


@router.post("/password/reset", response_model=TokenOut)
async def password_reset(p: PasswordResetIn, session: AsyncSession = Depends(get_db)) -> TokenOut:
    email = p.email.lower().strip()

    # Generic error messages to reduce enumeration.
    result = await session.execute(select(User).where(User.email == email))
    user: User | None = result.scalar_one_or_none()
    if not user or not user.seed_fingerprint:
        raise HTTPException(status_code=400, detail="Invalid recovery details")

    recovery = p.recovery_mnemonic.strip()
    if not _mnemo.check(recovery):
        raise HTTPException(status_code=400, detail="Invalid recovery details")

    fp = seed_phrase_fingerprint(recovery)
    if fp != user.seed_fingerprint:
        raise HTTPException(status_code=400, detail="Invalid recovery details")

    user.password_hash = hash_password(p.new_password)
    user.password_updated_at = _utcnow()
    await session.commit()
    return await _issue_token_for_user(user)


async def _get_user_by_jwt(session: AsyncSession, token: str) -> User:
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


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


@router.get("/me", response_model=MeOut)
async def me(request: Request, session: AsyncSession = Depends(get_db)) -> MeOut:
    token = _get_bearer_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    user = await _get_user_by_jwt(session, token)
    return MeOut(user=UserOut.model_validate(user, from_attributes=True))


@router.get("/me/settings", response_model=MeSettingsOut)
async def me_settings(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MeSettingsOut:
    row = await session.get(UserSettings, user.user_id)
    if not row:
        return MeSettingsOut(ai_provider=None, openrouter_model_id=None, has_ai_token=False)
    return MeSettingsOut(
        ai_provider=row.ai_provider,
        openrouter_model_id=row.openrouter_model_id,
        has_ai_token=bool(row.ai_token),
    )


@router.put("/me/settings", response_model=MeSettingsOut)
async def me_settings_update(
    patch: MeSettingsUpdate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MeSettingsOut:
    row = await session.get(UserSettings, user.user_id)
    if not row:
        row = UserSettings(user_id=user.user_id)
        session.add(row)

    if patch.ai_provider is not None:
        row.ai_provider = patch.ai_provider or None
    if patch.openrouter_model_id is not None:
        row.openrouter_model_id = patch.openrouter_model_id or None
    if patch.ai_token is not None:
        token = patch.ai_token.strip()
        row.ai_token = token or None

    await session.commit()
    await session.refresh(row)

    return MeSettingsOut(
        ai_provider=row.ai_provider,
        openrouter_model_id=row.openrouter_model_id,
        has_ai_token=bool(row.ai_token),
    )


@router.post("/email/start", response_model=EmailLoginStartOut)
async def email_login_start(
    p: EmailLoginStartIn,
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
) -> EmailLoginStartOut:
    # Always return ok to prevent user enumeration.
    email = p.email.lower().strip()

    raw_token = secrets.token_urlsafe(32)
    token_hash = hash_login_token(raw_token)

    expires_at = _utcnow() + timedelta(minutes=settings.email_login_token_ttl_minutes)

    # Attempt to attach existing user_id if user exists.
    result = await session.execute(select(User).where(User.email == email))
    user: User | None = result.scalar_one_or_none()

    login_token = EmailLoginToken(
        token_id=str(uuid4()),
        email=email,
        user_id=user.user_id if user else None,
        token_hash=token_hash,
        expires_at=expires_at,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("User-Agent"),
    )
    session.add(login_token)
    await session.commit()

    verify_url = f"{settings.frontend_base_url}/auth/callback?{urlencode({'email_token': raw_token})}"
    background_tasks.add_task(
        send_email_async,
        to_email=email,
        subject="Confirm your email for TRADE_SYSTEM",
        body_text=(
            f"Confirm your email by opening this link (expires in {settings.email_login_token_ttl_minutes} minutes):\n\n"
            f"{verify_url}\n\n"
            "If you did not request this, you can ignore this email."
        ),
    )

    return EmailLoginStartOut(ok=True)


@router.post("/email/verify", response_model=TokenOut)
async def email_login_verify(p: EmailLoginVerifyIn, request: Request, session: AsyncSession = Depends(get_db)) -> TokenOut:
    raw_token = p.token.strip()
    if not raw_token:
        raise HTTPException(status_code=400, detail="Missing token")

    token_hash = hash_login_token(raw_token)
    result = await session.execute(select(EmailLoginToken).where(EmailLoginToken.token_hash == token_hash))
    row: EmailLoginToken | None = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=400, detail="Invalid token")

    now = _utcnow()
    if row.consumed_at is not None:
        raise HTTPException(status_code=400, detail="Token already used")
    if row.expires_at < now:
        raise HTTPException(status_code=400, detail="Token expired")

    # Upsert user by email.
    email = row.email
    result = await session.execute(select(User).where(User.email == email))
    user: User | None = result.scalar_one_or_none()
    if not user:
        user = User(user_id=str(uuid4()), email=email, email_verified=True)
        session.add(user)
        await session.flush()
    else:
        user.email_verified = True

    row.user_id = user.user_id
    row.consumed_at = now
    await session.commit()

    return await _issue_token_for_user(user)


@router.get("/google/login")
async def google_login(next: str | None = None):
    if not settings.google_oauth_client_id or not settings.google_oauth_redirect_uri:
        raise HTTPException(status_code=400, detail="Google OAuth not configured")

    state = secrets.token_urlsafe(16)

    # Store state in redis with short TTL to protect callback.
    redis = get_redis()
    payload = {"next": next or "/"}
    await redis.set(f"oauth:google:state:{state}", str(payload), ex=600)

    params = {
        "client_id": settings.google_oauth_client_id,
        "redirect_uri": settings.google_oauth_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }

    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
    return {"auth_url": url}


@router.get("/google/callback")
async def google_callback(code: str | None = None, state: str | None = None, session: AsyncSession = Depends(get_db)):
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code/state")
    if not settings.google_oauth_client_id or not settings.google_oauth_client_secret or not settings.google_oauth_redirect_uri:
        raise HTTPException(status_code=400, detail="Google OAuth not configured")

    redis = get_redis()
    key = f"oauth:google:state:{state}"
    saved = await redis.get(key)
    if not saved:
        raise HTTPException(status_code=400, detail="Invalid state")
    await redis.delete(key)

    token_resp = None
    async with httpx.AsyncClient(timeout=20) as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_oauth_client_id,
                "client_secret": settings.google_oauth_client_secret,
                "redirect_uri": settings.google_oauth_redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        token_resp.raise_for_status()
        token_data = token_resp.json()

        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="Missing access_token")

        userinfo = await client.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        userinfo.raise_for_status()
        info = userinfo.json()

    google_sub = info.get("sub")
    email = (info.get("email") or "").lower().strip()
    if not google_sub or not email:
        raise HTTPException(status_code=400, detail="Invalid user info")

    name = info.get("name")
    picture = info.get("picture")
    email_verified = bool(info.get("email_verified"))

    # Upsert user by google_sub (preferred) then by email.
    result = await session.execute(select(User).where(User.google_sub == google_sub))
    user: User | None = result.scalar_one_or_none()

    if not user:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

    if not user:
        user = User(user_id=str(uuid4()), email=email, email_verified=email_verified, google_sub=google_sub, name=name, picture_url=picture)
        session.add(user)
    else:
        user.google_sub = google_sub
        user.email = email
        user.email_verified = user.email_verified or email_verified
        if name:
            user.name = name
        if picture:
            user.picture_url = picture

    await session.commit()

    token = (await _issue_token_for_user(user)).access_token

    # Redirect back to frontend callback.
    redirect = f"{settings.frontend_base_url}/auth/callback?{urlencode({'access_token': token})}"
    return RedirectResponse(url=redirect, status_code=302)
