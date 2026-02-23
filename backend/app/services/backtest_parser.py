"""Backtest result parsing and analysis service."""
from __future__ import annotations

import json
import zipfile
from pathlib import Path
from typing import Any


def parse_backtest_json(data: dict, filepath: Path) -> dict[str, Any] | None:
    """Parse a single backtest JSON result into normalized format.

    Args:
        data: Raw JSON data from backtest result
        filepath: Path to the backtest file (for metadata)

    Returns:
        Normalized backtest dict or None if parsing fails
    """
    try:
        strategy_name = None
        strategy_data = None

        # Handle different freqtrade backtest result formats
        if "strategy" in data and isinstance(data["strategy"], dict):
            strategy_data = data["strategy"]
            strategy_name = list(strategy_data.keys())[0] if strategy_data else "Unknown"
            if strategy_name and strategy_name in strategy_data:
                strategy_data = strategy_data[strategy_name]
        elif "strategy" in data and isinstance(data["strategy"], str):
            strategy_name = data["strategy"]
            strategy_data = data
        else:
            # Fallback: find first dict with total_trades
            for key, val in data.items():
                if isinstance(val, dict) and "total_trades" in val:
                    strategy_name = key
                    strategy_data = val
                    break

        # total_trades can legitimately be 0. Only treat as missing if the key is absent.
        if not strategy_data or "total_trades" not in strategy_data:
            if isinstance(data, dict) and "total_trades" in data:
                strategy_data = data
            else:
                return None

        pairlist = strategy_data.get("pairlist", [])
        if isinstance(pairlist, list) and len(pairlist) > 0:
            pair = pairlist[0]
        else:
            pair = str(strategy_data.get("pair", "Multiple"))

        total_trades = int(strategy_data.get("total_trades", 0))
        wins = int(strategy_data.get("wins", 0))
        win_rate = round(wins / max(total_trades, 1) * 100, 2)

        return {
            "id": filepath.stem.replace(".json", "").rstrip("."),
            "filename": filepath.name,
            "strategy_name": strategy_name or "Unknown",
            "pair": pair,
            "timeframe": strategy_data.get("timeframe", "N/A"),
            "total_trades": total_trades,
            "win_rate": win_rate,
            "profit_factor": round(float(strategy_data.get("profit_factor", 0) or 0), 2),
            "max_drawdown": round(abs(float(strategy_data.get("max_drawdown", 0) or 0)) * 100, 2),
            "sharpe_ratio": round(float(strategy_data.get("sharpe", 0) or 0), 2),
            "total_return": round(float(strategy_data.get("profit_total", 0) or 0) * 100, 2),
            "avg_trade": round(float(strategy_data.get("profit_mean", 0) or 0) * 100, 2),
            "period": f"{strategy_data.get('backtest_start', 'N/A')} - {strategy_data.get('backtest_end', 'N/A')}",
            "backtest_start": strategy_data.get("backtest_start"),
            "backtest_end": strategy_data.get("backtest_end"),
            "created_at": filepath.stat().st_mtime if filepath.exists() else 0,
        }
    except Exception:
        return None


def parse_backtest_file(filepath: Path) -> dict[str, Any] | None:
    """Parse a backtest file (JSON or ZIP) into normalized format.

    Args:
        filepath: Path to .json or .zip backtest file

    Returns:
        Normalized backtest dict or None if parsing fails
    """
    try:
        if filepath.suffix == ".zip":
            with zipfile.ZipFile(filepath, "r") as zf:
                json_files = [n for n in zf.namelist() if n.endswith(".json") and not n.endswith("_config.json")]
                if not json_files:
                    return None
                with zf.open(json_files[0]) as jf:
                    data = json.load(jf)
                parsed = parse_backtest_json(data, filepath)
                if parsed:
                    parsed["id"] = filepath.stem
                    parsed["filename"] = filepath.name
                return parsed

        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        return parse_backtest_json(data, filepath)
    except Exception:
        return None


def find_backtests_for_strategy(
    results_dir: Path,
    strategy_filter: str,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Find and parse backtests matching a strategy name.

    Args:
        results_dir: Directory containing backtest results
        strategy_filter: Strategy name/class to filter by
        limit: Maximum number of results to return

    Returns:
        List of parsed backtest dicts, sorted by creation time (newest first)
    """
    if not results_dir.exists():
        return []

    results: list[dict[str, Any]] = []
    all_files = list(results_dir.glob("*.json")) + list(results_dir.glob("*.zip"))
    sorted_files = sorted(all_files, key=lambda p: p.stat().st_mtime, reverse=True)

    for fp in sorted_files:
        if fp.name.startswith(".") or "_meta" in fp.name or "_config" in fp.name:
            continue

        parsed = parse_backtest_file(fp)
        if not parsed:
            continue

        # Filter by strategy name (case-insensitive substring match)
        if strategy_filter and strategy_filter.lower() not in str(parsed.get("strategy_name", "")).lower():
            continue

        results.append(parsed)
        if len(results) >= limit:
            break

    return results
