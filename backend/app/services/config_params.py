from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4


@dataclass(frozen=True)
class FlatParam:
    path: str
    value: object
    value_type: str


def _infer_value_type(value: object) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return "json"


def flatten_config_to_params(config: dict) -> list[FlatParam]:
    """Flatten nested dict JSON into dot-path rows.

    - Only dicts are expanded into paths.
    - Arrays/lists are kept as JSON leaf values.
    - Keys containing '.' are not supported (would be ambiguous).
    """

    out: list[FlatParam] = []

    def walk(prefix: str, obj: object) -> None:
        if isinstance(obj, dict):
            for key in sorted(obj.keys(), key=lambda k: str(k)):
                if not isinstance(key, str):
                    raise ValueError("config keys must be strings")
                if "." in key:
                    raise ValueError(f"config key contains '.': {key}")
                path = f"{prefix}.{key}" if prefix else key
                walk(path, obj[key])
            return

        out.append(FlatParam(path=prefix, value=obj, value_type=_infer_value_type(obj)))

    if not isinstance(config, dict):
        raise ValueError("config must be a dict")

    walk("", config)

    # filter out root leaf (would be empty path)
    out = [p for p in out if p.path]
    out.sort(key=lambda p: p.path)
    return out


def build_config_from_params(params: list[FlatParam] | list[dict]) -> dict:
    """Reconstruct nested dict JSON from dot-path rows."""

    normalized: list[FlatParam] = []
    for p in params:
        if isinstance(p, FlatParam):
            normalized.append(p)
        elif isinstance(p, dict):
            normalized.append(
                FlatParam(
                    path=str(p.get("path") or ""),
                    value=p.get("value"),
                    value_type=str(p.get("value_type") or _infer_value_type(p.get("value"))),
                )
            )
        else:
            raise ValueError("invalid param")

    root: dict = {}

    for p in sorted(normalized, key=lambda x: x.path):
        path = (p.path or "").strip()
        if not path:
            raise ValueError("param.path is required")
        if path.startswith(".") or path.endswith(".") or ".." in path:
            raise ValueError(f"invalid path: {path}")

        parts = path.split(".")
        cur: dict = root
        for i, part in enumerate(parts):
            if not part:
                raise ValueError(f"invalid path: {path}")
            if i == len(parts) - 1:
                cur[part] = p.value
            else:
                nxt = cur.get(part)
                if nxt is None:
                    cur[part] = {}
                    nxt = cur[part]
                if not isinstance(nxt, dict):
                    raise ValueError(f"path conflict at {part} for {path}")
                cur = nxt

    return root


def new_param_id() -> str:
    return str(uuid4())
