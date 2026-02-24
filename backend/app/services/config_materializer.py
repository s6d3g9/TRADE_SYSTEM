from __future__ import annotations

from collections.abc import Iterable
from copy import deepcopy
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import new_id
from app.models.strategylab import ConfigFile, ConfigParam


def _infer_value_type(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int) and not isinstance(value, bool):
        return "int"
    if isinstance(value, float):
        return "float"
    if isinstance(value, str):
        return "str"
    return "json"


def flatten_dict_to_params(content: dict[str, Any]) -> list[tuple[str, Any, str]]:
    """Flatten dict-only structure into dot-path params.

    Arrays are stored as JSON leaf values at their parent path.
    """

    out: list[tuple[str, Any, str]] = []

    def walk(prefix: str, value: Any) -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                key_str = str(key)
                path = f"{prefix}.{key_str}" if prefix else key_str
                walk(path, child)
            return

        out.append((prefix, value, _infer_value_type(value)))

    for key, value in (content or {}).items():
        walk(str(key), value)

    # Stable order improves diffs and testability
    out.sort(key=lambda x: x[0])
    return out


def build_dict_from_params(params: Iterable[tuple[str, Any]]) -> dict[str, Any]:
    root: dict[str, Any] = {}

    for path, value in params:
        parts = [p for p in path.split(".") if p]
        if not parts:
            continue
        cursor: dict[str, Any] = root
        for part in parts[:-1]:
            nxt = cursor.get(part)
            if not isinstance(nxt, dict):
                nxt = {}
                cursor[part] = nxt
            cursor = nxt
        cursor[parts[-1]] = value

    return root


def apply_params_patch(base: dict[str, Any], params: Iterable[tuple[str, Any]]) -> dict[str, Any]:
    out = deepcopy(base or {})
    patch = build_dict_from_params(params)

    def deep_merge(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
        merged: dict[str, Any] = dict(a)
        for key, value in b.items():
            if isinstance(value, dict) and isinstance(merged.get(key), dict):
                merged[key] = deep_merge(merged[key], value)
            else:
                merged[key] = value
        return merged

    return deep_merge(out, patch)


async def materialize_config_params(session: AsyncSession, config: ConfigFile) -> list[ConfigParam]:
    """(Re)build config_params rows for a given ConfigFile.

    Does not commit.
    """

    if not config.config_id:
        raise ValueError("ConfigFile.config_id must be set before materialization")

    await session.execute(delete(ConfigParam).where(ConfigParam.config_id == config.config_id))

    rows = flatten_dict_to_params(config.content or {})
    entities: list[ConfigParam] = []
    for path, value, value_type in rows:
        entities.append(
            ConfigParam(
                param_id=new_id(),
                config_id=config.config_id,
                path=path,
                value=value,
                value_type=value_type,
            )
        )

    session.add_all(entities)
    return entities


async def ensure_materialized(session: AsyncSession, config: ConfigFile) -> tuple[list[ConfigParam], str]:
    """Return params for config, materializing if missing."""

    params = (
        await session.execute(select(ConfigParam).where(ConfigParam.config_id == config.config_id).order_by(ConfigParam.path))
    ).scalars().all()

    if params:
        return params, "stored"

    params = await materialize_config_params(session, config)
    await session.flush()
    return params, "materialized"
