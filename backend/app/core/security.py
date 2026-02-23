from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import settings


_password_hasher = PasswordHasher()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(*, subject: str, claims: dict[str, Any] | None = None) -> str:
    now = _utcnow()
    exp = now + timedelta(minutes=settings.auth_access_token_ttl_minutes)
    payload: dict[str, Any] = {
        "iss": settings.auth_jwt_issuer,
        "aud": settings.auth_jwt_audience,
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    if claims:
        payload.update(claims)
    return jwt.encode(payload, settings.auth_jwt_secret, algorithm="HS256")


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.auth_jwt_secret,
            algorithms=["HS256"],
            audience=settings.auth_jwt_audience,
            issuer=settings.auth_jwt_issuer,
        )
        if not isinstance(payload, dict):
            raise JWTError("Invalid payload")
        return payload
    except JWTError as exc:
        raise ValueError("Invalid token") from exc


def hash_login_token(raw_token: str) -> str:
    # Hash with a static secret so DB leaks don't allow token reuse.
    material = f"{raw_token}:{settings.auth_jwt_secret}".encode("utf-8")
    return hashlib.sha256(material).hexdigest()


def seed_phrase_fingerprint(mnemonic_phrase: str) -> str:
    """Derive a stable fingerprint for a seed phrase.

    We never store the phrase itself, only this fingerprint.
    """

    normalized = " ".join(mnemonic_phrase.lower().strip().split())
    material = f"seed:{normalized}:{settings.auth_jwt_secret}".encode("utf-8")
    return hashlib.sha256(material).hexdigest()


def hash_password(password: str) -> str:
    password = password.strip()
    if not password:
        raise ValueError("Empty password")
    return _password_hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return bool(_password_hasher.verify(password_hash, password))
    except VerifyMismatchError:
        return False
