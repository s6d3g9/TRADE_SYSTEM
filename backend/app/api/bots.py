from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.neuro import NeuroProvider, ProviderBinding
from app.schemas.neuro import AttachProviderRequest

router = APIRouter(prefix="/bots", tags=["bots"])


@router.post("/{bot_id}/attach-provider")
async def attach_provider(bot_id: str, req: AttachProviderRequest, session: AsyncSession = Depends(get_db)) -> dict[str, object]:
    if req.provider_id:
        provider = await session.get(NeuroProvider, req.provider_id)
        if not provider:
            raise HTTPException(status_code=404, detail="provider not found")

    binding = await session.scalar(select(ProviderBinding).where(ProviderBinding.bot_id == bot_id))
    now = datetime.now(timezone.utc)

    if binding:
        binding.provider_id = req.provider_id
        binding.overrides = req.overrides
        binding.enabled = req.enabled
        binding.updated_at = now
    else:
        binding = ProviderBinding(
            binding_id=f"{bot_id}:default",
            bot_id=bot_id,
            provider_id=req.provider_id,
            overrides=req.overrides,
            enabled=req.enabled,
            updated_at=now,
        )
        session.add(binding)

    await session.commit()
    await session.refresh(binding)
    return {
        "binding_id": binding.binding_id,
        "bot_id": binding.bot_id,
        "provider_id": binding.provider_id,
        "overrides": binding.overrides,
        "enabled": binding.enabled,
        "updated_at": binding.updated_at.isoformat(),
    }


@router.get("/{bot_id}/provider")
async def get_provider_for_bot(bot_id: str, session: AsyncSession = Depends(get_db)) -> dict[str, object]:
    binding = await session.scalar(select(ProviderBinding).where(ProviderBinding.bot_id == bot_id))
    if not binding:
        return {"bot_id": bot_id, "provider_id": None}
    return {
        "binding_id": binding.binding_id,
        "bot_id": binding.bot_id,
        "provider_id": binding.provider_id,
        "overrides": binding.overrides,
        "enabled": binding.enabled,
        "updated_at": binding.updated_at.isoformat(),
    }
