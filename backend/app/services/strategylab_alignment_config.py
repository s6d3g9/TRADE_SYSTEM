from __future__ import annotations

from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategylab import ConfigFile, FreqAIModelVariant, StrategyAlignment, StrategyTemplate
from app.schemas.strategylab import ConfigFileOut
from app.services.service_errors import ServiceError
from app.services.config_materializer import materialize_config_params


def deep_merge(base: dict, override: dict) -> dict:
    out: dict = dict(base)
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def validate_freqtrade_config_payload(payload: dict) -> None:
    if not isinstance(payload, dict):
        raise ServiceError(status_code=400, detail="config must be an object")
    if "strategy" not in payload or not isinstance(payload.get("strategy"), str):
        raise ServiceError(status_code=400, detail="config.strategy must be string")
    if "freqai" in payload and payload.get("freqai") is not None and not isinstance(payload.get("freqai"), dict):
        raise ServiceError(status_code=400, detail="config.freqai must be object")


async def build_combined_alignment_config(alignment_id: str, session: AsyncSession) -> dict:
    """Combine active strategy+model configs with alignment overrides into one config and store as active."""

    a = await session.get(StrategyAlignment, alignment_id)
    if not a:
        raise ServiceError(status_code=404, detail="alignment not found")
    s = await session.get(StrategyTemplate, a.strategy_id)
    m = await session.get(FreqAIModelVariant, a.model_id)
    if not s or not m:
        raise ServiceError(status_code=400, detail="alignment references missing strategy/model")

    strategy_cfg = (
        await session.execute(
            select(ConfigFile)
            .where(ConfigFile.scope == "strategy", ConfigFile.owner_id == s.strategy_id, ConfigFile.is_active.is_(True))
            .order_by(ConfigFile.updated_at.desc())
        )
    ).scalars().first()
    model_cfg = (
        await session.execute(
            select(ConfigFile)
            .where(ConfigFile.scope == "model", ConfigFile.owner_id == m.model_id, ConfigFile.is_active.is_(True))
            .order_by(ConfigFile.updated_at.desc())
        )
    ).scalars().first()

    if not strategy_cfg or not model_cfg:
        raise ServiceError(status_code=400, detail="active strategy and model configs are required")

    # NOTE: The combined config must be a runnable Freqtrade config.json.
    # That means root-level keys like `exchange`, `timeframe`, `pairlists`, `freqai`, and `strategy`.
    base: dict = deep_merge(strategy_cfg.content or {}, model_cfg.content or {})
    base.setdefault("strategy", s.strategy_class or s.slug)
    base.setdefault("freqai", {})

    # Carry alignment-specific metadata into freqai (used by UI / downstream tooling).
    freqai_extra: dict = {
        "profile": a.profile or "default",
        "scope": a.scope or {},
        "defaults": a.defaults or {},
        "mapping": a.mapping or {},
    }

    # Apply alignment overrides
    combined = deep_merge(base, a.freqtrade_overrides or {})
    combined["freqai"] = deep_merge(
        deep_merge(combined.get("freqai") if isinstance(combined.get("freqai"), dict) else {}, freqai_extra),
        a.freqai_overrides or {},
    )
    validate_freqtrade_config_payload(combined)

    await session.execute(
        update(ConfigFile)
        .where(ConfigFile.scope == "alignment", ConfigFile.owner_id == alignment_id)
        .values(is_active=False)
    )
    cfg = ConfigFile(
        config_id=str(uuid4()),
        scope="alignment",
        owner_id=alignment_id,
        name="combined-config.json",
        content=combined,
        is_active=True,
    )
    session.add(cfg)
    await session.flush()
    await materialize_config_params(session, cfg)
    await session.commit()
    await session.refresh(cfg)

    return {"config": ConfigFileOut.model_validate(cfg, from_attributes=True).model_dump(), "source": "combined"}


async def get_active_alignment_config(session: AsyncSession, alignment_id: str) -> ConfigFile | None:
    return (
        await session.execute(
            select(ConfigFile)
            .where(ConfigFile.scope == "alignment", ConfigFile.owner_id == alignment_id, ConfigFile.is_active.is_(True))
            .order_by(ConfigFile.updated_at.desc())
        )
    ).scalars().first()


async def ensure_active_alignment_config(session: AsyncSession, alignment_id: str) -> ConfigFile:
    cfg = await get_active_alignment_config(session, alignment_id)
    if cfg:
        # Backward compatibility: older versions stored a wrapper object
        # {"freqtrade": {...}, "freqai": {...}, "strategy": "..."}
        # but runtime expects a real Freqtrade config.json at the root.
        if isinstance(cfg.content, dict) and isinstance(cfg.content.get("freqtrade"), dict):
            legacy = cfg.content
            normalized: dict = dict(legacy.get("freqtrade") or {})
            for k, v in legacy.items():
                if k == "freqtrade":
                    continue
                normalized[k] = v
            validate_freqtrade_config_payload(normalized)
            cfg.content = normalized
            session.add(cfg)
            await session.flush()
            await materialize_config_params(session, cfg)
            await session.commit()
            await session.refresh(cfg)
        return cfg

    # If the alignment has no active config yet, try to auto-build a combined config.
    try:
        await build_combined_alignment_config(alignment_id, session)
    except ServiceError as e:
        # Preserve the root cause but make the message actionable.
        if e.status_code == 400 and "active strategy and model configs" in e.detail:
            raise ServiceError(
                status_code=400,
                detail="no active alignment config; create/activate strategy+model configs first, then run Combined/Autotune",
            )
        raise

    cfg = await get_active_alignment_config(session, alignment_id)
    if not cfg:
        raise ServiceError(status_code=400, detail="no active alignment config")
    return cfg
