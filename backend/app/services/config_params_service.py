from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.strategylab import ConfigFile
from app.schemas.strategylab import ConfigFileOut, ConfigParamBase
from app.services.config_audit_service import (
    count_config_audit_events,
    list_config_audit_events,
    record_config_audit_event,
)
from app.services.config_access import assert_scope_owner_access
from app.services.config_materializer import (
    apply_params_patch,
    ensure_materialized,
    materialize_config_params,
)


class ConfigParamsService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def _assert_config_access(self, *, config: ConfigFile, user_id: str) -> None:
        await assert_scope_owner_access(
            self.session,
            scope=config.scope,
            owner_id=config.owner_id,
            user_id=user_id,
        )

    async def get_config_with_params(self, config_id: str, *, user_id: str) -> dict[str, Any]:
        cfg = await self.session.get(ConfigFile, config_id)
        if not cfg:
            raise NotFoundError("Config not found")

        await self._assert_config_access(config=cfg, user_id=user_id)

        params, source = await ensure_materialized(self.session, cfg)
        return {
            "config": ConfigFileOut.model_validate(cfg, from_attributes=True),
            "params": params,
            "source": source,
        }

    async def save_params_as_new_version(
        self,
        *,
        base_config_id: str,
        user_id: str,
        name: str | None,
        make_active: bool,
        params: list[ConfigParamBase],
    ) -> dict[str, Any]:
        base = await self.session.get(ConfigFile, base_config_id)
        if not base:
            raise NotFoundError("Base config not found")

        await self._assert_config_access(config=base, user_id=user_id)

        patch_items = [(p.path, p.value) for p in params]
        new_content = apply_params_patch(base.content or {}, patch_items)

        cfg = ConfigFile(
            scope=base.scope,
            owner_id=base.owner_id,
            name=name or base.name,
            content=new_content,
            is_active=False,
            regime=base.regime,
            kind="variant",
            parent_config_id=base.config_id,
        )
        self.session.add(cfg)
        await self.session.flush()

        await materialize_config_params(self.session, cfg)
        await record_config_audit_event(
            self.session,
            user_id=user_id,
            action="params_save_version",
            scope=cfg.scope,
            owner_id=cfg.owner_id,
            config_id=cfg.config_id,
            details={
                "base_config_id": base.config_id,
                "new_config_id": cfg.config_id,
                "params_count": len(params),
            },
        )

        if make_active:
            # Deactivate siblings for same scope+owner+regime
            await self.session.execute(
                update(ConfigFile)
                .where(
                    (ConfigFile.scope == cfg.scope)
                    & (ConfigFile.owner_id == cfg.owner_id)
                    & (ConfigFile.regime == cfg.regime)
                )
                .values(is_active=False)
            )
            cfg.is_active = True
            await record_config_audit_event(
                self.session,
                user_id=user_id,
                action="config_activated",
                scope=cfg.scope,
                owner_id=cfg.owner_id,
                config_id=cfg.config_id,
                details={
                    "source": "params_save",
                    "regime": cfg.regime,
                },
            )

        await self.session.commit()
        await self.session.refresh(cfg)

        params_out, source = await ensure_materialized(self.session, cfg)
        return {
            "config": ConfigFileOut.model_validate(cfg, from_attributes=True),
            "params": params_out,
            "source": source,
        }

    async def diff_params(self, from_config_id: str, to_config_id: str, *, user_id: str) -> dict[str, Any]:
        a = await self.session.get(ConfigFile, from_config_id)
        b = await self.session.get(ConfigFile, to_config_id)
        if not a or not b:
            raise NotFoundError("Config not found")

        await self._assert_config_access(config=a, user_id=user_id)
        await self._assert_config_access(config=b, user_id=user_id)

        a_params, _ = await ensure_materialized(self.session, a)
        b_params, _ = await ensure_materialized(self.session, b)

        a_map = {p.path: p.value for p in a_params}
        b_map = {p.path: p.value for p in b_params}

        added = sorted([k for k in b_map.keys() if k not in a_map])
        removed = sorted([k for k in a_map.keys() if k not in b_map])
        changed = sorted([k for k in a_map.keys() & b_map.keys() if a_map[k] != b_map[k]])

        return {
            "from_config_id": from_config_id,
            "to_config_id": to_config_id,
            "added": [{"path": k, "old": None, "new": b_map[k]} for k in added],
            "removed": [{"path": k, "old": a_map[k], "new": None} for k in removed],
            "changed": [{"path": k, "old": a_map[k], "new": b_map[k]} for k in changed],
        }

    async def get_config_audit(
        self,
        config_id: str,
        *,
        user_id: str,
        limit: int,
        offset: int,
        action: str | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
    ) -> dict[str, Any]:
        total = await count_config_audit_events(
            self.session,
            config_id=config_id,
            user_id=user_id,
            action=action,
            created_from=created_from,
            created_to=created_to,
        )

        events = await list_config_audit_events(
            self.session,
            config_id=config_id,
            user_id=user_id,
            limit=limit,
            offset=offset,
            action=action,
            created_from=created_from,
            created_to=created_to,
        )
        items = [
            {
                "event_id": event.event_id,
                "config_id": event.config_id,
                "user_id": event.user_id,
                "scope": event.scope,
                "owner_id": event.owner_id,
                "action": event.action,
                "details": event.details,
                "created_at": event.created_at,
            }
            for event in events
        ]
        return {"items": items, "total": total, "limit": limit, "offset": offset}
