from __future__ import annotations

import time
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing_extensions import Literal

from app.core.config import settings
from app.api.deps import maybe_current_user
from app.core.db import get_db
from app.models.user import User
from app.models.user_settings import UserSettings
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/ai", tags=["ai"])

# Simple in-process cache to avoid hammering OpenRouter.
# Nginx/uvicorn topology may mean multiple workers; this is still fine as a best-effort cache.
_OPENROUTER_MODELS_CACHE: dict[str, Any] | None = None
_OPENROUTER_MODELS_CACHE_TS: float | None = None
_OPENROUTER_MODELS_TTL_SECONDS = 60 * 10


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    provider: Literal["openrouter", "openai", "local"] = "openrouter"
    token: str | None = Field(default=None, description="Provider API token (Bearer).")
    model: str | None = Field(default=None, description="Provider model id.")
    messages: list[ChatMessage]
    max_tokens: int = 800
    temperature: float = 0.2
    response_format: dict[str, Any] | None = Field(
        default=None,
        description="Optional OpenAI-style response_format passthrough (e.g. {type: 'json_object'}).",
    )


class ChatResponse(BaseModel):
    content: str
    provider: str
    model: str | None = None


def _extract_error_message(resp: httpx.Response) -> str:
    """Best-effort parse of upstream provider error payloads."""
    raw = resp.text or ""
    try:
        payload = resp.json()
    except Exception:
        payload = None

    # OpenAI-style: {"error": {"message": "...", "code": "..."}}
    if isinstance(payload, dict):
        err = payload.get("error")
        if isinstance(err, dict):
            msg = err.get("message")
            code = err.get("code")
            if isinstance(msg, str) and msg.strip():
                if code:
                    return f"{msg} (code: {code})"
                return msg

        # Some gateways: {"message": "..."}
        msg2 = payload.get("message")
        if isinstance(msg2, str) and msg2.strip():
            return msg2

    if raw.strip():
        # Avoid dumping huge JSON blobs into the UI; cap it.
        return raw.strip()[:2000]
    return f"Upstream provider error (HTTP {resp.status_code})"


def _provider_api_url(provider: str) -> str:
    if provider == "openrouter":
        return "https://openrouter.ai/api/v1/chat/completions"
    if provider == "openai":
        return "https://api.openai.com/v1/chat/completions"
    if provider == "local":
        if not settings.ai_models_api_url:
            raise HTTPException(status_code=500, detail="Local AI provider is not configured")
        return settings.ai_models_api_url
    raise HTTPException(status_code=400, detail="Unsupported provider")


def _effective_token(provider: str, token: str | None) -> str:
    def _normalize(v: str) -> str:
        s = (v or "").strip()
        # Users often paste full header value. Accept it.
        if s.lower().startswith("bearer "):
            s = s[7:].strip()
        return s

    if token:
        t = _normalize(token)
        if t:
            return t
    if provider == "local" and settings.ai_models_token:
        t = _normalize(settings.ai_models_token)
        if t:
            return t
    # saved token (matching provider)
    # NOTE: only available when user is authenticated
    
    raise HTTPException(status_code=400, detail="Missing AI provider token")


def _effective_model(provider: str, model: str | None) -> str:
    if model:
        return model
    if provider == "local" and settings.ai_models_model:
        return settings.ai_models_model
    raise HTTPException(status_code=400, detail="Missing AI model")


async def _user_saved_ai(session: AsyncSession, user: User | None) -> UserSettings | None:
    if not user:
        return None
    return await session.get(UserSettings, user.user_id)


@router.post("/chat", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    session: AsyncSession = Depends(get_db),
    user: User | None = Depends(maybe_current_user),
) -> ChatResponse:
    api_url = _provider_api_url(req.provider)
    saved = await _user_saved_ai(session, user)

    # Token: request overrides, else saved (matching provider), else env (local).
    token_candidate = req.token
    if not token_candidate and saved and saved.ai_provider == req.provider and saved.ai_token:
        token_candidate = saved.ai_token
    token = _effective_token(req.provider, token_candidate)

    # Model: request overrides, else saved (OpenRouter, matching provider), else defaults.
    model_candidate = req.model
    if (
        not model_candidate
        and req.provider == "openrouter"
        and saved
        and saved.ai_provider == "openrouter"
        and saved.openrouter_model_id
    ):
        model_candidate = saved.openrouter_model_id
    if not model_candidate and req.provider == "openai":
        model_candidate = "gpt-4o-mini"
    model = _effective_model(req.provider, model_candidate)

    payload = {
        "model": model,
        "messages": [m.model_dump() for m in req.messages],
        "max_tokens": req.max_tokens,
        "temperature": req.temperature,
    }

    if req.response_format is not None:
        payload["response_format"] = req.response_format

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    # OpenRouter supports optional identification headers; best-effort.
    if req.provider == "openrouter":
        headers.setdefault("X-Title", "TRADE_SYSTEM")

    timeout = httpx.Timeout(30.0, read=90.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.post(api_url, headers=headers, json=payload)
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"AI request failed: {exc}")

    if resp.status_code >= 400:
        msg = _extract_error_message(resp)
        # Preserve upstream status for rate-limit/debuggability.
        status = resp.status_code if 400 <= resp.status_code <= 599 else 502
        
        # If upstream returns 401/403 (Invalid API Key), we should not return 401 to frontend
        # because frontend 'http' client interprets 401 as "App Session Expired" and redirects to login.
        if status in (401, 403):
            # 400 Bad Request is appropriate for invalid input (bad token)
            status = 400 

        raise HTTPException(
            status_code=status,
            detail={
                "error": "provider_error",
                "provider": req.provider,
                "status": status,
                "message": msg,
            },
        )

    data = resp.json()
    choice = (data.get("choices") or [{}])[0]
    content = (choice.get("message") or {}).get("content")
    if not content:
        raise HTTPException(status_code=502, detail="AI returned empty content")

    return ChatResponse(content=content, provider=req.provider, model=model)


@router.get("/openrouter/models")
async def list_openrouter_models() -> dict:
    global _OPENROUTER_MODELS_CACHE, _OPENROUTER_MODELS_CACHE_TS

    now = time.time()
    if _OPENROUTER_MODELS_CACHE is not None and _OPENROUTER_MODELS_CACHE_TS is not None:
        if now - _OPENROUTER_MODELS_CACHE_TS < _OPENROUTER_MODELS_TTL_SECONDS:
            return _OPENROUTER_MODELS_CACHE

    url = "https://openrouter.ai/api/v1/models"

    timeout = httpx.Timeout(15.0, read=30.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.get(
                url,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "TRADE_SYSTEM/0.1",
                },
            )
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"OpenRouter request failed: {exc}")

    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"OpenRouter error: HTTP {resp.status_code}")

    try:
        payload = resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"OpenRouter invalid JSON: {exc}")

    data = payload.get("data")
    if not isinstance(data, list):
        raise HTTPException(status_code=502, detail="OpenRouter response missing 'data' list")

    def _to_float(v: Any) -> float | None:
        if v is None:
            return None
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, str):
            try:
                return float(v)
            except ValueError:
                return None
        return None

    def _is_free(pricing: Any) -> bool:
        if not isinstance(pricing, dict):
            return False
        # OpenRouter commonly returns pricing like: {"prompt":"0", "completion":"0", ...}
        prompt = _to_float(pricing.get("prompt"))
        completion = _to_float(pricing.get("completion"))
        request = _to_float(pricing.get("request"))

        # Consider free only when known token costs are 0.
        # If fields are missing/unknown, do not assume free.
        token_fields = [v for v in (prompt, completion) if v is not None]
        if not token_fields:
            return False
        if any(v != 0.0 for v in token_fields):
            return False
        if request is not None and request != 0.0:
            return False
        return True

    models: list[dict[str, Any]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        model_id = item.get("id")
        name = item.get("name")
        if not model_id or not isinstance(model_id, str):
            continue
        if not name or not isinstance(name, str):
            name = model_id
        pricing = item.get("pricing")
        models.append(
            {
                "id": model_id,
                "name": name,
                "is_free": _is_free(pricing),
                "context_length": item.get("context_length"),
                "pricing": pricing,
            }
        )

    models.sort(key=lambda m: (m.get("name") or m.get("id") or ""))

    result = {"models": models, "source": "openrouter"}
    _OPENROUTER_MODELS_CACHE = result
    _OPENROUTER_MODELS_CACHE_TS = now
    return result
