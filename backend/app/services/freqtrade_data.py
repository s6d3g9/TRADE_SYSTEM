from __future__ import annotations

import asyncio
import json
import os
import re
from pathlib import Path
from typing import Awaitable, Callable


LogFn = Callable[[str], Awaitable[None]]


SUPPORTED_TIMEFRAMES = {
    "1m",
    "3m",
    "5m",
    "15m",
    "30m",
    "1h",
    "2h",
    "4h",
    "1d",
    "1w",
}


def load_freqtrade_config(user_data_internal_path: Path = Path("/freqtrade/user_data")) -> dict:
    config_path = user_data_internal_path / "config.json"
    if not config_path.exists():
        return {}
    try:
        return json.loads(config_path.read_text("utf-8"))
    except Exception:
        return {}


def extract_exchange_name(config: dict) -> str:
    ex = (config or {}).get("exchange") or {}
    name = str(ex.get("name") or "").strip()
    return name or "binance"


def extract_pairs(config: dict) -> list[str]:
    ex = (config or {}).get("exchange") or {}
    pairs = ex.get("pair_whitelist")
    if isinstance(pairs, list):
        return [str(p).strip() for p in pairs if str(p).strip()]
    return []


def extract_timeframes_from_config(config: dict) -> list[str]:
    """Best-effort timeframe extraction from config.

    Covers common freqtrade 'timeframe' and optional freqai feature timeframes.
    """
    out: list[str] = []
    tf = (config or {}).get("timeframe")
    if isinstance(tf, str) and tf.strip():
        out.append(tf.strip())

    freqai = (config or {}).get("freqai")
    if isinstance(freqai, dict):
        fp = freqai.get("feature_parameters")
        if isinstance(fp, dict):
            tfs = fp.get("include_timeframes")
            if isinstance(tfs, list):
                out.extend([str(x).strip() for x in tfs if str(x).strip()])

    # normalize
    uniq: list[str] = []
    seen = set()
    for t in out:
        v = t.lower()
        if v in SUPPORTED_TIMEFRAMES and v not in seen:
            uniq.append(v)
            seen.add(v)
    return uniq


def extract_timeframes_from_strategy_source(source: str) -> list[str]:
    if not source:
        return []

    # Heuristic: capture timeframe literals like '15m', "4h", etc.
    candidates = re.findall(r"['\"](\d+[mhdw])['\"]", source)
    out: list[str] = []
    seen = set()
    for c in candidates:
        v = c.lower()
        if v in SUPPORTED_TIMEFRAMES and v not in seen:
            out.append(v)
            seen.add(v)
    return out


def resolve_required_timeframes(*, config: dict, strategy_path: Path | None, base_timeframe: str | None) -> list[str]:
    out: list[str] = []
    if isinstance(base_timeframe, str) and base_timeframe.strip():
        out.append(base_timeframe.strip().lower())

    out.extend(extract_timeframes_from_config(config))

    if strategy_path and strategy_path.exists():
        try:
            out.extend(extract_timeframes_from_strategy_source(strategy_path.read_text("utf-8", errors="ignore")))
        except Exception:
            pass

    uniq: list[str] = []
    seen = set()
    for t in out:
        v = str(t).lower().strip()
        if v in SUPPORTED_TIMEFRAMES and v not in seen:
            uniq.append(v)
            seen.add(v)
    return uniq


def normalize_pair_filename(pair: str) -> str:
    # Matches Freqtrade naming: "BNB/USDT" -> "BNB_USDT"
    # Also handle exotic separators like ":".
    p = (pair or "").strip()
    p = p.replace("/", "_").replace(":", "_")
    p = re.sub(r"_+", "_", p)
    return p.strip("_")


def _data_file_candidates(user_data_internal_path: Path, exchange: str, pair: str, timeframe: str) -> list[Path]:
    ex_dir = (exchange or "binance").strip().lower()
    pair_norm = normalize_pair_filename(pair)
    tf = (timeframe or "").strip()
    base = user_data_internal_path / "data" / ex_dir / f"{pair_norm}-{tf}"

    # Common formats across Freqtrade versions / configs
    return [
        base.with_suffix(".feather"),
        base.with_suffix(".json"),
        base.with_suffix(".json.gz"),
        base.with_suffix(".jsongz"),
        base.with_suffix(".parquet"),
    ]


def has_history_data(user_data_internal_path: Path, exchange: str, pair: str, timeframe: str) -> bool:
    for p in _data_file_candidates(user_data_internal_path, exchange, pair, timeframe):
        try:
            if p.exists() and p.is_file() and p.stat().st_size > 0:
                return True
        except Exception:
            continue
    return False


async def _stream_cmd_lines(cmd: list[str], log: LogFn, prefix: str = "") -> int:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )

    assert proc.stdout is not None

    while True:
        line = await proc.stdout.readline()
        if not line:
            break
        text = line.decode(errors="replace").rstrip()
        if text:
            await log(f"{prefix}{text}")

    return await proc.wait()


async def ensure_freqtrade_history(
    *,
    user_data_host_path: str,
    user_data_internal_path: Path,
    docker_image: str = "freqtradeorg/freqtrade:stable",
    exchange: str,
    pairs: list[str],
    timeframes: list[str],
    timerange: str | None,
    log: LogFn,
) -> None:
    if not pairs or not timeframes:
        await log("[SYSTEM] Data download skipped (no pairs/timeframes).")
        return

    missing: list[tuple[str, str]] = []
    for pair in pairs:
        for tf in timeframes:
            if not has_history_data(user_data_internal_path, exchange, pair, tf):
                missing.append((pair, tf))

    if not missing:
        await log("[SYSTEM] Historical data already present. Skipping download-data.")
        return

    await log(
        "[SYSTEM] Missing historical data detected. Running download-data for: "
        + ", ".join([f"{p} {tf}" for p, tf in missing])
    )

    cmd = [
        "docker",
        "run",
        "--rm",
        "--network",
        os.getenv("COMPOSE_DOCKER_NETWORK", "trade_system_default"),
        "-v",
        f"{user_data_host_path}:/freqtrade/user_data",
        docker_image,
        "download-data",
        "--config",
        "/freqtrade/user_data/config.json",
        "--exchange",
        exchange,
        "--timeframes",
        *timeframes,
        "--pairs",
        *pairs,
    ]

    tr = (timerange or "").strip()
    if tr:
        cmd.extend(["--timerange", tr])
        # If user requests historical data from a specific start date, prefer prepend.
        # This avoids situations where local data exists but starts later than requested.
        if re.fullmatch(r"\d{8}-\d{8}|\d{8}-", tr):
            cmd.append("--prepend")

    code = await _stream_cmd_lines(cmd, log, prefix="[DL] ")
    if code != 0:
        raise RuntimeError(f"download-data failed with exit code {code}")

    # Re-check quickly so we can fail fast with a useful message.
    still_missing = [(p, tf) for (p, tf) in missing if not has_history_data(user_data_internal_path, exchange, p, tf)]
    if still_missing:
        raise RuntimeError(
            "download-data finished but data still missing for: "
            + ", ".join([f"{p} {tf}" for p, tf in still_missing])
        )

    await log("[SYSTEM] download-data completed.")
