"""
Alignment Analysis API - Automatic configuration compatibility scoring
Analyzes correlation between strategy/model configs and backtest performance
"""
from __future__ import annotations

import json
import re
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.exceptions import NotFoundError
from app.models.strategylab import FreqAIModelVariant, StrategyAlignment, StrategyTemplate

router = APIRouter(prefix="/alignment", tags=["alignment"])


def _extract_strategy_params(strategy: StrategyTemplate) -> dict[str, Any]:
    """Extract key parameters from strategy meta/code"""
    params = {}
    
    # From meta
    if strategy.meta and isinstance(strategy.meta, dict):
        # Timeframe
        params["timeframe"] = strategy.meta.get("timeframe", "5m")
        # Indicators
        params["indicators"] = strategy.meta.get("indicators", [])
        # Risk parameters
        params["stake_amount"] = strategy.meta.get("stake_amount")
        params["stop_loss"] = strategy.meta.get("stop_loss")
        params["roi"] = strategy.meta.get("roi", {})
        
    # Try to parse from code if available
    if strategy.meta and "code" in strategy.meta:
        code = strategy.meta["code"]
        # Extract timeframe
        tf_match = re.search(r'timeframe\s*=\s*["\'](\w+)["\']', code)
        if tf_match:
            params["timeframe"] = tf_match.group(1)
        # Extract indicator windows
        ema_matches = re.findall(r'ema[_-]?(\d+)', code.lower())
        rsi_matches = re.findall(r'rsi[_-]?(\d+)', code.lower())
        if ema_matches:
            params["ema_windows"] = [int(x) for x in ema_matches]
        if rsi_matches:
            params["rsi_windows"] = [int(x) for x in rsi_matches]
            
    return params


def _extract_model_params(model: FreqAIModelVariant) -> dict[str, Any]:
    """Extract key parameters from model config"""
    params = {}
    
    if not model.config or not isinstance(model.config, dict):
        return params
    
    # FreqAI configuration
    freqai = model.config.get("freqai", {})
    
    # Feature parameters
    params["feature_parameters"] = freqai.get("feature_parameters", {})
    params["identifier"] = freqai.get("identifier", "")
    
    # Data split
    params["train_period_days"] = freqai.get("train_period_days", 0)
    params["backtest_period_days"] = freqai.get("backtest_period_days", 0)
    
    # Model parameters
    model_config = freqai.get("model_training_parameters", {})
    params["learning_rate"] = model_config.get("learning_rate")
    params["n_estimators"] = model_config.get("n_estimators")
    params["max_depth"] = model_config.get("max_depth")
    
    # Label parameters
    label_params = freqai.get("label_parameters", {})
    params["label_period"] = label_params.get("label_period_candles")
    
    return params


def _timeframe_to_minutes(tf: str) -> int:
    """Convert timeframe string to minutes"""
    if not tf:
        return 5
    tf = tf.lower().strip()
    if tf.endswith('m'):
        return int(tf[:-1])
    elif tf.endswith('h'):
        return int(tf[:-1]) * 60
    elif tf.endswith('d'):
        return int(tf[:-1]) * 1440
    elif tf.endswith('w'):
        return int(tf[:-1]) * 10080
    return 5


def _calculate_compatibility_score(strategy_params: dict, model_params: dict) -> dict[str, Any]:
    """
    Calculate compatibility score between strategy and model configurations
    
    Checks:
    1. Timeframe compatibility (strategy timeframe vs model feature window)
    2. Indicator alignment (strategy indicators vs model features)
    3. Data sufficiency (model training period vs strategy history)
    4. Parameter consistency (various thresholds and windows)
    
    Returns:
        dict with score (0-100), issues, and recommendations
    """
    score = 100.0
    issues = []
    recommendations = []
    details = {}
    
    # 1. Timeframe compatibility
    strategy_tf_minutes = _timeframe_to_minutes(strategy_params.get("timeframe", "5m"))
    feature_params = model_params.get("feature_parameters", {})
    
    # Check if timeframe aligns with model's feature window
    if feature_params:
        # Typical feature engineering uses multiple candles
        include_timeperiods = feature_params.get("include_timeperiods", [])
        if include_timeperiods:
            max_period = max(include_timeperiods) if include_timeperiods else 20
            recommended_tf = strategy_tf_minutes
            
            # Model needs enough candles for features
            if max_period > 30 and strategy_tf_minutes < 5:
                score -= 15
                issues.append(f"Timeframe {strategy_params.get('timeframe')} may be too short for model feature window (max period: {max_period})")
                recommendations.append(f"Consider using 5m or higher timeframe for better feature extraction")
            
            details["timeframe_check"] = {
                "strategy_tf": strategy_params.get("timeframe"),
                "strategy_tf_minutes": strategy_tf_minutes,
                "max_feature_period": max_period,
                "status": "ok" if max_period <= 30 or strategy_tf_minutes >= 5 else "warning"
            }
    
    # 2. Indicator alignment
    strategy_indicators = strategy_params.get("indicators", [])
    strategy_ema = strategy_params.get("ema_windows", [])
    strategy_rsi = strategy_params.get("rsi_windows", [])
    
    # Check if model has indicator features enabled
    indicator_list = feature_params.get("indicator_list", [])
    if strategy_indicators or strategy_ema or strategy_rsi:
        if not indicator_list:
            score -= 20
            issues.append("Strategy uses indicators but model doesn't include indicator features")
            recommendations.append("Add indicator_list to model's feature_parameters (e.g., ['ema', 'rsi', 'macd'])")
        else:
            # Check specific indicator overlap
            has_ema = any('ema' in ind.lower() for ind in indicator_list)
            has_rsi = any('rsi' in ind.lower() for ind in indicator_list)
            
            if strategy_ema and not has_ema:
                score -= 10
                issues.append("Strategy uses EMA indicators but model doesn't include EMA features")
                recommendations.append("Add 'ema' to model's indicator_list")
            
            if strategy_rsi and not has_rsi:
                score -= 10
                issues.append("Strategy uses RSI indicators but model doesn't include RSI features")
                recommendations.append("Add 'rsi' to model's indicator_list")
        
        details["indicator_check"] = {
            "strategy_indicators": strategy_indicators,
            "strategy_ema": strategy_ema,
            "strategy_rsi": strategy_rsi,
            "model_indicators": indicator_list,
            "status": "ok" if indicator_list else "warning"
        }
    
    # 3. Data sufficiency
    train_period = model_params.get("train_period_days", 0)
    if train_period < 30:
        score -= 15
        issues.append(f"Training period ({train_period} days) is very short")
        recommendations.append("Increase train_period_days to at least 90 days for reliable ML model")
    elif train_period < 90:
        score -= 5
        issues.append(f"Training period ({train_period} days) is relatively short")
        recommendations.append("Consider increasing train_period_days to 180+ days")
    
    details["data_sufficiency"] = {
        "train_period_days": train_period,
        "backtest_period_days": model_params.get("backtest_period_days", 0),
        "status": "ok" if train_period >= 90 else "warning" if train_period >= 30 else "critical"
    }
    
    # 4. Label period alignment
    label_period = model_params.get("label_period")
    if label_period:
        # Label period should make sense with timeframe
        # E.g., if timeframe is 5m and label_period is 100, that's 500 minutes (8+ hours)
        label_duration_minutes = label_period * strategy_tf_minutes
        
        if label_duration_minutes > 1440:  # More than 1 day
            score -= 5
            issues.append(f"Label period ({label_period} candles = {label_duration_minutes/60:.1f}h) is very long")
            recommendations.append("Consider reducing label_period_candles for shorter prediction horizon")
        elif label_duration_minutes < 60:  # Less than 1 hour
            score -= 5
            issues.append(f"Label period ({label_period} candles = {label_duration_minutes}min) is very short")
            recommendations.append("Consider increasing label_period_candles for more stable predictions")
        
        details["label_period_check"] = {
            "label_period_candles": label_period,
            "label_duration_minutes": label_duration_minutes,
            "status": "ok" if 60 <= label_duration_minutes <= 1440 else "warning"
        }
    
    # 5. Model complexity check
    n_estimators = model_params.get("n_estimators")
    max_depth = model_params.get("max_depth")
    
    if n_estimators and n_estimators < 50:
        score -= 5
        issues.append(f"Model may be too simple (n_estimators={n_estimators})")
        recommendations.append("Increase n_estimators to at least 100 for better performance")
    
    if max_depth and max_depth > 15:
        score -= 5
        issues.append(f"Model may overfit (max_depth={max_depth})")
        recommendations.append("Reduce max_depth to 8-12 range")
    
    details["model_complexity"] = {
        "n_estimators": n_estimators,
        "max_depth": max_depth,
        "status": "ok" if (not n_estimators or n_estimators >= 50) and (not max_depth or max_depth <= 15) else "warning"
    }
    
    # Ensure score is in range
    score = max(0, min(100, score))
    
    return {
        "score": round(score, 1),
        "grade": "A" if score >= 90 else "B" if score >= 75 else "C" if score >= 60 else "D" if score >= 40 else "F",
        "issues": issues,
        "recommendations": recommendations,
        "details": details,
    }


@router.get("/analyze/{alignment_id}")
async def analyze_alignment(alignment_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    """
    Analyze compatibility between strategy and model in an alignment
    Returns compatibility score, issues, and recommendations
    """
    # Get alignment
    alignment = await session.get(StrategyAlignment, alignment_id)
    if not alignment:
        raise NotFoundError(f"Alignment {alignment_id} not found")
    
    # Get strategy and model
    strategy = await session.get(StrategyTemplate, alignment.strategy_id)
    model = await session.get(FreqAIModelVariant, alignment.model_id)
    
    if not strategy:
        raise NotFoundError(f"Strategy {alignment.strategy_id} not found")
    if not model:
        raise NotFoundError(f"Model {alignment.model_id} not found")
    
    # Extract parameters
    strategy_params = _extract_strategy_params(strategy)
    model_params = _extract_model_params(model)
    
    # Calculate compatibility
    compatibility = _calculate_compatibility_score(strategy_params, model_params)
    
    return {
        "alignment_id": alignment_id,
        "strategy": {
            "id": strategy.strategy_id,
            "name": strategy.name,
            "slug": strategy.slug,
            "params": strategy_params,
        },
        "model": {
            "id": model.model_id,
            "name": model.name,
            "slug": model.slug,
            "params": model_params,
        },
        "compatibility": compatibility,
    }


@router.post("/optimize/{alignment_id}")
async def optimize_alignment(alignment_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    """
    Auto-optimize alignment configuration based on compatibility analysis
    Applies recommended changes to model config (strategy unchanged)
    """
    # Get alignment
    alignment = await session.get(StrategyAlignment, alignment_id)
    if not alignment:
        raise NotFoundError(f"Alignment {alignment_id} not found")
    
    # Get strategy and model
    strategy = await session.get(StrategyTemplate, alignment.strategy_id)
    model = await session.get(FreqAIModelVariant, alignment.model_id)
    
    if not strategy or not model:
        raise NotFoundError("Strategy or model not found")
    
    # Extract parameters
    strategy_params = _extract_strategy_params(strategy)
    model_params = _extract_model_params(model)
    
    # Calculate initial compatibility
    initial_compat = _calculate_compatibility_score(strategy_params, model_params)
    
    # Apply optimizations
    optimized_config = dict(model.config) if model.config else {}
    changes_made = []
    
    # Ensure freqai section exists
    if "freqai" not in optimized_config:
        optimized_config["freqai"] = {}
    
    freqai = optimized_config["freqai"]
    
    # 1. Add missing indicators
    strategy_indicators = strategy_params.get("indicators", [])
    strategy_ema = strategy_params.get("ema_windows", [])
    strategy_rsi = strategy_params.get("rsi_windows", [])
    
    if strategy_indicators or strategy_ema or strategy_rsi:
        if "feature_parameters" not in freqai:
            freqai["feature_parameters"] = {}
        
        feature_params = freqai["feature_parameters"]
        indicator_list = feature_params.get("indicator_list", [])
        
        # Add EMA if strategy uses it
        if strategy_ema and not any('ema' in ind.lower() for ind in indicator_list):
            indicator_list.append("ema")
            changes_made.append("Added 'ema' to indicator_list")
        
        # Add RSI if strategy uses it
        if strategy_rsi and not any('rsi' in ind.lower() for ind in indicator_list):
            indicator_list.append("rsi")
            changes_made.append("Added 'rsi' to indicator_list")
        
        # Add MACD as standard
        if not any('macd' in ind.lower() for ind in indicator_list):
            indicator_list.append("macd")
            changes_made.append("Added 'macd' to indicator_list")
        
        feature_params["indicator_list"] = indicator_list
    
    # 2. Adjust training period if needed
    train_period = model_params.get("train_period_days", 0)
    if train_period < 90:
        freqai["train_period_days"] = 180
        changes_made.append(f"Increased train_period_days from {train_period} to 180 days")
    
    # 3. Set reasonable model complexity
    if "model_training_parameters" not in freqai:
        freqai["model_training_parameters"] = {}
    
    model_training = freqai["model_training_parameters"]
    
    n_estimators = model_params.get("n_estimators")
    if not n_estimators or n_estimators < 50:
        model_training["n_estimators"] = 100
        changes_made.append(f"Set n_estimators to 100 (was {n_estimators})")
    
    max_depth = model_params.get("max_depth")
    if not max_depth or max_depth > 15:
        model_training["max_depth"] = 10
        changes_made.append(f"Set max_depth to 10 (was {max_depth})")
    
    # 4. Adjust label period based on timeframe
    strategy_tf_minutes = _timeframe_to_minutes(strategy_params.get("timeframe", "5m"))
    if "label_parameters" not in freqai:
        freqai["label_parameters"] = {}
    
    label_params = freqai["label_parameters"]
    # Target ~2-4 hours prediction horizon
    optimal_label_period = max(24, min(48, int(180 / strategy_tf_minutes)))
    
    current_label = model_params.get("label_period")
    if not current_label or abs(current_label - optimal_label_period) > 10:
        label_params["label_period_candles"] = optimal_label_period
        changes_made.append(f"Set label_period_candles to {optimal_label_period} (~{optimal_label_period * strategy_tf_minutes / 60:.1f}h)")
    
    # Save optimized config
    model.config = optimized_config
    await session.commit()
    
    # Recalculate compatibility
    new_model_params = _extract_model_params(model)
    final_compat = _calculate_compatibility_score(strategy_params, new_model_params)
    
    return {
        "alignment_id": alignment_id,
        "changes_made": changes_made,
        "initial_score": initial_compat["score"],
        "final_score": final_compat["score"],
        "improvement": round(final_compat["score"] - initial_compat["score"], 1),
        "final_compatibility": final_compat,
    }
