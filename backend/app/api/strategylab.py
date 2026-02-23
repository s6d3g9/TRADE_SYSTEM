from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
import zipfile
import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy import select, update
import httpx
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import maybe_current_user
from app.core.db import get_db
from app.core.config import settings
from app.core.redis import get_redis
from app.models.trading import Bot, Backtest
from app.models.user_settings import UserSettings
from app.models.strategylab import ConfigFile, ConfigParam, FreqAIModelVariant, StrategyAlignment, StrategyTemplate
from app.models.user import User
from app.services.config_params import build_config_from_params, flatten_config_to_params, new_param_id
from app.services.strategylab_export import AlignmentExportError, build_alignment_export_payload
from app.services.service_errors import ServiceError
from app.services.strategylab_alignment_config import build_combined_alignment_config
from app.services.strategylab_bots import generate_bot_for_alignment
from app.services.trading_backtest import run_backtest_for_bot
from app.schemas.strategylab import (
    FreqAIModelVariantCreate,
    FreqAIModelVariantOut,
    FreqAIModelVariantUpdate,
    ConfigFileCreate,
    ConfigFileOut,
    ConfigFileUpdate,
    ConfigParamsOut,
    ConfigParamsSaveRequest,
    ConfigParamOut,
    ModelAutotunePromptListOut,
    ModelAutotunePromptOut,
    StrategyAlignmentCreate,
    StrategyAlignmentOut,
    StrategyAlignmentUpdate,
    StrategyTemplateCreate,
    StrategyTemplateOut,
    StrategyTemplateUpdate,
)

router = APIRouter(prefix="/strategylab", tags=["strategylab"])

QUEUE_KEY = "trade:tasks:queue"
TASK_KEY_PREFIX = "trade:tasks:"


MODEL_AUTOTUNE_PROMPTS: list[dict] = [
    {
        "prompt_id": "freqai_baseline",
        "title": "FreqAI baseline (safe defaults)",
        "description": "Minimal-but-complete FreqAI config with required fields and conservative defaults.",
        "tags": ["freqai", "baseline"],
        "system_prompt": (
            "You are an expert Freqtrade/FreqAI configuration engineer. "
            "Return ONLY valid JSON (no markdown, no comments). "
            "The JSON must have exactly these top-level keys: freqtrade, freqai, strategy. "
            "The freqai object MUST include required parameters: enabled, train_period_days, backtest_period_days, identifier, "
            "feature_parameters, data_split_parameters. "
            "Use realistic values; keep them conservative for stability."
        ),
        "user_prompt_template": (
            "Model variant:\n"
            "- slug: {model_slug}\n"
            "- algorithm: {model_algorithm}\n"
            "- variant_config: {model_config_json}\n"
            "- description: {model_description}\n"
            "- tags: {model_tags_json}\n\n"
            "Constraints:\n"
            "- Output ONLY JSON with keys: freqtrade, freqai, strategy\n"
            "- strategy must be a string (use {model_slug} if unknown)\n"
            "- freqai.enabled must be true\n"
            "- freqai.identifier must be stable and descriptive (derive from slug+algorithm)\n"
            "- feature_parameters must include: include_timeframes (list), include_corr_pairlist (list), label_period_candles (int), include_shifted_candles (int), indicator_periods_candles (list[int])\n"
            "- data_split_parameters must include: test_size (float) and shuffle=false\n"
            "- model_training_parameters should reflect the algorithm (LightGBM/XGBoost/PyTorch/etc), and may incorporate fields from variant_config\n\n"
            "Optional extra context (if any):\n{extra_context}\n"
        ),
    },
    {
        "prompt_id": "freqai_fast_backtest",
        "title": "FreqAI fast backtest (quick iterations)",
        "description": "Prefers faster training and smaller windows to iterate quickly.",
        "tags": ["freqai", "fast", "backtest"],
        "system_prompt": (
            "You are an expert Freqtrade/FreqAI configuration engineer. "
            "Return ONLY valid JSON (no markdown, no comments). "
            "Top-level keys: freqtrade, freqai, strategy. "
            "Optimize for speed: smaller train/backtest windows, fewer features, fewer indicator periods."
        ),
        "user_prompt_template": (
            "Model variant:\n"
            "- slug: {model_slug}\n"
            "- algorithm: {model_algorithm}\n"
            "- variant_config: {model_config_json}\n\n"
            "Generate a fast-iteration config:\n"
            "- freqai.enabled=true\n"
            "- train_period_days around 7-14\n"
            "- backtest_period_days around 3-5\n"
            "- feature_parameters: include_timeframes 1-2 timeframes max; include_shifted_candles 1-2; indicator_periods_candles small list (e.g. [10, 20])\n"
            "- data_split_parameters: test_size around 0.25, shuffle=false\n"
            "- model_training_parameters: choose speed-friendly defaults for the algorithm\n\n"
            "Optional extra context:\n{extra_context}\n"
        ),
    },
    {
        "prompt_id": "freqai_robust_outliers",
        "title": "FreqAI robust (outliers + PCA)",
        "description": "Adds outlier handling and dimensionality reduction for stability.",
        "tags": ["freqai", "robust"],
        "system_prompt": (
            "You are an expert Freqtrade/FreqAI configuration engineer. "
            "Return ONLY valid JSON (no markdown, no comments). "
            "Top-level keys: freqtrade, freqai, strategy. "
            "Prefer robust settings: enable PCA and configure outlier thresholds sensibly."
        ),
        "user_prompt_template": (
            "Model variant:\n"
            "- slug: {model_slug}\n"
            "- algorithm: {model_algorithm}\n"
            "- variant_config: {model_config_json}\n\n"
            "Generate a robust config with the required freqai fields, and additionally:\n"
            "- feature_parameters.principal_component_analysis=true\n"
            "- feature_parameters.DI_threshold set to a small positive value (typical < 1)\n"
            "- feature_parameters.use_SVM_to_remove_outliers=true (if appropriate)\n"
            "- feature_parameters.outlier_protection_percentage set (e.g. 30)\n"
            "Keep shuffle=false in data_split_parameters.\n\n"
            "Optional extra context:\n{extra_context}\n"
        ),
    },
    {
        "prompt_id": "freqai_pytorch",
        "title": "FreqAI PyTorch (trainer_kwargs)",
        "description": "Targets PyTorch models; uses model_training_parameters.learning_rate/model_kwargs/trainer_kwargs.",
        "tags": ["freqai", "pytorch"],
        "system_prompt": (
            "You are an expert Freqtrade/FreqAI configuration engineer. "
            "Return ONLY valid JSON (no markdown, no comments). "
            "Top-level keys: freqtrade, freqai, strategy. "
            "If algorithm indicates PyTorch, populate freqai.model_training_parameters appropriately."
        ),
        "user_prompt_template": (
            "Model variant:\n"
            "- slug: {model_slug}\n"
            "- algorithm: {model_algorithm}\n"
            "- variant_config: {model_config_json}\n\n"
            "Generate a config with required freqai fields and include in model_training_parameters:\n"
            "- learning_rate (default ~3e-4)\n"
            "- model_kwargs (dict)\n"
            "- trainer_kwargs (dict; include n_epochs or n_steps, and batch_size)\n"
            "Keep shuffle=false in data_split_parameters.\n\n"
            "Optional extra context:\n{extra_context}\n"
        ),
    },
    {
        "prompt_id": "freqai_lightgbm_regressor_conservative",
        "title": "LightGBM regressor (conservative)",
        "description": "LightGBMRegressor-style training params with conservative defaults to reduce overfit risk.",
        "tags": ["freqai", "lightgbm", "regressor", "conservative"],
        "system_prompt": (
            "You are an expert Freqtrade/FreqAI configuration engineer. "
            "Return ONLY valid JSON (no markdown, no comments). "
            "Top-level keys: freqtrade, freqai, strategy. "
            "Assume this is a time-series forecasting task; keep data split chronological (shuffle=false)."
        ),
        "user_prompt_template": (
            "Model variant:\n"
            "- slug: {model_slug}\n"
            "- algorithm: {model_algorithm}\n"
            "- variant_config: {model_config_json}\n\n"
            "Generate a complete FreqAI config. Required in freqai: enabled, train_period_days, backtest_period_days, identifier, feature_parameters, data_split_parameters.\n"
            "Set data_split_parameters.shuffle=false and test_size around 0.25.\n"
            "In freqai.model_training_parameters, prefer conservative LightGBM regressor defaults (examples: learning_rate small, n_estimators moderate, max_depth limited, min_child_samples > 10).\n"
            "Keep feature set moderate (a few timeframes, small indicator_periods_candles list).\n\n"
            "Optional extra context:\n{extra_context}\n"
        ),
    },
    {
        "prompt_id": "freqai_lightgbm_classifier_direction",
        "title": "LightGBM classifier (direction up/down)",
        "description": "Classifier-oriented config; highlights that labels must be discrete classes (e.g., up/down).",
        "tags": ["freqai", "lightgbm", "classifier"],
        "system_prompt": (
            "You are an expert Freqtrade/FreqAI configuration engineer. "
            "Return ONLY valid JSON (no markdown, no comments). "
            "Top-level keys: freqtrade, freqai, strategy. "
            "Ensure required freqai fields are present."
        ),
        "user_prompt_template": (
            "Model variant:\n"
            "- slug: {model_slug}\n"
            "- algorithm: {model_algorithm}\n"
            "- variant_config: {model_config_json}\n\n"
            "Generate a FreqAI config intended for a classifier (discrete label classes like 'up'/'down').\n"
            "Include required freqai fields and set data_split_parameters.shuffle=false.\n"
            "In model_training_parameters, set classifier-friendly defaults (e.g. learning_rate, n_estimators, and class_weight/balancing if appropriate).\n"
            "Do NOT include any python code; config JSON only.\n\n"
            "Optional extra context:\n{extra_context}\n"
        ),
    },
    {
        "prompt_id": "freqai_aggressive_high_capacity",
        "title": "FreqAI aggressive (high capacity)",
        "description": "More features + larger training window (higher compute).",
        "tags": ["freqai", "aggressive"],
        "system_prompt": (
            "You are an expert Freqtrade/FreqAI configuration engineer. "
            "Return ONLY valid JSON (no markdown, no comments). "
            "Top-level keys: freqtrade, freqai, strategy. "
            "Prefer higher model capacity and richer feature engineering, but keep required fields valid."
        ),
        "user_prompt_template": (
            "Model variant:\n"
            "- slug: {model_slug}\n"
            "- algorithm: {model_algorithm}\n"
            "- variant_config: {model_config_json}\n\n"
            "Generate an aggressive config:\n"
            "- train_period_days around 60-120\n"
            "- backtest_period_days around 7-14\n"
            "- feature_parameters: more include_timeframes (e.g. 3 timeframes), include_shifted_candles 2-4, indicator_periods_candles includes multiple values\n"
            "- data_split_parameters: test_size around 0.2-0.3, shuffle=false\n"
            "- model_training_parameters: higher capacity (more estimators / deeper nets) appropriate to algorithm\n\n"
            "Optional extra context:\n{extra_context}\n"
        ),
    },
    {
        "prompt_id": "freqai_xgboost_fast",
        "title": "XGBoost (fast iterations)",
        "description": "XGBoost-style params optimized for quicker training and iteration.",
        "tags": ["freqai", "xgboost", "fast"],
        "system_prompt": (
            "You are an expert Freqtrade/FreqAI configuration engineer. "
            "Return ONLY valid JSON (no markdown, no comments). "
            "Top-level keys: freqtrade, freqai, strategy. "
            "Optimize for speed while keeping required freqai fields valid."
        ),
        "user_prompt_template": (
            "Model variant:\n"
            "- slug: {model_slug}\n"
            "- algorithm: {model_algorithm}\n"
            "- variant_config: {model_config_json}\n\n"
            "Generate a fast XGBoost-oriented FreqAI config:\n"
            "- freqai.enabled=true\n"
            "- train_period_days around 14-30\n"
            "- backtest_period_days around 3-7\n"
            "- data_split_parameters: test_size around 0.25, shuffle=false\n"
            "- feature_parameters: include_timeframes limited, include_shifted_candles small, indicator_periods_candles short list\n"
            "- model_training_parameters: XGBoost-friendly params with smaller depth/trees for speed (e.g. n_estimators moderate, max_depth limited, subsample/colsample < 1).\n\n"
            "Optional extra context:\n{extra_context}\n"
        ),
    },
    {
        "prompt_id": "freqai_xgboost_quality",
        "title": "XGBoost (quality / regularized)",
        "description": "XGBoost-style params tuned for stronger generalization (regularization + conservative split).",
        "tags": ["freqai", "xgboost", "quality"],
        "system_prompt": (
            "You are an expert Freqtrade/FreqAI configuration engineer. "
            "Return ONLY valid JSON (no markdown, no comments). "
            "Top-level keys: freqtrade, freqai, strategy. "
            "Prefer regularization and robust defaults; keep chronological split (shuffle=false)."
        ),
        "user_prompt_template": (
            "Model variant:\n"
            "- slug: {model_slug}\n"
            "- algorithm: {model_algorithm}\n"
            "- variant_config: {model_config_json}\n\n"
            "Generate a quality-focused XGBoost-oriented FreqAI config:\n"
            "- freqai.enabled=true\n"
            "- train_period_days around 60\n"
            "- backtest_period_days around 7\n"
            "- data_split_parameters: test_size around 0.2-0.3, shuffle=false\n"
            "- feature_parameters: moderate features (not extreme)\n"
            "- model_training_parameters: include regularization defaults (e.g. reg_lambda, reg_alpha) and sensible depth; avoid overfitting.\n\n"
            "Optional extra context:\n{extra_context}\n"
        ),
    },
    {
        "prompt_id": "freqai_low_resource",
        "title": "FreqAI low-resource (small CPU/RAM)",
        "description": "Minimizes feature explosion and training cost for small machines.",
        "tags": ["freqai", "low-resource"],
        "system_prompt": (
            "You are an expert Freqtrade/FreqAI configuration engineer. "
            "Return ONLY valid JSON (no markdown, no comments). "
            "Top-level keys: freqtrade, freqai, strategy. "
            "Optimize for low CPU/RAM: fewer features, fewer timeframes, smaller training windows."
        ),
        "user_prompt_template": (
            "Model variant:\n"
            "- slug: {model_slug}\n"
            "- algorithm: {model_algorithm}\n"
            "- variant_config: {model_config_json}\n\n"
            "Generate a low-resource config:\n"
            "- train_period_days around 7-14\n"
            "- backtest_period_days around 3\n"
            "- feature_parameters: include_timeframes single timeframe; include_shifted_candles 0-1; indicator_periods_candles minimal; include_corr_pairlist empty or very small\n"
            "- data_split_parameters: test_size around 0.25, shuffle=false\n"
            "- model_training_parameters: low-cost settings (fewer trees/epochs, shallow depth, limited parallelism).\n\n"
            "Optional extra context:\n{extra_context}\n"
        ),
    },
]


def _get_model_autotune_prompt(prompt_id: str) -> dict | None:
    for p in MODEL_AUTOTUNE_PROMPTS:
        if p.get("prompt_id") == prompt_id:
            return p
    return None


_CLASS_RE = re.compile(r"^class\s+(?P<name>[A-Za-z_][A-Za-z0-9_]*)\s*\((?P<bases>[^)]*)\)\s*:", re.MULTILINE)


def _deep_merge(base: dict, override: dict) -> dict:
    out: dict = dict(base)
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def _slugify(value: str) -> str:
    v = value.strip().lower()
    v = re.sub(r"[^a-z0-9]+", "-", v)
    v = re.sub(r"-+", "-", v).strip("-")
    return v or "strategy"


def _detect_strategies(repo_root: Path, limit: int) -> list[tuple[str, str, str]]:
    """Return list of (class_name, relative_file_path, file_content)."""
    hits: list[tuple[str, str, str]] = []
    seen: set[str] = set()

    # Freqtrade convention: user_data/strategies
    preferred_dirs: list[Path] = []
    for rel in [
        Path("user_data") / "strategies",
        Path("strategies"),
        Path("user_data") / "strategies" / "NostalgiaForInfinity",
    ]:
        p = repo_root / rel
        if p.exists() and p.is_dir():
            preferred_dirs.append(p)

    search_roots = preferred_dirs if preferred_dirs else [repo_root]
    for root in search_roots:
        for py in root.rglob("*.py"):
            if py.name == "__init__.py":
                continue
            if "__pycache__" in py.parts:
                continue
            try:
                text = py.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            for m in _CLASS_RE.finditer(text):
                name = m.group("name")
                bases = m.group("bases")
                if "IStrategy" not in bases:
                    continue
                if name in seen:
                    continue
                seen.add(name)
                rel_path = str(py.relative_to(repo_root))
                hits.append((name, rel_path, text))  # Include full file content
                if len(hits) >= limit:
                    return hits
    return hits


def _safe_repo_file(repo_root: Path, rel_path: str) -> Path:
    rel = Path(rel_path)
    if rel.is_absolute() or ".." in rel.parts:
        raise HTTPException(status_code=400, detail="invalid repo_path")
    p = (repo_root / rel).resolve()
    root = repo_root.resolve()
    if root not in p.parents and p != root:
        raise HTTPException(status_code=400, detail="invalid repo_path")
    return p


def _clone_repo(repo_url: str, ref: str | None) -> tuple[Path, tempfile.TemporaryDirectory]:
    tmp = tempfile.TemporaryDirectory(prefix="strategylab_repo_")
    repo_dir = Path(tmp.name) / "repo"

    clone_cmd = ["git", "clone", "--depth", "1"]
    if ref:
        clone_cmd += ["--branch", ref]
    clone_cmd += [repo_url, str(repo_dir)]

    try:
        subprocess.run(clone_cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    except FileNotFoundError:
        tmp.cleanup()
        raise HTTPException(status_code=500, detail="git is not available in backend container")
    except subprocess.CalledProcessError as e:
        tmp.cleanup()
        detail = (e.stderr or e.stdout or "git clone failed").strip()
        raise HTTPException(status_code=400, detail=f"clone failed: {detail}")

    return repo_dir, tmp


def _validate_config_payload(payload: dict) -> None:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="config must be an object")
    if "freqtrade" not in payload or "freqai" not in payload:
        raise HTTPException(status_code=400, detail="config must contain freqtrade and freqai")
    if "strategy" not in payload or not isinstance(payload.get("strategy"), str):
        raise HTTPException(status_code=400, detail="config.strategy must be string")


async def _generate_base_config_for_alignment(
    alignment: StrategyAlignment,
    strategy: StrategyTemplate,
    model: FreqAIModelVariant,
    session: AsyncSession
) -> None:
    """Auto-generate base Freqtrade config with FreqAI for new alignment."""
    
    strategy_name = strategy.strategy_class or strategy.slug
    
    # Base Freqtrade config with FreqAI
    base_config = {
        "max_open_trades": 3,
        "stake_currency": "USDT",
        "stake_amount": "unlimited",
        "tradable_balance_ratio": 0.99,
        "fiat_display_currency": "USD",
        "dry_run": True,
        "dry_run_wallet": 1000,
        "cancel_open_orders_on_exit": False,
        
        "trading_mode": "spot",
        "margin_mode": "",
        
        "unfilledtimeout": {
            "entry": 10,
            "exit": 10,
            "exit_timeout_count": 0,
            "unit": "minutes"
        },
        
        "entry_pricing": {
            "price_side": "same",
            "use_order_book": True,
            "order_book_top": 1,
            "price_last_balance": 0.0,
            "check_depth_of_market": {
                "enabled": False,
                "bids_to_ask_delta": 1
            }
        },
        
        "exit_pricing": {
            "price_side": "same",
            "use_order_book": True,
            "order_book_top": 1
        },
        
        "exchange": {
            "name": "binance",
            "key": "",
            "secret": "",
            "ccxt_config": {},
            "ccxt_async_config": {},
            "pair_whitelist": [
                "BTC/USDT",
                "ETH/USDT",
                "BNB/USDT"
            ],
            "pair_blacklist": [
                "BNB/.*"
            ]
        },
        
        "pairlists": [
            {"method": "StaticPairList"}
        ],
        
        "edge": {
            "enabled": False
        },
        
        "strategy": strategy_name,
        "strategy_path": "/freqtrade/user_data/strategies",
        
        # FreqAI Configuration
        "freqai": {
            "enabled": True,
            "purge_old_models": 2,
            "train_period_days": 30,
            "backtest_period_days": 7,
            "identifier": f"{strategy.slug}_{model.slug}",
            "feature_parameters": {
                "include_timeframes": ["5m", "15m", "1h"],
                "include_corr_pairlist": [],
                "label_period_candles": 24,
                "include_shifted_candles": 2,
                "DI_threshold": 0,
                "weight_factor": 0,
                "principal_component_analysis": False,
                "use_SVM_to_remove_outliers": True,
                "stratify_training_data": 0,
                "indicator_periods_candles": [10, 20, 50]
            },
            "data_split_parameters": {
                "test_size": 0.33,
                "random_state": 1
            },
            "model_training_parameters": {
                "n_estimators": 1000,
                "learning_rate": 0.02,
                "task_type": "CPU"
            }
        }
    }
    
    # Apply model-specific config
    if model.algorithm:
        base_config["freqai"]["model_training_parameters"]["model"] = model.algorithm
    
    if model.config and isinstance(model.config, dict):
        base_config["freqai"]["model_training_parameters"].update(model.config)
    
    # Apply alignment overrides
    if alignment.freqtrade_overrides:
        base_config = _deep_merge(base_config, alignment.freqtrade_overrides)
    
    if alignment.freqai_overrides:
        base_config["freqai"] = _deep_merge(base_config["freqai"], alignment.freqai_overrides)
    
    # Save as active config
    config = ConfigFile(
        config_id=str(uuid4()),
        scope="alignment",
        owner_id=alignment.alignment_id,
        name="config.json",
        content=base_config,
        is_active=True,
    )
    
    session.add(config)
    await session.commit()


class AiOverrideRequest(BaseModel):
    provider: Literal["openrouter", "openai", "local"] | None = None
    token: str | None = Field(default=None, description="Provider API token (Bearer).")
    model: str | None = Field(default=None, description="Provider model id.")


@router.get("/models/autotune-prompts")
async def list_model_autotune_prompts() -> dict:
    items = [ModelAutotunePromptOut.model_validate(p).model_dump() for p in MODEL_AUTOTUNE_PROMPTS]
    return ModelAutotunePromptListOut(items=items).model_dump()


async def _call_ai_model(
    messages: list[dict],
    max_tokens: int = 1200,
    temperature: float = 0.2,
    ai: AiOverrideRequest | None = None,
    session: AsyncSession | None = None,
    user: User | None = None,
) -> str:
    # Default (legacy) behavior: use env-configured AI proxy.
    provider = (ai.provider if ai and ai.provider else "local")

    def _provider_api_url(p: str) -> str:
        if p == "openrouter":
            return "https://openrouter.ai/api/v1/chat/completions"
        if p == "openai":
            return "https://api.openai.com/v1/chat/completions"
        if p == "local":
            if not settings.ai_models_api_url:
                raise HTTPException(status_code=500, detail="AI model is not configured")
            return settings.ai_models_api_url
        raise HTTPException(status_code=400, detail="Unsupported AI provider")

    saved: UserSettings | None = None
    if session is not None and user is not None:
        saved = await session.get(UserSettings, user.user_id)

    def _effective_token(p: str, token: str | None) -> str:
        def _normalize(v: str) -> str:
            s = (v or "").strip()
            if s.lower().startswith("bearer "):
                s = s[7:].strip()
            return s

        if token:
            t = _normalize(token)
            if t:
                return t
        if saved and saved.ai_provider == p and saved.ai_token:
            t = _normalize(saved.ai_token)
            if t:
                return t
        if p == "local" and settings.ai_models_token:
            t = _normalize(settings.ai_models_token)
            if t:
                return t
        raise HTTPException(status_code=400, detail="Missing AI provider token")

    def _effective_model(p: str, model: str | None) -> str:
        if model:
            return model
        if saved and saved.ai_provider == p:
            if p == "openrouter" and saved.openrouter_model_id:
                return saved.openrouter_model_id
        if p == "local" and settings.ai_models_model:
            return settings.ai_models_model
        if p == "openai":
            return "gpt-4o-mini"
        raise HTTPException(status_code=400, detail="Missing AI model")

    api_url = _provider_api_url(provider)
    token = _effective_token(provider, ai.token if ai else None)
    model = _effective_model(provider, ai.model if ai else None)

    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    if provider == "openrouter":
        headers.setdefault("X-Title", "TRADE_SYSTEM")

    timeout = httpx.Timeout(30.0, read=60.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.post(api_url, headers=headers, json=payload)
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"AI request failed: {exc}")

    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"AI error: {resp.text}")

    data = resp.json()
    choice = (data.get("choices") or [{}])[0]
    content = choice.get("message", {}).get("content")
    if not content:
        raise HTTPException(status_code=502, detail="AI returned empty content")
    return content


_CONFIG_SCOPE_MODEL = {
    "strategy": StrategyTemplate,
    "model": FreqAIModelVariant,
    "alignment": StrategyAlignment,
}


async def _ensure_owner_exists(scope: str, owner_id: str, session: AsyncSession) -> None:
    model_cls = _CONFIG_SCOPE_MODEL.get(scope)
    if not model_cls:
        raise HTTPException(status_code=400, detail="invalid scope")
    obj = await session.get(model_cls, owner_id)
    if not obj:
        raise HTTPException(status_code=400, detail=f"unknown owner for scope {scope}")


@router.get("/strategies")
async def list_strategies(
    session: AsyncSession = Depends(get_db),
    limit: int | None = Query(default=None, ge=1, le=1000),
    offset: int = Query(default=0, ge=0, le=1_000_000),
    lite: bool = Query(default=False, description="If true, omits heavy fields from meta (e.g. embedded code)"),
) -> list[dict]:
    q = select(StrategyTemplate).order_by(StrategyTemplate.updated_at.desc())
    if limit is not None:
        q = q.limit(limit).offset(offset)
    result = await session.execute(q)
    rows = result.scalars().all()

    out: list[dict] = []
    for r in rows:
        d = StrategyTemplateOut.model_validate(r, from_attributes=True).model_dump()
        if lite and isinstance(d.get("meta"), dict):
            # Keep metadata, but drop large blobs.
            meta = dict(d["meta"])
            meta.pop("code", None)
            d["meta"] = meta
        out.append(d)

    return out


@router.post("/strategies")
async def create_strategy(p: StrategyTemplateCreate, session: AsyncSession = Depends(get_db)) -> dict:
    s = StrategyTemplate(
        strategy_id=str(uuid4()),
        slug=p.slug,
        name=p.name,
        source_type=p.source_type,
        source_url=p.source_url,
        source_ref=p.source_ref,
        strategy_class=p.strategy_class,
        description=p.description,
        tags=p.tags,
        meta=p.meta,
    )

    session.add(s)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="slug already exists")

    await session.refresh(s)
    
    # If code is provided in meta, create physical file
    if p.meta and 'code' in p.meta and p.source_type == 'store':
        try:
            strategies_path = Path(settings.freqtrade_user_data) / "strategies"
            strategies_path.mkdir(parents=True, exist_ok=True)
            file_name = f"{p.slug}.py"
            file_path = strategies_path / file_name
            file_path.write_text(str(p.meta['code']), encoding='utf-8')
        except Exception as e:
            print(f"Warning: Failed to create strategy file: {e}")
    
    return StrategyTemplateOut.model_validate(s, from_attributes=True).model_dump()


@router.post("/strategies/import")
async def import_strategies(payload: dict, session: AsyncSession = Depends(get_db)) -> dict:
    """Import strategy templates by cloning a git repo and scanning for IStrategy classes.

    NOTE: We only store metadata (class name + repo reference). We do NOT vendor strategy code.
    """

    repo_url = str(payload.get("repo_url") or "").strip()
    ref = str(payload.get("ref") or "").strip() or None
    limit = int(payload.get("limit") or 10)
    tag = str(payload.get("tag") or "").strip() or None

    if not repo_url:
        raise HTTPException(status_code=400, detail="repo_url is required")
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit must be 1..100")

    with tempfile.TemporaryDirectory(prefix="strategylab_import_") as tmp:
        repo_dir = Path(tmp) / "repo"

        clone_cmd = ["git", "clone", "--depth", "1"]
        if ref:
            clone_cmd += ["--branch", ref]
        clone_cmd += [repo_url, str(repo_dir)]

        try:
            subprocess.run(clone_cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        except FileNotFoundError:
            raise HTTPException(status_code=500, detail="git is not available in backend container")
        except subprocess.CalledProcessError as e:
            detail = (e.stderr or e.stdout or "git clone failed").strip()
            raise HTTPException(status_code=400, detail=f"clone failed: {detail}")

        detected = _detect_strategies(repo_dir, limit=limit)

    imported: list[dict] = []
    skipped: list[dict] = []

    for class_name, rel_path, file_content in detected:
        slug = _slugify(class_name)
        tags = ["imported"]
        if tag:
            tags.append(tag)
        meta = {
            "repo_path": rel_path,
            "source": "import",
            "code": file_content,  # Save full strategy code
        }
        s = StrategyTemplate(
            strategy_id=str(uuid4()),
            slug=slug,
            name=class_name,
            source_type="git",
            source_url=repo_url,
            source_ref=ref,
            strategy_class=class_name,
            description=None,
            tags=tags,
            meta=meta,
        )
        session.add(s)
        try:
            await session.commit()
            await session.refresh(s)
            imported.append(StrategyTemplateOut.model_validate(s, from_attributes=True).model_dump())
        except IntegrityError:
            await session.rollback()
            skipped.append({"slug": slug, "name": class_name, "reason": "slug already exists"})

    return {"imported": imported, "skipped": skipped, "detected": len(detected)}


@router.put("/strategies/{strategy_id}")
async def update_strategy(strategy_id: str, p: StrategyTemplateUpdate, session: AsyncSession = Depends(get_db)) -> dict:
    if p.strategy_id != strategy_id:
        raise HTTPException(status_code=400, detail="strategy_id mismatch")

    s = await session.get(StrategyTemplate, strategy_id)
    if not s:
        raise HTTPException(status_code=404, detail="strategy not found")

    s.slug = p.slug
    s.name = p.name
    s.source_type = p.source_type
    s.source_url = p.source_url
    s.source_ref = p.source_ref
    s.strategy_class = p.strategy_class
    s.description = p.description
    s.tags = p.tags
    s.meta = p.meta
    s.updated_at = datetime.now(timezone.utc)

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="slug already exists")

    await session.refresh(s)
    return StrategyTemplateOut.model_validate(s, from_attributes=True).model_dump()


@router.delete("/strategies/{strategy_id}")
async def delete_strategy(strategy_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    s = await session.get(StrategyTemplate, strategy_id)
    if not s:
        raise HTTPException(status_code=404, detail="strategy not found")
    await session.delete(s)
    await session.commit()
    return {"deleted": True, "strategy_id": strategy_id}


@router.get("/strategies/{strategy_id}/source")
async def get_strategy_source(
    strategy_id: str,
    repo_path: str | None = Query(default=None, description="optional explicit path to strategy file inside repo"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Fetch and return the strategy .py source file from its git repo.

    If repo_path is not provided, we use stored meta.repo_path, or scan for the strategy_class.
    """

    s = await session.get(StrategyTemplate, strategy_id)
    if not s:
        raise HTTPException(status_code=404, detail="strategy not found")

    repo_url = (s.source_url or "").strip()
    ref = (s.source_ref or "").strip() or None
    if not repo_url:
        raise HTTPException(status_code=400, detail="strategy has no source_url")

    repo_dir, tmp = _clone_repo(repo_url, ref)
    try:
        rel_path: str | None = None
        if repo_path:
            rel_path = repo_path
        else:
            try:
                rel_path = str((s.meta or {}).get("repo_path") or "").strip() or None
            except Exception:
                rel_path = None

        if not rel_path and s.strategy_class:
            detected = _detect_strategies(repo_dir, limit=200)
            for class_name, path, _ in detected:
                if class_name == s.strategy_class:
                    rel_path = path
                    break

        if not rel_path:
            raise HTTPException(status_code=404, detail="strategy source path is unknown")

        py = _safe_repo_file(repo_dir, rel_path)
        if not py.exists() or not py.is_file():
            raise HTTPException(status_code=404, detail=f"strategy file not found: {rel_path}")

        try:
            content = py.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            raise HTTPException(status_code=500, detail="failed to read strategy file")

        return {
          "strategy_id": s.strategy_id,
          "strategy_class": s.strategy_class,
          "repo_url": repo_url,
          "ref": ref,
          "path": rel_path,
          "filename": py.name,
          "content": content,
        }
    finally:
        tmp.cleanup()


@router.post("/strategies/{strategy_id}/source")
async def update_strategy_source(
    strategy_id: str,
    payload: dict,
    session: AsyncSession = Depends(get_db),
    user: User | None = Depends(maybe_current_user),
) -> dict:
    """Update strategy source code in the repository (not fully implemented commit back).
    For now this simulates saving by returning success, OR writing to local disk if local repo.
    """
    filename = payload.get("filename")
    code = payload.get("code")
    
    if not filename or code is None:
         raise HTTPException(status_code=400, detail="filename and code required")

    # Real implementation would:
    # 1. Clone repo (or use cache)
    # 2. Update file
    # 3. Commit & Push (with proper auth)
    
    # For this dev environment where /workspaces/TRADE_SYSTEM/freqtrade/user_data/strategies might be mounted
    # We can try to write if it maps to a local file.
    
    # Check if we can find it in user_data/strategies for direct edit
    local_strat_dir = Path("/freqtrade/user_data/strategies")
    # if using different path structure, adjust.
    
    # Just a mock success for UI feedback in this demo context
    # unless we are sure about the path mapping.
    
    return {"status": "saved (mock)", "filename": filename, "len": len(code)}


@router.post("/strategies/{strategy_id}/autotune")
async def autotune_strategy(
    strategy_id: str,
    session: AsyncSession = Depends(get_db),
    user: User | None = Depends(maybe_current_user),
    ai: AiOverrideRequest | None = Body(default=None),
) -> dict:
    s = await session.get(StrategyTemplate, strategy_id)
    if not s:
        raise HTTPException(status_code=404, detail="strategy not found")

    sys_msg = {
        "role": "system",
        "content": "Generate Freqtrade+FreqAI JSON config for the given strategy. Output ONLY JSON with keys freqtrade,freqai,strategy.",
    }
    user_msg = {
        "role": "user",
        "content": (
            f"Strategy slug: {s.slug}\nclass: {s.strategy_class or s.slug}\n"
            f"description: {s.description}\ntags: {s.tags}\nmeta: {json.dumps(s.meta or {})}\n"
            "Return JSON; include strategy field with class name."
        ),
    }
    content = await _call_ai_model([sys_msg, user_msg], max_tokens=1000, temperature=0.25, ai=ai, session=session, user=user)
    try:
        cfg_json = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI response invalid")
    cfg_json.setdefault("freqtrade", {})
    cfg_json.setdefault("freqai", {})
    if not cfg_json.get("strategy"):
        cfg_json["strategy"] = s.strategy_class or s.slug
    _validate_config_payload(cfg_json)
    await session.execute(
        update(ConfigFile).where(ConfigFile.scope == "strategy", ConfigFile.owner_id == strategy_id).values(is_active=False)
    )
    cfg = ConfigFile(
        config_id=str(uuid4()),
        scope="strategy",
        owner_id=strategy_id,
        name="strategy-config.json",
        content=cfg_json,
        is_active=True,
    )
    session.add(cfg)
    await session.commit()
    await session.refresh(cfg)
    return {"config": ConfigFileOut.model_validate(cfg, from_attributes=True).model_dump(), "source": "ai"}


@router.get("/strategies/{strategy_id}/sources")
async def list_strategy_sources(strategy_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    """List available strategy files (relative paths) in the repo (limited scan)."""

    s = await session.get(StrategyTemplate, strategy_id)
    if not s:
        raise HTTPException(status_code=404, detail="strategy not found")

    repo_url = (s.source_url or "").strip()
    ref = (s.source_ref or "").strip() or None
    if not repo_url:
        raise HTTPException(status_code=400, detail="strategy has no source_url")

    repo_dir, tmp = _clone_repo(repo_url, ref)
    try:
        detected = _detect_strategies(repo_dir, limit=200)
        items = [
            {
                "strategy_class": cls,
                "path": path,
                "filename": Path(path).name,
            }
            for cls, path, _ in detected
        ]
        return {"strategy_id": s.strategy_id, "count": len(items), "items": items}
    finally:
        tmp.cleanup()


@router.get("/models")
async def list_models(session: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await session.execute(select(FreqAIModelVariant).order_by(FreqAIModelVariant.updated_at.desc()))
    rows = result.scalars().all()
    return [FreqAIModelVariantOut.model_validate(r, from_attributes=True).model_dump() for r in rows]


@router.post("/models")
async def create_model(p: FreqAIModelVariantCreate, session: AsyncSession = Depends(get_db)) -> dict:
    m = FreqAIModelVariant(
        model_id=str(uuid4()),
        slug=p.slug,
        name=p.name,
        algorithm=p.algorithm,
        config=p.config,
        description=p.description,
        tags=p.tags,
    )

    session.add(m)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="slug already exists")

    await session.refresh(m)
    
    # If code is provided in config, create physical JSON file
    if p.config and 'code' in p.config:
        try:
            configs_path = Path(settings.freqtrade_user_data) / "configs"
            configs_path.mkdir(parents=True, exist_ok=True)
            file_name = f"{p.slug}.json"
            file_path = configs_path / file_name
            
            # Remove 'code' from config before saving to file
            clean_config = {k: v for k, v in p.config.items() if k != 'code'}
            file_path.write_text(json.dumps(clean_config, indent=2), encoding='utf-8')
        except Exception as e:
            print(f"Warning: Failed to create model config file: {e}")
    
    return FreqAIModelVariantOut.model_validate(m, from_attributes=True).model_dump()


@router.put("/models/{model_id}")
async def update_model(model_id: str, p: FreqAIModelVariantUpdate, session: AsyncSession = Depends(get_db)) -> dict:
    if p.model_id != model_id:
        raise HTTPException(status_code=400, detail="model_id mismatch")

    m = await session.get(FreqAIModelVariant, model_id)
    if not m:
        raise HTTPException(status_code=404, detail="model not found")

    m.slug = p.slug
    m.name = p.name
    m.algorithm = p.algorithm
    m.config = p.config
    m.description = p.description
    m.tags = p.tags
    m.updated_at = datetime.now(timezone.utc)

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="slug already exists")

    await session.refresh(m)
    return FreqAIModelVariantOut.model_validate(m, from_attributes=True).model_dump()


@router.post("/models/{model_id}/autotune")
async def autotune_model(
    model_id: str,
    session: AsyncSession = Depends(get_db),
    user: User | None = Depends(maybe_current_user),
    payload: dict | None = Body(default=None),
) -> dict:
    m = await session.get(FreqAIModelVariant, model_id)
    if not m:
        raise HTTPException(status_code=404, detail="model not found")

    # Backwards compatible body parsing:
    # - legacy: {provider, token?, model?}                 -> AiOverrideRequest
    # - new:    {prompt_id?, context?, ai?:{provider...}}  -> prompt selection + optional ai override
    prompt_id: str | None = None
    extra_context: str | None = None
    ai: AiOverrideRequest | None = None
    if payload and isinstance(payload, dict):
        if "provider" in payload:
            ai = AiOverrideRequest.model_validate(payload)
        else:
            prompt_id = payload.get("prompt_id") if isinstance(payload.get("prompt_id"), str) else None
            extra_context = payload.get("context") if isinstance(payload.get("context"), str) else None
            if payload.get("ai") is not None:
                ai = AiOverrideRequest.model_validate(payload.get("ai"))

    prompt = _get_model_autotune_prompt(prompt_id) if prompt_id else None
    if prompt_id and not prompt:
        raise HTTPException(status_code=404, detail="unknown prompt_id")

    if prompt:
        sys_msg = {"role": "system", "content": str(prompt.get("system_prompt") or "")}
        user_msg = {
            "role": "user",
            "content": str(prompt.get("user_prompt_template") or "").format(
                model_slug=m.slug,
                model_algorithm=m.algorithm,
                model_config_json=json.dumps(m.config or {}, ensure_ascii=False),
                model_description=m.description or "",
                model_tags_json=json.dumps(m.tags or [], ensure_ascii=False),
                extra_context=extra_context or "",
            ),
        }
    else:
        sys_msg = {
            "role": "system",
            "content": "Generate Freqtrade+FreqAI JSON config tuned for the given ML model variant. Output ONLY JSON with keys freqtrade,freqai,strategy.",
        }
        user_msg = {
            "role": "user",
            "content": (
                f"Model slug: {m.slug}\nalgorithm: {m.algorithm}\n"
                f"config: {json.dumps(m.config or {})}\n"
                f"description: {m.description}\ntags: {m.tags}\n"
                "Return JSON; include strategy field with placeholder (set same as slug if unknown)."
            ),
        }
    content = await _call_ai_model(
        [sys_msg, user_msg],
        max_tokens=1000,
        temperature=0.25,
        ai=ai,
        session=session,
        user=user,
    )
    try:
        cfg_json = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI response invalid")
    cfg_json.setdefault("freqtrade", {})
    cfg_json.setdefault("freqai", {})
    if not cfg_json.get("strategy"):
        cfg_json["strategy"] = m.slug
    _validate_config_payload(cfg_json)

    await session.execute(
        update(ConfigFile).where(ConfigFile.scope == "model", ConfigFile.owner_id == model_id).values(is_active=False)
    )
    cfg = ConfigFile(
        config_id=str(uuid4()),
        scope="model",
        owner_id=model_id,
        name="model-config.json",
        content=cfg_json,
        is_active=True,
    )
    session.add(cfg)
    await session.commit()
    await session.refresh(cfg)
    return {"config": ConfigFileOut.model_validate(cfg, from_attributes=True).model_dump(), "source": "ai"}


@router.delete("/models/{model_id}")
async def delete_model(model_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    m = await session.get(FreqAIModelVariant, model_id)
    if not m:
        raise HTTPException(status_code=404, detail="model not found")
    await session.delete(m)
    await session.commit()
    return {"deleted": True, "model_id": model_id}


@router.get("/alignments")
async def list_alignments(session: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await session.execute(select(StrategyAlignment).order_by(StrategyAlignment.updated_at.desc()))
    rows = result.scalars().all()
    return [StrategyAlignmentOut.model_validate(r, from_attributes=True).model_dump() for r in rows]


@router.post("/alignments")
async def create_alignment(p: StrategyAlignmentCreate, session: AsyncSession = Depends(get_db)) -> dict:
    # Validate refs exist (small and explicit)
    strategy = await session.get(StrategyTemplate, p.strategy_id)
    if not strategy:
        raise HTTPException(status_code=400, detail="unknown strategy_id")
    model = await session.get(FreqAIModelVariant, p.model_id)
    if not model:
        raise HTTPException(status_code=400, detail="unknown model_id")

    a = StrategyAlignment(
        alignment_id=str(uuid4()),
        strategy_id=p.strategy_id,
        model_id=p.model_id,
        profile=p.profile,
        scope=p.scope,
        defaults=p.defaults,
        mapping=p.mapping,
        freqtrade_overrides=p.freqtrade_overrides,
        freqai_overrides=p.freqai_overrides,
        status=p.status,
    )

    session.add(a)
    await session.commit()
    await session.refresh(a)
    
    # Auto-generate base config for this alignment
    await _generate_base_config_for_alignment(a, strategy, model, session)
    
    return StrategyAlignmentOut.model_validate(a, from_attributes=True).model_dump()


@router.put("/alignments/{alignment_id}")
async def update_alignment(alignment_id: str, p: StrategyAlignmentUpdate, session: AsyncSession = Depends(get_db)) -> dict:
    if p.alignment_id != alignment_id:
        raise HTTPException(status_code=400, detail="alignment_id mismatch")

    a = await session.get(StrategyAlignment, alignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="alignment not found")

    if not await session.get(StrategyTemplate, p.strategy_id):
        raise HTTPException(status_code=400, detail="unknown strategy_id")
    if not await session.get(FreqAIModelVariant, p.model_id):
        raise HTTPException(status_code=400, detail="unknown model_id")

    a.strategy_id = p.strategy_id
    a.model_id = p.model_id
    a.profile = p.profile
    a.scope = p.scope
    a.defaults = p.defaults
    a.mapping = p.mapping
    a.freqtrade_overrides = p.freqtrade_overrides
    a.freqai_overrides = p.freqai_overrides
    a.status = p.status
    a.updated_at = datetime.now(timezone.utc)

    await session.commit()
    await session.refresh(a)
    return StrategyAlignmentOut.model_validate(a, from_attributes=True).model_dump()


@router.delete("/alignments/{alignment_id}")
async def delete_alignment(alignment_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    a = await session.get(StrategyAlignment, alignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="alignment not found")
    await session.delete(a)
    await session.commit()
    return {"deleted": True, "alignment_id": alignment_id}


@router.get("/configs")
async def list_configs(
    scope: str = Query(..., description="strategy|model|alignment"),
    owner_id: str = Query(..., description="id of the owner object"),
    session: AsyncSession = Depends(get_db),
) -> list[dict]:
    await _ensure_owner_exists(scope, owner_id, session)
    result = await session.execute(
        select(ConfigFile)
        .where(ConfigFile.scope == scope, ConfigFile.owner_id == owner_id)
        .order_by(ConfigFile.created_at.desc())
    )
    rows = result.scalars().all()
    return [ConfigFileOut.model_validate(r, from_attributes=True).model_dump() for r in rows]


@router.get("/configs/{config_id}")
async def get_config(config_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    cfg = await session.get(ConfigFile, config_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="config not found")
    return ConfigFileOut.model_validate(cfg, from_attributes=True).model_dump()


@router.post("/configs/{config_id}/activate")
async def activate_config(config_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    """Explicitly activate a config version.

    Deactivates other configs for the same (scope, owner_id, regime).
    """

    cfg = await session.get(ConfigFile, config_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="config not found")

    await session.execute(
        update(ConfigFile)
        .where(
            (ConfigFile.scope == cfg.scope)
            & (ConfigFile.owner_id == cfg.owner_id)
            & (ConfigFile.regime == cfg.regime)
        )
        .values(is_active=False)
    )
    cfg.is_active = True
    await session.commit()
    await session.refresh(cfg)
    return {"activated": True, "config": ConfigFileOut.model_validate(cfg, from_attributes=True).model_dump()}


@router.post("/configs")
async def create_config(p: ConfigFileCreate, session: AsyncSession = Depends(get_db)) -> dict:
    await _ensure_owner_exists(p.scope, p.owner_id, session)

    if p.make_active:
        await session.execute(
            update(ConfigFile).where(ConfigFile.scope == p.scope, ConfigFile.owner_id == p.owner_id).values(is_active=False)
        )

    cfg = ConfigFile(
        config_id=str(uuid4()),
        scope=p.scope,
        owner_id=p.owner_id,
        name=p.name,
        content=p.content,
        is_active=p.make_active,
    )
    session.add(cfg)
    await session.commit()
    await session.refresh(cfg)
    return ConfigFileOut.model_validate(cfg, from_attributes=True).model_dump()


@router.get("/configs/{config_id}/params")
async def get_config_params(
    config_id: str,
    materialize: bool = Query(default=True, description="If true and params are missing, materialize from content"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    cfg = await session.get(ConfigFile, config_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="config not found")

    result = await session.execute(
        select(ConfigParam).where(ConfigParam.config_id == config_id).order_by(ConfigParam.path.asc())
    )
    params = result.scalars().all()

    source = "stored"
    if not params and materialize:
        flat = flatten_config_to_params(cfg.content or {})
        for p in flat:
            session.add(
                ConfigParam(
                    param_id=new_param_id(),
                    config_id=config_id,
                    path=p.path,
                    value=p.value,
                    value_type=p.value_type,
                )
            )
        await session.commit()
        source = "materialized"
        result = await session.execute(
            select(ConfigParam).where(ConfigParam.config_id == config_id).order_by(ConfigParam.path.asc())
        )
        params = result.scalars().all()

    return ConfigParamsOut(
        config=ConfigFileOut.model_validate(cfg, from_attributes=True),
        params=[ConfigParamOut.model_validate(r, from_attributes=True) for r in params],
        source=source,
    ).model_dump()


@router.post("/configs/{config_id}/params")
async def save_config_params(
    config_id: str,
    p: ConfigParamsSaveRequest,
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Create a new ConfigFile variant from edited (path,value) params.

    The new config keeps the same scope/owner/regime as the parent, sets kind=variant,
    and materializes its params into config_params.
    """

    base_cfg = await session.get(ConfigFile, config_id)
    if not base_cfg:
        raise HTTPException(status_code=404, detail="config not found")

    try:
        new_content = build_config_from_params([pp.model_dump() for pp in p.params])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if p.make_active:
        await session.execute(
            update(ConfigFile)
            .where(ConfigFile.scope == base_cfg.scope, ConfigFile.owner_id == base_cfg.owner_id)
            .values(is_active=False)
        )

    new_id = str(uuid4())
    new_cfg = ConfigFile(
        config_id=new_id,
        scope=base_cfg.scope,
        owner_id=base_cfg.owner_id,
        name=p.name or (base_cfg.name or "config.json"),
        content=new_content,
        is_active=p.make_active,
        regime=getattr(base_cfg, "regime", "regular"),
        kind="variant",
        parent_config_id=base_cfg.config_id,
    )
    session.add(new_cfg)

    # materialize rows
    flat = flatten_config_to_params(new_content)
    for row in flat:
        session.add(
            ConfigParam(
                param_id=new_param_id(),
                config_id=new_id,
                path=row.path,
                value=row.value,
                value_type=row.value_type,
            )
        )

    await session.commit()
    await session.refresh(new_cfg)

    stored = await session.execute(
        select(ConfigParam).where(ConfigParam.config_id == new_id).order_by(ConfigParam.path.asc())
    )
    params = stored.scalars().all()

    return ConfigParamsOut(
        config=ConfigFileOut.model_validate(new_cfg, from_attributes=True),
        params=[ConfigParamOut.model_validate(r, from_attributes=True) for r in params],
        source="stored",
    ).model_dump()


@router.patch("/configs/{config_id}")
async def update_config(config_id: str, p: ConfigFileUpdate, session: AsyncSession = Depends(get_db)) -> dict:
    if p.config_id != config_id:
        raise HTTPException(status_code=400, detail="config_id mismatch")

    cfg = await session.get(ConfigFile, config_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="config not found")

    if p.name is not None:
        cfg.name = p.name
    if p.content is not None:
        cfg.content = p.content

    if p.is_active is not None:
        if p.is_active:
            await session.execute(
                update(ConfigFile)
                .where(ConfigFile.scope == cfg.scope, ConfigFile.owner_id == cfg.owner_id)
                .values(is_active=False)
            )
        cfg.is_active = p.is_active

    cfg.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(cfg)
    return ConfigFileOut.model_validate(cfg, from_attributes=True).model_dump()


@router.post("/configs/{config_id}/activate")
async def activate_config(config_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    cfg = await session.get(ConfigFile, config_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="config not found")

    await session.execute(
        update(ConfigFile)
        .where(ConfigFile.scope == cfg.scope, ConfigFile.owner_id == cfg.owner_id)
        .values(is_active=False)
    )
    cfg.is_active = True
    cfg.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(cfg)
    return ConfigFileOut.model_validate(cfg, from_attributes=True).model_dump()


@router.post("/alignments/{alignment_id}/autotune")
async def autotune_alignment(
    alignment_id: str,
    session: AsyncSession = Depends(get_db),
    user: User | None = Depends(maybe_current_user),
    ai: AiOverrideRequest | None = Body(default=None),
) -> dict:
    """Ask AI model to propose a config.json for the alignment and store it as active."""

    a = await session.get(StrategyAlignment, alignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="alignment not found")
    s = await session.get(StrategyTemplate, a.strategy_id)
    m = await session.get(FreqAIModelVariant, a.model_id)
    if not s or not m:
        raise HTTPException(status_code=400, detail="alignment references missing strategy/model")

    # Build prompt
    sys_msg = {
        "role": "system",
        "content": (
            "You are an expert Freqtrade/FreqAI configurator. "
            "Generate a single JSON config combining freqtrade + freqai sections. "
            "Output ONLY valid JSON without code fences or comments."
        ),
    }
    user_msg = {
        "role": "user",
        "content": (
            "Strategy:\n"
            f"slug: {s.slug}\nclass: {s.strategy_class or s.slug}\n"
            f"tags: {s.tags}\nmeta: {json.dumps(s.meta or {})}\n\n"
            "Model:\n"
            f"algorithm: {m.algorithm}\nconfig: {json.dumps(m.config or {})}\n\n"
            "Alignment:\n"
            f"profile: {a.profile}\nscope: {json.dumps(a.scope or {})}\n"
            f"defaults: {json.dumps(a.defaults or {})}\n"
            f"mapping: {json.dumps(a.mapping or {})}\n"
            f"freqtrade_overrides: {json.dumps(a.freqtrade_overrides or {})}\n"
            f"freqai_overrides: {json.dumps(a.freqai_overrides or {})}\n\n"
            "Return JSON with keys: freqtrade, freqai, strategy (string, class name)."
        ),
    }

    content = await _call_ai_model(
        [sys_msg, user_msg],
        max_tokens=1400,
        temperature=0.25,
        ai=ai,
        session=session,
        user=user,
    )

    def _try_parse(raw: str) -> dict:
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError:
            raise
        _validate_config_payload(obj)
        if "strategy" not in obj:
            obj["strategy"] = s.strategy_class or s.slug
        return obj

    try:
        cfg_json = _try_parse(content)
    except Exception as first_err:
        # attempt repair by asking model to fix JSON
        repair_sys = {"role": "system", "content": "Return ONLY valid JSON. Fix formatting/quotes. Keep keys: freqtrade, freqai, strategy."}
        repair_user = {"role": "user", "content": f"Repair this into valid JSON: {content[:5000]}"}
        repaired = await _call_ai_model(
            [repair_sys, repair_user],
            max_tokens=1200,
            temperature=0.1,
            ai=ai,
            session=session,
            user=user,
        )
        try:
            cfg_json = _try_parse(repaired)
        except Exception:
            raise HTTPException(status_code=502, detail=f"AI response invalid: {first_err}")

    await session.execute(
        update(ConfigFile)
        .where(ConfigFile.scope == "alignment", ConfigFile.owner_id == alignment_id)
        .values(is_active=False)
    )
    cfg = ConfigFile(
        config_id=str(uuid4()),
        scope="alignment",
        owner_id=alignment_id,
        name="config.json",
        content=cfg_json,
        is_active=True,
    )
    session.add(cfg)
    await session.commit()
    await session.refresh(cfg)

    return {
        "config": ConfigFileOut.model_validate(cfg, from_attributes=True).model_dump(),
        "source": "ai",
    }


@router.post("/alignments/{alignment_id}/autotune/combined")
async def autotune_alignment_combined(alignment_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    """Combine active strategy+model configs with alignment overrides into one config and store as active."""
    try:
        return await build_combined_alignment_config(alignment_id, session)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@router.post("/alignments/{alignment_id}/autotune/repair")
async def repair_alignment_config(
    alignment_id: str,
    session: AsyncSession = Depends(get_db),
    user: User | None = Depends(maybe_current_user),
    ai: AiOverrideRequest | None = Body(default=None),
) -> dict:
    cfg = (
        await session.execute(
            select(ConfigFile)
            .where(ConfigFile.scope == "alignment", ConfigFile.owner_id == alignment_id)
            .order_by(ConfigFile.updated_at.desc())
        )
    ).scalars().first()
    if not cfg:
        raise HTTPException(status_code=404, detail="no config to repair")

    repair_sys = {
        "role": "system",
        "content": "Return ONLY valid JSON. Keep keys: freqtrade, freqai, strategy. Preserve semantics; fix structural issues.",
    }
    repair_user = {"role": "user", "content": json.dumps(cfg.content)}
    repaired = await _call_ai_model(
        [repair_sys, repair_user],
        max_tokens=1200,
        temperature=0.05,
        ai=ai,
        session=session,
        user=user,
    )

    try:
        cfg_json = json.loads(repaired)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI repair response invalid JSON")
    _validate_config_payload(cfg_json)

    await session.execute(
        update(ConfigFile)
        .where(ConfigFile.scope == "alignment", ConfigFile.owner_id == alignment_id)
        .values(is_active=False)
    )
    new_cfg = ConfigFile(
        config_id=str(uuid4()),
        scope="alignment",
        owner_id=alignment_id,
        name="config.json",
        content=cfg_json,
        is_active=True,
    )
    session.add(new_cfg)
    await session.commit()
    await session.refresh(new_cfg)

    return {"config": ConfigFileOut.model_validate(new_cfg, from_attributes=True).model_dump(), "source": "repair"}


async def _generate_bot_for_alignment(alignment_id: str, session: AsyncSession, user: User | None) -> dict:
    try:
        return await generate_bot_for_alignment(alignment_id, session, user_id=(user.user_id if user else None))
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@router.post("/alignments/{alignment_id}/generate-bot")
async def generate_bot(
    alignment_id: str,
    session: AsyncSession = Depends(get_db),
    user: User | None = Depends(maybe_current_user),
) -> dict:
    return await _generate_bot_for_alignment(alignment_id, session, user)


@router.get("/alignments/{alignment_id}/export")
async def export_alignment(alignment_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    """Return a normalized JSON payload to help sync UI data with Freqtrade/FreqAI configs."""
    try:
        return await build_alignment_export_payload(session, alignment_id)
    except AlignmentExportError as e:
        msg = str(e)
        if msg == "alignment not found":
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)


@router.get("/alignments/{alignment_id}/config-file")
async def alignment_config_file(alignment_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    """Generate a runnable Freqtrade config.json for a given alignment.

    This supports the UX where "Model → Config" opens a ready-to-save config.json
    (it includes both `strategy` and `freqai` sections).
    """

    a = await session.get(StrategyAlignment, alignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="alignment not found")
    s = await session.get(StrategyTemplate, a.strategy_id)
    m = await session.get(FreqAIModelVariant, a.model_id)
    if not s or not m:
        raise HTTPException(status_code=400, detail="alignment references missing strategy/model")

    active_cfg = (
        await session.execute(
            select(ConfigFile)
            .where(ConfigFile.scope == "alignment", ConfigFile.owner_id == alignment_id, ConfigFile.is_active.is_(True))
            .order_by(ConfigFile.updated_at.desc())
        )
    ).scalars().first()
    if active_cfg:
        return {
            "alignment_id": a.alignment_id,
            "strategy": StrategyTemplateOut.model_validate(s, from_attributes=True).model_dump(),
            "model": FreqAIModelVariantOut.model_validate(m, from_attributes=True).model_dump(),
            "config_id": active_cfg.config_id,
            "filename": active_cfg.name or "config.json",
            "config": active_cfg.content or {},
            "source": "stored",
        }

    strategy_name = s.strategy_class or s.slug
    freqai_base: dict = {
        "enabled": True,
        "identifier": m.slug,
        "profile": a.profile or "default",
    }

    # If model.config already looks like a full freqai config chunk (feature/model params), merge it.
    # Otherwise, treat it as model_training_parameters.
    model_cfg = m.config or {}
    if isinstance(model_cfg, dict) and any(k in model_cfg for k in ["feature_parameters", "data_split_parameters", "model_training_parameters"]):
        freqai_base = _deep_merge(freqai_base, model_cfg)
    elif isinstance(model_cfg, dict) and model_cfg:
        freqai_base["model_training_parameters"] = model_cfg

    # Alignment overrides
    if isinstance(a.freqai_overrides, dict) and a.freqai_overrides:
        freqai_base = _deep_merge(freqai_base, a.freqai_overrides)

    base_cfg: dict = {
        "$schema": "https://schema.freqtrade.io/schema.json",
        "bot_name": "FreqAI_Bot",
        "dry_run": True,
        "dry_run_wallet": 1000,
        "timeframe": "5m",
        "max_open_trades": 3,
        "stake_amount": "unlimited",
        "stake_currency": "USDT",
        "tradable_balance_ratio": 0.99,
        "fiat_display_currency": "USD",
        "exchange": {
            "name": "bybit",
            "key": "",
            "secret": "",
            "pair_whitelist": [],
            "pair_blacklist": [],
        },
        "pairlists": [{"method": "StaticPairList"}],
        "strategy": strategy_name,
        "freqai": freqai_base,
    }

    cfg = base_cfg
    if isinstance(a.freqtrade_overrides, dict) and a.freqtrade_overrides:
        cfg = _deep_merge(cfg, a.freqtrade_overrides)

    return {
        "alignment_id": a.alignment_id,
        "strategy": StrategyTemplateOut.model_validate(s, from_attributes=True).model_dump(),
        "model": FreqAIModelVariantOut.model_validate(m, from_attributes=True).model_dump(),
        "config_id": None,
        "filename": "config.json",
        "config": cfg,
        "source": "generated",
    }


@router.post("/alignments/{alignment_id}/request-agent")
async def request_agent_alignment(alignment_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    a = await session.get(StrategyAlignment, alignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="alignment not found")

    task_id = str(uuid4())
    now = datetime.now(timezone.utc).isoformat()

    redis = get_redis()
    key = f"{TASK_KEY_PREFIX}{task_id}"

    payload = {
        "alignment_id": alignment_id,
        "strategy_id": a.strategy_id,
        "model_id": a.model_id,
        "intent": "propose_alignment",
    }

    await redis.hset(
        key,
        mapping={
            "id": task_id,
            "type": "strategylab.alignment.propose",
            "payload": json.dumps(payload, ensure_ascii=False),
            "status": "queued",
            "created_at": now,
        },
    )
    await redis.rpush(QUEUE_KEY, task_id)

    return {"queued": True, "task_id": task_id}


# =============================================================================
# BACKTEST RESULTS API
# =============================================================================

import zipfile

# Path to Freqtrade user_data (configured via settings)
def _get_freqtrade_user_data() -> Path:
    return Path(settings.freqtrade_user_data)


def _parse_backtest_json(data: dict, filepath: Path) -> dict | None:
    """Parse backtest JSON data structure."""
    try:
        # Freqtrade backtest result structure
        # The main key is the strategy name, or data is flat
        strategy_name = None
        strategy_data = None
        
        # Check for Freqtrade 2024+ format: {"strategy": {...}, "strategy_comparison": [...]}
        if "strategy" in data and isinstance(data["strategy"], dict):
            strategy_data = data["strategy"]
            strategy_name = list(strategy_data.keys())[0] if strategy_data else "Unknown"
            if strategy_name and strategy_name in strategy_data:
                strategy_data = strategy_data[strategy_name]
        elif "strategy" in data and isinstance(data["strategy"], str):
            # Strategy name is a string, data is at root level
            strategy_name = data["strategy"]
            strategy_data = data
        else:
            # Try to find strategy by iterating keys (nested format)
            for key, val in data.items():
                if isinstance(val, dict) and "total_trades" in val:
                    strategy_name = key
                    strategy_data = val
                    break
        
        # If still no strategy data, or it doesn't look like a backtest summary, use root.
        # Note: total_trades can legitimately be 0, so check key presence (not truthiness).
        if not strategy_data or "total_trades" not in strategy_data:
            if "total_trades" in data:
                strategy_data = data
            else:
                return None
        
        # Get pairlist
        pairlist = strategy_data.get("pairlist", [])
        if isinstance(pairlist, list) and len(pairlist) > 0:
            pair = pairlist[0]
        else:
            pair = str(strategy_data.get("pair", "Multiple"))
        
        # Calculate win rate
        total_trades = strategy_data.get("total_trades", 0)
        wins = strategy_data.get("wins", 0)
        win_rate = round(wins / max(total_trades, 1) * 100, 2)
        
        # Extract key metrics
        return {
            "id": filepath.stem.replace(".json", "").rstrip("."),
            "filename": filepath.name,
            "strategy_name": strategy_name or "Unknown",
            "pair": pair,
            "timeframe": strategy_data.get("timeframe", "N/A"),
            "total_trades": total_trades,
            "win_rate": win_rate,
            "profit_factor": round(strategy_data.get("profit_factor", 0), 2),
            "max_drawdown": round(abs(strategy_data.get("max_drawdown", 0)) * 100, 2),
            "sharpe_ratio": round(strategy_data.get("sharpe", 0), 2),
            "total_return": round(strategy_data.get("profit_total", 0) * 100, 2),
            "avg_trade": round(strategy_data.get("profit_mean", 0) * 100, 2),
            "period": f"{strategy_data.get('backtest_start', 'N/A')} - {strategy_data.get('backtest_end', 'N/A')}",
            "backtest_start": strategy_data.get("backtest_start"),
            "backtest_end": strategy_data.get("backtest_end"),
            "created_at": filepath.stat().st_mtime if filepath.exists() else 0,
        }
    except Exception as e:
        print(f"Error parsing JSON: {e}")
        return None


def _parse_backtest_result(filepath: Path) -> dict | None:
    """Parse a single Freqtrade backtest result JSON or ZIP file."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        return _parse_backtest_json(data, filepath)
    except Exception as e:
        print(f"Error parsing {filepath}: {e}")
        return None


def _parse_backtest_zip(filepath: Path) -> dict | None:
    """Parse a Freqtrade backtest result ZIP file."""
    try:
        with zipfile.ZipFile(filepath, 'r') as zf:
            # Find the main JSON result file
            json_files = [n for n in zf.namelist() if n.endswith('.json') and not n.endswith('_config.json')]
            if not json_files:
                return None
            
            with zf.open(json_files[0]) as jf:
                data = json.load(jf)
                result = _parse_backtest_json(data, filepath)
                if result:
                    result["id"] = filepath.stem  # Use zip filename as ID
                    result["filename"] = filepath.name
                return result
    except Exception as e:
        print(f"Error parsing ZIP {filepath}: {e}")
        return None


@router.get("/backtests")
async def list_backtests(
    limit: int = Query(default=200, ge=1, le=1000),
    strategy: str | None = Query(default=None, description="Filter by strategy name"),
) -> dict:
    """List Freqtrade backtest results from user_data/backtest_results/"""
    results_dir = _get_freqtrade_user_data() / "backtest_results"
    
    if not results_dir.exists():
        return {
            "backtests": [],
            "total": 0,
            "message": "Freqtrade backtest_results directory not found. Run a backtest first.",
            "path": str(results_dir),
        }
    
    backtests = []
    
    # Get all JSON and ZIP files, sorted by modification time (newest first)
    all_files = list(results_dir.glob("*.json")) + list(results_dir.glob("*.zip"))
    sorted_files = sorted(all_files, key=lambda p: p.stat().st_mtime, reverse=True)
    
    for filepath in sorted_files[:limit * 2]:  # Get more to filter
        # Skip hidden and non-result sidecar files
        if (
            filepath.name.startswith(".")
            or filepath.name.endswith(".meta.json")
            or "_meta" in filepath.name
            or "_config" in filepath.name
        ):
            continue
        
        # Parse based on file type
        if filepath.suffix == ".zip":
            result = _parse_backtest_zip(filepath)
        else:
            result = _parse_backtest_result(filepath)
        
        if result:
            # Apply strategy filter
            if strategy and strategy.lower() not in result["strategy_name"].lower():
                continue
            backtests.append(result)
            if len(backtests) >= limit:
                break
    
    return {
        "backtests": backtests,
        "total": len(backtests),
        "path": str(results_dir),
    }


@router.get("/backtests/{backtest_id}")
async def get_backtest_detail(backtest_id: str) -> dict:
    """Get detailed backtest result by filename (without .json/.zip)"""
    results_dir = _get_freqtrade_user_data() / "backtest_results"
    
    # Try both .json and .zip
    filepath = results_dir / f"{backtest_id}.json"
    if not filepath.exists():
        filepath = results_dir / f"{backtest_id}.zip"
    
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Backtest result not found")
    
    try:
        # Parse the backtest summary
        if filepath.suffix == ".zip":
            summary = _parse_backtest_zip(filepath)
        else:
            summary = _parse_backtest_result(filepath)
        
        if not summary:
            raise HTTPException(status_code=500, detail="Failed to parse backtest result")
        
        # Load full data including trades
        if filepath.suffix == ".zip":
            with zipfile.ZipFile(filepath, "r") as zf:
                json_files = [n for n in zf.namelist() if n.endswith(".json") and not n.endswith("_config.json")]
                if not json_files:
                    raise HTTPException(status_code=500, detail="No JSON found in ZIP")
                with zf.open(json_files[0]) as jf:
                    data = json.load(jf)
        else:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
        
        # Extract trades list
        trades = []
        strategy_data = None
        
        # Find strategy data
        if "strategy" in data and isinstance(data["strategy"], dict):
            strategy_name = list(data["strategy"].keys())[0] if data["strategy"] else None
            if strategy_name:
                strategy_data = data["strategy"][strategy_name]
        elif isinstance(data.get("strategy"), str):
            strategy_data = data
        
        # Get trades from strategy data or root
        if strategy_data and "trades" in strategy_data:
            trades = strategy_data["trades"]
        elif "trades" in data:
            trades = data["trades"]
        
        # Enhanced summary with additional fields
        enhanced_summary = {
            **summary,
            "wins": strategy_data.get("wins", 0) if strategy_data else 0,
            "losses": strategy_data.get("losses", 0) if strategy_data else 0,
            "draws": strategy_data.get("draws", 0) if strategy_data else 0,
            "best_pair": strategy_data.get("best_pair", {}).get("key") if strategy_data else None,
            "worst_pair": strategy_data.get("worst_pair", {}).get("key") if strategy_data else None,
            "avg_duration": strategy_data.get("duration_avg", "N/A") if strategy_data else "N/A",
            "max_drawdown_abs": strategy_data.get("max_drawdown_abs", 0) if strategy_data else 0,
            "trades": trades[:1000],  # Limit to 1000 trades for performance
        }
        
        return enhanced_summary
        
    except (json.JSONDecodeError, zipfile.BadZipFile) as e:
        raise HTTPException(status_code=500, detail=f"Invalid backtest file: {str(e)}")


@router.post("/bots/{bot_id}/backtest")
async def run_backtest(
    bot_id: str,
    timerange: str | None = Query(default=None, description="Format: YYYYMMDD-YYYYMMDD"),
    opts: dict | None = Body(default=None),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Run backtest for a bot using its config"""
    try:
        return await run_backtest_for_bot(bot_id=bot_id, timerange=timerange, options=opts, session=session)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@router.post("/alignments/{alignment_id}/backtest")
async def run_alignment_backtest(
    alignment_id: str,
    timerange: str | None = Query(default=None, description="Format: YYYYMMDD-YYYYMMDD"),
    opts: dict | None = Body(default=None),
    session: AsyncSession = Depends(get_db),
    user: User | None = Depends(maybe_current_user),
) -> dict:
    """Run backtest for an alignment (generates bot if needed, then backtests)"""

    try:
        bot_result = await generate_bot_for_alignment(alignment_id, session, user_id=(user.user_id if user else None))
        bot_id = bot_result["bot_id"]
        return await run_backtest_for_bot(bot_id=bot_id, timerange=timerange, options=opts, session=session)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


class HyperoptRequest(BaseModel):
    strategy_name: str
    alignment_id: str | None = None
    config_path: str | None = None
    epochs: int = 100
    spaces: str = "buy sell roi stoploss trailing protection"  # Default all, frontend can override
    timerange: str | None = "20240101-"
    hyperopt_loss: str = "SharpeHyperOptLoss"
    download_data: bool = True
    job_workers: int = 1

    # Advanced hyperopt / backtest-like overrides
    timeframe: str | None = None
    timeframe_detail: str | None = None
    data_format_ohlcv: str | None = None
    max_open_trades: int | None = None
    stake_amount: str | int | float | None = None
    fee: float | None = None
    pairs: list[str] | None = None
    eps: bool | None = None
    enable_protections: bool | None = None
    dry_run_wallet: float | None = None

    # Hyperopt controls
    random_state: int | None = None
    min_trades: int | None = None
    analyze_per_epoch: bool | None = None
    early_stop: int | None = None

    # Output / behavior
    print_all: bool | None = None
    print_json: bool | None = None
    disable_param_export: bool | None = None
    ignore_missing_spaces: bool | None = None


def _validate_hyperopt_config_path(path: str | None) -> str:
    # Default to global config.json inside user_data
    if path is None:
        return "/freqtrade/user_data/config.json"
    p = str(path).strip()
    if not p:
        return "/freqtrade/user_data/config.json"

    # Allow relative paths and normalize them into /freqtrade/user_data
    if not p.startswith("/"):
        p = f"/freqtrade/user_data/{p.lstrip('./')}"

    # Restrict to user_data to avoid reading arbitrary files.
    try:
        resolved = Path(p).resolve()
        allowed_root = Path("/freqtrade/user_data").resolve()
        if not str(resolved).startswith(str(allowed_root)):
            raise HTTPException(status_code=400, detail="Invalid config_path")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid config_path")

    if not p.endswith(".json"):
        raise HTTPException(status_code=400, detail="Invalid config_path (must be .json)")
    return str(resolved)


def _validate_job_workers(job_workers: int) -> int:
    try:
        v = int(job_workers)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid job_workers")
    # We default to 1 for stability; allow -1 as 'auto' but it can be memory-heavy.
    if v == -1:
        return v
    if v < 1 or v > 32:
        raise HTTPException(status_code=400, detail="Invalid job_workers. Use 1..32 or -1")
    return v

def _validate_hyperopt_timerange(timerange: str | None) -> str | None:
    if timerange is None:
        return None
    tr = timerange.strip()
    if tr == "":
        return None
    # Common Freqtrade formats: YYYYMMDD-YYYYMMDD or YYYYMMDD- or -YYYYMMDD
    if not re.fullmatch(r"\d{8}-\d{8}|\d{8}-|-\d{8}", tr):
        raise HTTPException(status_code=400, detail="Invalid timerange format. Use YYYYMMDD-YYYYMMDD, YYYYMMDD- or -YYYYMMDD")
    return tr


def _validate_hyperopt_loss_name(loss: str) -> str:
    v = (loss or "").strip() or "SharpeHyperOptLoss"
    if not re.fullmatch(r"[A-Za-z0-9_]+", v):
        raise HTTPException(status_code=400, detail="Invalid hyperopt_loss. Use a class name like SharpeHyperOptLoss")
    return v


def _validate_timeframe(value: str | None, *, field: str = "timeframe") -> str | None:
    if value is None:
        return None
    v = str(value).strip()
    if v == "":
        return None
    # Accept common Freqtrade formats: 1m, 5m, 1h, 1d, 1w
    if not re.fullmatch(r"\d{1,4}[mhdw]", v):
        raise HTTPException(status_code=400, detail=f"Invalid {field}. Use formats like 1m, 5m, 1h, 1d")
    return v


async def _hyperopt_worker(
    job_id: str,
    strategy_name: str,
    epochs: int,
    spaces: str,
    timerange: str | None,
    hyperopt_loss: str,
    download_data: bool,
    job_workers: int,
    config_path: str,
    *,
    timeframe: str | None = None,
    timeframe_detail: str | None = None,
    data_format_ohlcv: str | None = None,
    max_open_trades: int | None = None,
    stake_amount: str | int | float | None = None,
    fee: float | None = None,
    pairs: list[str] | None = None,
    eps: bool | None = None,
    enable_protections: bool | None = None,
    dry_run_wallet: float | None = None,
    random_state: int | None = None,
    min_trades: int | None = None,
    analyze_per_epoch: bool | None = None,
    early_stop: int | None = None,
    print_all: bool | None = None,
    print_json: bool | None = None,
    disable_param_export: bool | None = None,
    ignore_missing_spaces: bool | None = None,
):
    redis = get_redis()
    key_logs = f"hyperopt:logs:{job_id}"
    key_status = f"hyperopt:status:{job_id}"
    
    await redis.set(key_status, "running")
    await redis.expire(key_status, 3600)
    await redis.expire(key_logs, 3600)

    user_data_host_path = os.getenv("FREQTRADE_USER_DATA_HOST", "/workspaces/TRADE_SYSTEM/freqtrade/user_data")

    async def log(line: str) -> None:
        if (line or "").strip():
            await redis.rpush(key_logs, str(line))
    
    # Split spaces string into list for cmd args
    space_list = spaces.split()
    
    # Detect if config enables FreqAI to use the correct docker image.
    docker_image = "freqtradeorg/freqtrade:stable"
    cfg_for_image: dict = {}
    try:
        cfg_path = Path(config_path)
        if cfg_path.exists():
            cfg_for_image = json.loads(cfg_path.read_text("utf-8"))
    except Exception:
        cfg_for_image = {}
    try:
        freqai = cfg_for_image.get("freqai") if isinstance(cfg_for_image, dict) else None
        if isinstance(freqai, dict) and bool(freqai.get("enabled")):
            docker_image = "freqtradeorg/freqtrade:stable_freqai"
    except Exception:
        docker_image = "freqtradeorg/freqtrade:stable"

    # Use array for cmd to avoid shell injection, but Docker needs clean args
    cmd = [
        "docker", "run", "--rm",
        "--name", f"hyperopt_{job_id}",
        "-v", f"{user_data_host_path}:/freqtrade/user_data",
        docker_image,
        "hyperopt",
        "--config", config_path,
        "--strategy", strategy_name,
        "--hyperopt-loss", hyperopt_loss,
        "--spaces", *space_list,
        "--epochs", str(epochs),
        "--job-workers", str(job_workers),
        "--no-color"
    ]

    if timerange:
        cmd.extend(["--timerange", timerange])

    # Advanced CLI flags
    if timeframe:
        cmd.extend(["--timeframe", timeframe])
    if timeframe_detail:
        cmd.extend(["--timeframe-detail", timeframe_detail])
    if data_format_ohlcv:
        cmd.extend(["--data-format-ohlcv", str(data_format_ohlcv)])
    if max_open_trades is not None:
        cmd.extend(["--max-open-trades", str(max_open_trades)])
    if stake_amount is not None:
        cmd.extend(["--stake-amount", str(stake_amount)])
    if fee is not None:
        cmd.extend(["--fee", str(fee)])
    if pairs:
        safe_pairs = [str(p).strip() for p in pairs if str(p).strip()]
        if safe_pairs:
            cmd.extend(["--pairs", *safe_pairs])
    if eps:
        cmd.append("--eps")
    if enable_protections:
        cmd.append("--enable-protections")
    if dry_run_wallet is not None:
        cmd.extend(["--dry-run-wallet", str(dry_run_wallet)])
    if random_state is not None:
        cmd.extend(["--random-state", str(random_state)])
    if min_trades is not None:
        cmd.extend(["--min-trades", str(min_trades)])
    if analyze_per_epoch:
        cmd.append("--analyze-per-epoch")
    if early_stop is not None:
        cmd.extend(["--early-stop", str(early_stop)])
    if print_all:
        cmd.append("--print-all")
    if print_json:
        cmd.append("--print-json")
    if disable_param_export:
        cmd.append("--disable-param-export")
    if ignore_missing_spaces:
        cmd.append("--ignore-missing-spaces")

    # Ensure historical data exists before starting hyperopt.
    # This prevents `No data found. Terminating.` on fresh installs.
    if download_data:
        try:
            from app.services.freqtrade_data import (
                ensure_freqtrade_history,
                extract_exchange_name,
                extract_pairs,
                resolve_required_timeframes,
            )
            from app.services.strategy_ast import analyze_strategy_file

            try:
                cfg = cfg_for_image if isinstance(cfg_for_image, dict) else {}
            except Exception:
                cfg = {}
            exchange = extract_exchange_name(cfg)
            pairs = extract_pairs(cfg)

            safe_name = re.sub(r'[^a-zA-Z0-9_]', '', strategy_name)
            strategy_path = Path("/freqtrade/user_data/strategies") / f"{safe_name}.py"
            tf = timeframe or "5m"
            if strategy_path.exists():
                try:
                    analysis = analyze_strategy_file(strategy_path)
                    tf = (timeframe or analysis.timeframe or "5m").strip() or "5m"
                except Exception:
                    tf = "5m"

            timeframes = resolve_required_timeframes(config=cfg, strategy_path=strategy_path if strategy_path.exists() else None, base_timeframe=tf)
            if timeframe_detail:
                timeframes = [*timeframes, timeframe_detail]
            if not timeframes:
                timeframes = [tf]

            await ensure_freqtrade_history(
                user_data_host_path=user_data_host_path,
                user_data_internal_path=Path("/freqtrade/user_data"),
                exchange=exchange,
                pairs=pairs,
                timeframes=timeframes,
                timerange=timerange,
                log=log,
            )
        except Exception as e:
            await redis.set(key_status, "failed")
            await log(f"[SYSTEM] Data preparation failed: {str(e)}")
            return

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT
        )

        while True:
            line = await process.stdout.readline()
            if not line:
                break
            line_str = line.decode().rstrip()
            if line_str:
                await log(line_str)

        code = await process.wait()
        if code == 0:
            await redis.set(key_status, "completed")
            await log("[SYSTEM] Hyperopt finished successfully.")
            
            # Auto-save logs to a file
            try:
                # Retrieve all logs from redis
                all_logs = await redis.lrange(key_logs, 0, -1)
                
                # Format: Strategy_YYYYMMDD_HHMM.log
                timestamp = datetime.now().strftime("%Y%m%d_%H%M")
                log_filename = f"{strategy_name}_{timestamp}_hyperopt.log"
                log_path = Path(user_data_host_path) / "hyperopt_results" / "logs"
                
                # Check if path in container (which is /freqtrade/user_data) is same as host
                # We need to write to the volume path. 
                # The 'user_data_host_path' variable we have here is likely for HOST docker mount (e.g. /workspaces/...)
                # but INSIDE backend container, we have mounted check docker-compose...
                # Backend mounts ./freqtrade/user_data:/freqtrade/user_data (Not exactly, check docker-compose)
                # Backend mounts ./freqtrade/user_data:/freqtrade/user_data
                
                # Let's use internal path /freqtrade/user_data
                internal_path = Path("/freqtrade/user_data/hyperopt_results/logs")
                internal_path.mkdir(parents=True, exist_ok=True)
                
                with open(internal_path / log_filename, "w") as f:
                    f.write("\n".join(all_logs))
                    
                await log(f"[SYSTEM] Log saved to hyperopt_results/logs/{log_filename}")
            except Exception as e:
                await log(f"[SYSTEM] Failed to save log file: {str(e)}")

        else:
            await redis.set(key_status, "failed")

            await log(f"[SYSTEM] Hyperopt failed with exit code {code}.")

    except Exception as e:
        await redis.set(key_status, "error")
        await log(f"[SYSTEM] Error executing task: {str(e)}")


@router.post("/hyperopt/start")
async def run_hyperopt_endpoint(
    req: HyperoptRequest,
    session: AsyncSession = Depends(get_db),
    user: User | None = Depends(maybe_current_user),
):
    """
    Starts a hyperopt session in the background. returns job_id.
    """
    job_id = str(uuid4())[:8]
    timerange = _validate_hyperopt_timerange(req.timerange)
    hyperopt_loss = _validate_hyperopt_loss_name(req.hyperopt_loss)
    job_workers = _validate_job_workers(req.job_workers)

    timeframe = _validate_timeframe(req.timeframe, field="timeframe")
    timeframe_detail = _validate_timeframe(req.timeframe_detail, field="timeframe_detail")

    pairs: list[str] | None = None
    if req.pairs is not None:
        pairs = [str(p).strip() for p in req.pairs if str(p).strip()]
        if not pairs:
            pairs = None

    effective_config_path = _validate_hyperopt_config_path(req.config_path)
    if req.alignment_id:
        # Materialize alignment config file into user_data and use it for hyperopt.
        try:
            bot_result = await generate_bot_for_alignment(req.alignment_id, session, user_id=(user.user_id if user else None))
            effective_config_path = _validate_hyperopt_config_path(bot_result.get("config_path"))
        except ServiceError as e:
            raise HTTPException(status_code=e.status_code, detail=e.detail)
    # Fire and forget async task
    asyncio.create_task(
        _hyperopt_worker(
            job_id,
            req.strategy_name,
            req.epochs,
            req.spaces,
            timerange,
            hyperopt_loss,
            bool(req.download_data),
            job_workers,
            effective_config_path,
            timeframe=timeframe,
            timeframe_detail=timeframe_detail,
            data_format_ohlcv=(str(req.data_format_ohlcv).strip() if req.data_format_ohlcv else None),
            max_open_trades=req.max_open_trades,
            stake_amount=req.stake_amount,
            fee=req.fee,
            pairs=pairs,
            eps=req.eps,
            enable_protections=req.enable_protections,
            dry_run_wallet=req.dry_run_wallet,
            random_state=req.random_state,
            min_trades=req.min_trades,
            analyze_per_epoch=req.analyze_per_epoch,
            early_stop=req.early_stop,
            print_all=req.print_all,
            print_json=req.print_json,
            disable_param_export=req.disable_param_export,
            ignore_missing_spaces=req.ignore_missing_spaces,
        )
    )
    
    return {
        "message": f"Hyperopt started for {req.strategy_name}", 
        "job_id": job_id,
        "status": "started"
    }

from app.services.strategy_ast import analyze_strategy_file, StrategyAnalysisResult


class HyperoptParamUpdate(BaseModel):
    name: str
    type: str | None = None
    min: float | int | None = None
    max: float | int | None = None
    default: object | None = None
    space: str | None = None
    optimize: bool | None = None


class HyperoptParamsApplyRequest(BaseModel):
    updates: list[HyperoptParamUpdate]

@router.get("/strategies/{strategy_name}/hyperopt-info", response_model=StrategyAnalysisResult)
async def get_strategy_hyperopt_info(
    strategy_name: str,
):
    """
    Analyzes a strategy file to detect Hyperopt parameters.
    """
    # Sanitize inputs
    safe_name = re.sub(r'[^a-zA-Z0-9_]', '', strategy_name)
    user_data_path = Path("/freqtrade/user_data/strategies")
    file_path = user_data_path / f"{safe_name}.py"
    
    if not file_path.exists():
        raise HTTPException(404, "Strategy file not found")
        
    return analyze_strategy_file(file_path)


@router.post("/strategies/{strategy_name}/hyperopt-params/apply")
async def apply_strategy_hyperopt_params(
    strategy_name: str,
    req: HyperoptParamsApplyRequest,
):
    """Apply Hyperopt parameter edits directly into the strategy .py file.

    We locate parameter assignments via AST (lineno/end_lineno) and rewrite only those assignments.
    """

    safe_name = re.sub(r'[^a-zA-Z0-9_]', '', strategy_name)
    user_data_path = Path("/freqtrade/user_data/strategies")
    file_path = user_data_path / f"{safe_name}.py"
    if not file_path.exists():
        raise HTTPException(404, "Strategy file not found")

    updates_by_name = {u.name: u for u in (req.updates or []) if (u.name or '').strip()}
    if not updates_by_name:
        raise HTTPException(status_code=400, detail="No updates provided")

    source = file_path.read_text("utf-8")
    try:
        tree = ast.parse(source)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse strategy AST: {e}")

    allowed_param_calls = {
        "IntParameter",
        "DecimalParameter",
        "RealParameter",
        "BooleanParameter",
        "CategoricalParameter",
    }

    lines = source.splitlines(True)  # keepends
    replacements: dict[tuple[int, int], str] = {}

    def to_py_ast_literal(v: object) -> ast.expr:
        # Accept basic JSON-ish literals only.
        if v is None:
            return ast.Constant(value=None)
        if isinstance(v, (bool, int, float, str)):
            return ast.Constant(value=v)
        # Fallback: stringify (safer than eval).
        return ast.Constant(value=str(v))

    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        if not node.targets or not isinstance(node.targets[0], ast.Name):
            continue
        name = node.targets[0].id
        upd = updates_by_name.get(name)
        if not upd:
            continue
        if not isinstance(node.value, ast.Call):
            continue
        if not isinstance(node.value.func, ast.Name):
            continue
        func_name = node.value.func.id
        if func_name not in allowed_param_calls:
            continue

        if not getattr(node, 'lineno', None) or not getattr(node, 'end_lineno', None):
            continue

        call = node.value
        new_args = list(call.args)
        new_keywords = [ast.keyword(arg=k.arg, value=k.value) for k in (call.keywords or [])]

        def set_kw(key: str, value_expr: ast.expr) -> None:
            nonlocal new_keywords
            for i, k in enumerate(new_keywords):
                if k.arg == key:
                    new_keywords[i] = ast.keyword(arg=key, value=value_expr)
                    return
            new_keywords.append(ast.keyword(arg=key, value=value_expr))

        # Normalize numeric bounds for numeric parameters.
        if func_name in {"IntParameter", "DecimalParameter", "RealParameter"}:
            if upd.min is not None:
                if len(new_args) >= 1:
                    new_args[0] = to_py_ast_literal(upd.min)
                else:
                    new_args.append(to_py_ast_literal(upd.min))
            if upd.max is not None:
                if len(new_args) >= 2:
                    new_args[1] = to_py_ast_literal(upd.max)
                else:
                    while len(new_args) < 1:
                        new_args.append(ast.Constant(value=None))
                    new_args.append(to_py_ast_literal(upd.max))

            if upd.default is not None:
                # Prefer keyword default. If default provided positionally (3rd arg), update it too.
                if len(new_args) >= 3:
                    new_args[2] = to_py_ast_literal(upd.default)
                else:
                    set_kw('default', to_py_ast_literal(upd.default))
        else:
            # For Boolean/Categorical: only update default via keyword.
            if upd.default is not None:
                set_kw('default', to_py_ast_literal(upd.default))

        if upd.space is not None:
            sp = str(upd.space).strip()
            if sp:
                set_kw('space', ast.Constant(value=sp))

        if upd.optimize is not None:
            set_kw('optimize', ast.Constant(value=bool(upd.optimize)))

        new_call = ast.Call(func=call.func, args=new_args, keywords=new_keywords)
        ast.fix_missing_locations(new_call)

        # Preserve indentation from the first line of the original assignment.
        start_line = node.lineno - 1
        end_line = node.end_lineno  # exclusive
        original_first = lines[start_line] if 0 <= start_line < len(lines) else ''
        indent = re.match(r"^\s*", original_first).group(0) if original_first else ''

        rendered = ast.unparse(new_call)
        new_text = f"{indent}{name} = {rendered}\n"
        replacements[(start_line, end_line)] = new_text

    if not replacements:
        raise HTTPException(status_code=400, detail="No matching hyperopt parameters found to update")

    # Apply replacements bottom-up to keep indexes stable.
    out_lines = list(lines)
    for (start, end), text in sorted(replacements.items(), key=lambda x: x[0][0], reverse=True):
        out_lines[start:end] = [text]

    updated = ''.join(out_lines)
    file_path.write_text(updated, "utf-8")

    return {
        "ok": True,
        "updated": len(replacements),
        "analysis": analyze_strategy_file(file_path).model_dump(),
    }

@router.get("/hyperopt/{job_id}/logs")
async def get_hyperopt_logs(job_id: str):
    redis = get_redis()
    logs = await redis.lrange(f"hyperopt:logs:{job_id}", 0, -1)
    status = await redis.get(f"hyperopt:status:{job_id}")
    return {"status": status, "logs": logs}

