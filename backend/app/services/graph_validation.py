from __future__ import annotations

from collections.abc import Iterable


def missing_required_run_inputs(required: Iterable[str], run_inputs: dict | None) -> list[str]:
    inputs = run_inputs if isinstance(run_inputs, dict) else {}
    missing: list[str] = []

    for key in required:
        if not isinstance(key, str):
            continue
        k = key.strip()
        if not k:
            continue
        value = inputs.get(k)
        if value is None:
            missing.append(k)
            continue
        if isinstance(value, str) and value.strip() == "":
            missing.append(k)
            continue

    # keep stable ordering
    return sorted(set(missing))
