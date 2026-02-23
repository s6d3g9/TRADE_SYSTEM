from __future__ import annotations

import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.strategylab import FreqAIModelVariant, StrategyAlignment, StrategyTemplate
from app.models.trading import Bot
from app.services.service_errors import ServiceError
from app.services.strategylab_alignment_config import ensure_active_alignment_config


_CLASS_RE = re.compile(
    r"^class\s+(?P<name>[A-Za-z_][A-Za-z0-9_]*)\s*\((?P<bases>[^)]*)\)\s*:",
    re.MULTILINE,
)


def _strategy_class_exists(strategies_dir: Path, strategy_class: str) -> bool:
    if not strategies_dir.exists():
        return False
    for py in strategies_dir.glob("*.py"):
        if py.name == "__init__.py":
            continue
        try:
            text = py.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for m in _CLASS_RE.finditer(text):
            if m.group("name") != strategy_class:
                continue
            bases = m.group("bases")
            if "IStrategy" in bases:
                return True
    return False

def _install_strategy_from_template(strategy: StrategyTemplate, strategies_dir: Path) -> None:
    if not strategy.source_url or not strategy.strategy_class:
        raise ServiceError(status_code=400, detail="Strategy template missing source_url or strategy_class")

    with tempfile.TemporaryDirectory(prefix="strategylab_repo_") as tmp_dir:
        repo_root = Path(tmp_dir) / "repo"

        cmd = ["git", "clone", "--depth", "1"]
        if strategy.source_ref:
            cmd += ["--branch", strategy.source_ref]
        cmd += [strategy.source_url, str(repo_root)]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            raise ServiceError(status_code=400, detail=f"Failed to clone strategy repo: {result.stderr or result.stdout}")

        # Prefer copying the repository's strategies directory if present (brings helper modules too).
        candidate_dirs = [
            repo_root / "user_data" / "strategies",
            repo_root / "strategies",
            repo_root / "user_data" / "strategies" / "NostalgiaForInfinity",
        ]

        strategies_dir.mkdir(parents=True, exist_ok=True)

        copied_any = False
        for src in candidate_dirs:
            if src.exists() and src.is_dir():
                shutil.copytree(src, strategies_dir, dirs_exist_ok=True)
                copied_any = True
                break

        # Fallback: locate a single file that defines the expected strategy class.
        if not copied_any:
            found_file: Path | None = None
            for py in repo_root.rglob("*.py"):
                if py.name == "__init__.py" or "__pycache__" in py.parts:
                    continue
                try:
                    text = py.read_text(encoding="utf-8", errors="ignore")
                except OSError:
                    continue
                for m in _CLASS_RE.finditer(text):
                    if m.group("name") == strategy.strategy_class and "IStrategy" in m.group("bases"):
                        found_file = py
                        break
                if found_file:
                    break
            if found_file:
                shutil.copy2(found_file, strategies_dir / found_file.name)

    if not _strategy_class_exists(strategies_dir, strategy.strategy_class):
        raise ServiceError(
            status_code=400,
            detail=(
                f"Strategy class '{strategy.strategy_class}' not found after installing from repo. "
                f"Ensure the strategy exists in {strategies_dir} and is compatible with Freqtrade."
            ),
        )


async def generate_bot_for_alignment(
    alignment_id: str,
    session: AsyncSession,
    *,
    user_id: str | None,
) -> dict:
    cfg = await ensure_active_alignment_config(session, alignment_id)

    alignment = await session.get(StrategyAlignment, alignment_id)
    strategy_name = "strategy"
    model_name = "model"
    strategy_obj: StrategyTemplate | None = None
    if alignment:
        strategy_obj = await session.get(StrategyTemplate, alignment.strategy_id)
        model = await session.get(FreqAIModelVariant, alignment.model_id)
        strategy_name = strategy_obj.slug if strategy_obj else strategy_name
        model_name = model.slug if model else model_name

    # Ensure the strategy code exists in user_data so Freqtrade can import it.
    try:
        if strategy_obj and strategy_obj.strategy_class:
            strategies_dir = Path(settings.freqtrade_user_data) / "strategies"
            if not _strategy_class_exists(strategies_dir, strategy_obj.strategy_class):
                _install_strategy_from_template(strategy_obj, strategies_dir)
    except ServiceError:
        raise
    except Exception as e:
        raise ServiceError(status_code=500, detail=f"Failed to install strategy code: {str(e)}")

    base_dir = Path("/freqtrade/user_data/configs") / alignment_id
    base_dir.mkdir(parents=True, exist_ok=True)
    out_path = base_dir / (cfg.name or "config.json")
    out_path.write_text(json.dumps(cfg.content, indent=2), encoding="utf-8")

    bot_id = alignment_id
    bot_name = f"{strategy_name}+{model_name}"

    # Extract exchange from config if available, default to "binance"
    config_content = cfg.content or {}
    exchange_name = "binance"
    if isinstance(config_content, dict):
        exchange_config = config_content.get("exchange", {})
        if isinstance(exchange_config, dict):
            exchange_name = exchange_config.get("name", "binance")

    existing = await session.get(Bot, bot_id)
    if existing:
        existing.config_path = str(out_path)
        existing.exchange = exchange_name
        if user_id and not existing.user_id:
            existing.user_id = user_id
    else:
        session.add(
            Bot(
                bot_id=bot_id,
                name=bot_name,
                config_path=str(out_path),
                exchange=exchange_name,
                alignment_id=alignment_id,
                user_id=user_id,
                status="created",
                mode="dry_run",
            )
        )

    await session.commit()

    return {"alignment_id": alignment_id, "config_path": str(out_path), "bot_id": bot_id, "bot_name": bot_name}
