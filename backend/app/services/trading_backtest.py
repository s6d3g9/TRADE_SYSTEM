from __future__ import annotations

import asyncio
import json
import logging
import subprocess
from datetime import datetime, timezone
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.trading import Backtest, Bot
from app.services.backtest_parser import parse_backtest_file
from app.services.service_errors import ServiceError


logger = logging.getLogger(__name__)


def _get_freqtrade_user_data() -> Path:
    return Path(settings.freqtrade_user_data)


def _get_freqtrade_user_data_host() -> Path:
    # Used only for docker bind-mount source paths (daemon-visible), not for local file reads.
    return Path(settings.freqtrade_user_data_host or settings.freqtrade_user_data)


def _to_host_visible_path(path_inside_user_data: Path) -> Path:
    user_data = _get_freqtrade_user_data().resolve()
    host_user_data = _get_freqtrade_user_data_host()
    try:
        rel = path_inside_user_data.resolve().relative_to(user_data)
    except Exception:
        # Fallback: if it's not under user_data, pass through as-is.
        return path_inside_user_data
    return host_user_data / rel


def _to_decimal(value: object) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, float)):
        return Decimal(str(value))
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        try:
            return Decimal(s)
        except Exception:
            return None
    return None


def _parse_timerange(value: str | None) -> tuple[datetime | None, datetime | None]:
    if not value:
        return (None, None)
    try:
        start_s, end_s = value.split("-", 1)
        start_dt = datetime.strptime(start_s, "%Y%m%d").replace(tzinfo=timezone.utc)
        end_dt = datetime.strptime(end_s, "%Y%m%d").replace(tzinfo=timezone.utc)
        end_dt = end_dt.replace(hour=23, minute=59, second=59)
        return (start_dt, end_dt)
    except Exception:
        return (None, None)


def _parse_dt(value: object) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc)
        except Exception:
            return None
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception as exc:
            logger.debug("Failed ISO datetime parse for value %r: %s", s, exc)
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
            except Exception:
                continue
    return None


def _config_uses_freqai(config: dict) -> bool:
    try:
        freqai = config.get("freqai")
        if isinstance(freqai, dict):
            enabled = freqai.get("enabled")
            if isinstance(enabled, bool):
                return enabled
        # Some configs may use a string flag.
        if isinstance(freqai, str):
            return freqai.strip().lower() in {"1", "true", "yes", "on", "enabled"}
    except Exception:
        return False
    return False


def _default_timerange_days(days: int = 180) -> str:
    end = datetime.now(timezone.utc).date()
    start = (datetime.now(timezone.utc) - timedelta(days=days)).date()
    return f"{start.strftime('%Y%m%d')}-{end.strftime('%Y%m%d')}"


def _extract_exchange_name(config: dict) -> str:
    try:
        exch = config.get("exchange")
        if isinstance(exch, dict):
            name = exch.get("name")
            if isinstance(name, str) and name.strip():
                return name.strip()
    except Exception:
        return "binance"
    return "binance"


def _extract_pairs(config: dict) -> list[str]:
    try:
        exch = config.get("exchange")
        if isinstance(exch, dict):
            pairs = exch.get("pair_whitelist")
            if isinstance(pairs, list):
                out = [str(p).strip() for p in pairs if str(p).strip()]
                return out
    except Exception:
        return []
    return []


def _extract_timeframes(config: dict) -> list[str]:
    out: list[str] = []
    tf = config.get("timeframe")
    if isinstance(tf, str) and tf.strip():
        out.append(tf.strip())

    try:
        freqai = config.get("freqai")
        if isinstance(freqai, dict):
            fp = freqai.get("feature_parameters")
            if isinstance(fp, dict):
                tfs = fp.get("include_timeframes")
                if isinstance(tfs, list):
                    for v in tfs:
                        s = str(v).strip()
                        if s:
                            out.append(s)
    except Exception as exc:
        logger.debug("Failed to extract timeframes from freqai config: %s", exc)

    # Deduplicate preserving order
    seen: set[str] = set()
    uniq: list[str] = []
    for t in out:
        if t in seen:
            continue
        seen.add(t)
        uniq.append(t)
    return uniq


def _extract_freqai_model_class(config: dict) -> str | None:
    if not _config_uses_freqai(config):
        return None
    try:
        freqai = config.get("freqai")
        if not isinstance(freqai, dict):
            return None

        # Newer freqtrade prefers explicit --freqaimodel.
        for key in ("freqaimodel", "model"):
            v = freqai.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()

        mtp = freqai.get("model_training_parameters")
        if isinstance(mtp, dict):
            v = mtp.get("model")
            if isinstance(v, str) and v.strip():
                return v.strip()
    except Exception:
        return None
    return None


async def run_backtest_for_bot(
    *,
    bot_id: str,
    timerange: str | None,
    options: dict | None = None,
    session: AsyncSession,
) -> dict:
    bot = await session.get(Bot, bot_id)
    if not bot:
        raise ServiceError(status_code=404, detail=f"Bot {bot_id} not found")

    config_path = Path(bot.config_path)
    if not config_path.exists():
        raise ServiceError(status_code=404, detail=f"Config file not found: {bot.config_path}")

    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
        if not isinstance(config, dict):
            config = {}
        strategy_name = config.get("strategy", "SampleStrategy")
    except Exception as e:
        raise ServiceError(status_code=500, detail=f"Failed to read config: {str(e)}")

    run_opts: dict = dict(options or {})

    # Apply config-level overrides so download-data and runtime behave consistently.
    effective_config: dict = dict(config)
    # timeframe (CLI flag exists too, but config-level keeps everything consistent)
    if isinstance(run_opts.get("timeframe"), str) and run_opts.get("timeframe").strip():
        effective_config["timeframe"] = run_opts.get("timeframe").strip()
    # stake_amount
    if run_opts.get("stake_amount") is not None:
        effective_config["stake_amount"] = run_opts.get("stake_amount")
    # max_open_trades
    if run_opts.get("max_open_trades") is not None:
        effective_config["max_open_trades"] = run_opts.get("max_open_trades")
    # fee
    if run_opts.get("fee") is not None:
        effective_config["fee"] = run_opts.get("fee")
    # dry_run_wallet
    if run_opts.get("dry_run_wallet") is not None:
        effective_config["dry_run_wallet"] = run_opts.get("dry_run_wallet")
    # pairs
    pairs_override = run_opts.get("pairs")
    if isinstance(pairs_override, list) and pairs_override:
        exch = effective_config.get("exchange")
        if not isinstance(exch, dict):
            exch = {}
        exch["pair_whitelist"] = [str(p).strip() for p in pairs_override if str(p).strip()]
        effective_config["exchange"] = exch

    effective_timerange = timerange
    if not effective_timerange and _config_uses_freqai(effective_config):
        effective_timerange = _default_timerange_days(180)

    docker_image = "freqtradeorg/freqtrade:stable_freqai" if _config_uses_freqai(effective_config) else "freqtradeorg/freqtrade:stable"

    runtime_dir = _get_freqtrade_user_data() / "configs" / "runtime"
    runtime_dir.mkdir(parents=True, exist_ok=True)

    timeframe = str(effective_config.get("timeframe") or "") or "unknown"
    pair_value: str = "ALL"
    try:
        pair_whitelist = config.get("pair_whitelist")
        if isinstance(pair_whitelist, list) and pair_whitelist:
            pair_value = str(pair_whitelist[0])
    except Exception as exc:
        logger.debug("Failed to extract pair whitelist for backtest run %s: %s", bot_id, exc)

    container_name = f"backtest-{bot_id}-{int(datetime.now(timezone.utc).timestamp())}"

    docker_config_path = runtime_dir / f"{container_name}.json"
    try:
        with open(docker_config_path, "w", encoding="utf-8") as f:
            json.dump(effective_config, f, ensure_ascii=False, indent=2)
    except Exception as e:
        raise ServiceError(status_code=500, detail=f"Failed to prepare docker config: {str(e)}")

    docker_cmd = [
        "docker",
        "run",
        "--rm",
        "--name",
        container_name,
        "--network",
        "trade_system_default",
        "-v",
        f"{_to_host_visible_path(docker_config_path)}:/freqtrade/config.json:ro",
        "-v",
        f"{_get_freqtrade_user_data_host()}:/freqtrade/user_data",
        docker_image,
        "backtesting",
        "--config",
        "/freqtrade/config.json",
        "--strategy",
        strategy_name,
        "--export",
        "trades",
    ]

    # Advanced options (CLI flags)
    if isinstance(run_opts.get("timeframe"), str) and run_opts.get("timeframe").strip():
        docker_cmd.extend(["--timeframe", run_opts.get("timeframe").strip()])

    if run_opts.get("data_format_ohlcv") is not None:
        docker_cmd.extend(["--data-format-ohlcv", str(run_opts.get("data_format_ohlcv"))])

    if run_opts.get("max_open_trades") is not None:
        docker_cmd.extend(["--max-open-trades", str(run_opts.get("max_open_trades"))])
    if run_opts.get("stake_amount") is not None:
        docker_cmd.extend(["--stake-amount", str(run_opts.get("stake_amount"))])
    if run_opts.get("fee") is not None:
        docker_cmd.extend(["--fee", str(run_opts.get("fee"))])
    if run_opts.get("pairs") is not None and isinstance(run_opts.get("pairs"), list) and run_opts.get("pairs"):
        docker_cmd.extend(["--pairs", *[str(p).strip() for p in run_opts.get("pairs") if str(p).strip()]])
    if run_opts.get("eps"):
        docker_cmd.append("--eps")
    if run_opts.get("enable_protections"):
        docker_cmd.append("--enable-protections")
    if run_opts.get("enable_dynamic_pairlist"):
        docker_cmd.append("--enable-dynamic-pairlist")
    if run_opts.get("dry_run_wallet") is not None:
        docker_cmd.extend(["--dry-run-wallet", str(run_opts.get("dry_run_wallet"))])
    if isinstance(run_opts.get("timeframe_detail"), str) and run_opts.get("timeframe_detail").strip():
        docker_cmd.extend(["--timeframe-detail", run_opts.get("timeframe_detail").strip()])
    if isinstance(run_opts.get("export"), str) and run_opts.get("export").strip():
        docker_cmd.extend(["--export", run_opts.get("export").strip()])
    breakdown = run_opts.get("breakdown")
    if isinstance(breakdown, list) and breakdown:
        docker_cmd.extend(["--breakdown", *[str(x).strip() for x in breakdown if str(x).strip()]])
    if isinstance(run_opts.get("cache"), str) and run_opts.get("cache").strip():
        docker_cmd.extend(["--cache", run_opts.get("cache").strip()])
    if run_opts.get("freqai_backtest_live_models"):
        docker_cmd.append("--freqai-backtest-live-models")
    if isinstance(run_opts.get("notes"), str) and run_opts.get("notes").strip():
        docker_cmd.extend(["--notes", run_opts.get("notes").strip()])

    if effective_timerange:
        docker_cmd.extend(["--timerange", effective_timerange])

    freqaimodel = _extract_freqai_model_class(effective_config)
    if freqaimodel:
        docker_cmd.extend(["--freqaimodel", freqaimodel])

    # Ensure historical data exists for the requested exchange/pairs/timeframes.
    # This prevents `No data found. Terminating` errors on fresh installs.
    exchange_name = _extract_exchange_name(effective_config)
    pairs = _extract_pairs(effective_config)
    timeframes = _extract_timeframes(effective_config)
    # Include detail timeframe if requested (for improved backtest accuracy)
    if isinstance(run_opts.get("timeframe_detail"), str) and run_opts.get("timeframe_detail").strip():
        timeframes = [*timeframes, run_opts.get("timeframe_detail").strip()]
        # Dedup
        seen: set[str] = set()
        timeframes = [t for t in timeframes if (t not in seen and not seen.add(t))]
    if pairs and timeframes and effective_timerange:
        download_cmd = [
            "docker",
            "run",
            "--rm",
            "--network",
            "trade_system_default",
            "-v",
            f"{_to_host_visible_path(docker_config_path)}:/freqtrade/config.json:ro",
            "-v",
            f"{_get_freqtrade_user_data_host()}:/freqtrade/user_data",
            docker_image,
            "download-data",
            "--config",
            "/freqtrade/config.json",
            "--exchange",
            exchange_name,
            "--timerange",
            effective_timerange,
            "--timeframes",
            *timeframes,
            "--pairs",
            *pairs,
        ]

        dl = await asyncio.to_thread(subprocess.run, download_cmd, capture_output=True, text=True, timeout=900)
        if dl.returncode != 0:
            raise ServiceError(status_code=500, detail=f"Data download failed: {dl.stderr or dl.stdout}")

    try:
        result = await asyncio.to_thread(
            subprocess.run,
            docker_cmd,
            capture_output=True,
            text=True,
            timeout=900,
        )

        if result.returncode != 0:
            raise ServiceError(status_code=500, detail=f"Backtest failed: {result.stderr or result.stdout}")

        results_dir = _get_freqtrade_user_data() / "backtest_results"
        all_files = list(results_dir.glob("*.json")) + list(results_dir.glob("*.zip"))
        if not all_files:
            raise ServiceError(status_code=500, detail="No backtest results found after run")

        latest_file = max(all_files, key=lambda p: p.stat().st_mtime)
        result_data = parse_backtest_file(latest_file)

        # Persist to DB (best-effort)
        try:
            now = datetime.now(timezone.utc)
            tr_start, tr_end = _parse_timerange(effective_timerange)
            bt_start = _parse_dt((result_data or {}).get("backtest_start")) or tr_start or now
            bt_end = _parse_dt((result_data or {}).get("backtest_end")) or tr_end or now

            best_pair = (result_data or {}).get("best_pair")
            if isinstance(best_pair, str) and best_pair.strip():
                pair_value = best_pair.strip()

            total_trades = int((result_data or {}).get("total_trades") or 0)
            wins = int((result_data or {}).get("wins") or 0)
            losses = int((result_data or {}).get("losses") or 0)
            win_rate = _to_decimal((result_data or {}).get("win_rate"))

            backtest_row = Backtest(
                backtest_id=str(uuid4()),
                bot_id=bot_id,
                alignment_id=bot.alignment_id,
                user_id=bot.user_id,
                strategy_name=str((result_data or {}).get("strategy_name") or strategy_name),
                pair=pair_value,
                timeframe=timeframe,
                backtest_start=bt_start,
                backtest_end=bt_end,
                period_description=effective_timerange or (result_data or {}).get("period"),
                initial_capital=_to_decimal(effective_config.get("dry_run_wallet")) or Decimal("1000"),
                final_capital=None,
                total_return=None,
                total_return_percent=_to_decimal((result_data or {}).get("total_return")),
                total_trades=total_trades,
                winning_trades=wins,
                losing_trades=losses,
                win_rate=win_rate,
                avg_trade_return=_to_decimal((result_data or {}).get("avg_trade")),
                max_drawdown=None,
                max_drawdown_percent=_to_decimal((result_data or {}).get("max_drawdown")),
                sharpe_ratio=_to_decimal((result_data or {}).get("sharpe_ratio")),
                sortino_ratio=None,
                profit_factor=_to_decimal((result_data or {}).get("profit_factor")),
                result_file_path=str(latest_file),
                trades_file_path=None,
                status="completed",
                error_message=None,
                metrics=result_data or {},
                completed_at=now,
            )
            session.add(backtest_row)
            await session.commit()
        except Exception:
            await session.rollback()

        return {
            "bot_id": bot_id,
            "strategy": strategy_name,
            "status": "completed",
            "output": result.stdout,
            "backtest": result_data,
            "timerange": effective_timerange,
            "options": run_opts,
        }

    except subprocess.TimeoutExpired:
        raise ServiceError(status_code=504, detail="Backtest timeout (>10min)")
    except ServiceError:
        raise
    except Exception as e:
        raise ServiceError(status_code=500, detail=f"Backtest error: {str(e)}")
