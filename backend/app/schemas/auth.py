from __future__ import annotations

from pydantic import BaseModel, EmailStr


class PasswordRegisterIn(BaseModel):
    email: EmailStr
    password: str


class PasswordRegisterOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    recovery_mnemonic: str


class PasswordLoginIn(BaseModel):
    email: EmailStr
    password: str


class PasswordResetIn(BaseModel):
    email: EmailStr
    recovery_mnemonic: str
    new_password: str


class EmailLoginStartIn(BaseModel):
    email: EmailStr


class EmailLoginStartOut(BaseModel):
    ok: bool = True


class EmailLoginVerifyIn(BaseModel):
    token: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    user_id: str
    email: EmailStr | None = None
    email_verified: bool
    name: str | None = None
    picture_url: str | None = None


class MeOut(BaseModel):
    user: UserOut
