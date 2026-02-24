"""Strategy Lab API endpoints"""

import csv
import io
from datetime import datetime
import json
from pathlib import Path
import zipfile
from typing import Any

from fastapi import APIRouter, Depends, Query
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user
from app.core.config import settings
from app.core.exceptions import ConflictError, NotFoundError
from app.models.strategylab import FreqAIModelVariant, StrategyAlignment, StrategyTemplate
from app.models.user import User
from app.schemas.strategylab import (
    ConfigAuditListOut,
    ConfigParamsOut,
    ConfigParamsSaveRequest,
    FreqAIModelVariantCreate,
    FreqAIModelVariantOut,
    FreqAIModelVariantUpdate,
    StrategyAlignmentCreate,
    StrategyAlignmentOut,
    StrategyAlignmentUpdate,
    StrategyTemplateCreate,
    StrategyTemplateOut,
    StrategyTemplateUpdate,
)
from app.services.backtest_parser import parse_backtest_file
from app.services.config_params_service import ConfigParamsService
from app.services.freqai_service import FreqAIService
from app.services.strategylab_bots import generate_bot_for_alignment

router = APIRouter(prefix="/strategylab", tags=["strategylab"])


def _backtest_results_dir() -> Path:
    base = Path(settings.freqtrade_user_data_host or "freqtrade/user_data").resolve()
    return base / "backtest_results"


def _iter_backtest_files(results_dir: Path) -> list[Path]:
    if not results_dir.exists():
        return []
    files = list(results_dir.glob("*.json")) + list(results_dir.glob("*.zip"))
    files = [f for f in files if not f.name.startswith(".") and "_meta" not in f.name and "_config" not in f.name]
    return sorted(files, key=lambda p: p.stat().st_mtime, reverse=True)


def _read_backtest_payload(filepath: Path) -> dict[str, Any]:
    if filepath.suffix == ".zip":
        with zipfile.ZipFile(filepath, "r") as zf:
            json_files = [n for n in zf.namelist() if n.endswith(".json") and not n.endswith("_config.json")]
            if not json_files:
                return {}
            with zf.open(json_files[0]) as jf:
                data = json.load(jf)
                return data if isinstance(data, dict) else {}

    with open(filepath, "r", encoding="utf-8") as fh:
        data = json.load(fh)
        return data if isinstance(data, dict) else {}


def _extract_trades(obj: Any) -> list[dict[str, Any]]:
    if isinstance(obj, list):
        if obj and isinstance(obj[0], dict):
            first = obj[0]
            has_trade_shape = any(
                key in first
                for key in (
                    "open_date",
                    "open_date_utc",
                    "close_date",
                    "close_date_utc",
                    "open_rate",
                    "profit_ratio",
                )
            )
            if has_trade_shape:
                return [item for item in obj if isinstance(item, dict)]
        for item in obj:
            found = _extract_trades(item)
            if found:
                return found
        return []

    if isinstance(obj, dict):
        for key in ("trades", "trades_list"):
            value = obj.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
        for value in obj.values():
            found = _extract_trades(value)
            if found:
                return found
    return []


def _normalize_trade(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "pair": item.get("pair"),
        "open_date": item.get("open_date") or item.get("open_date_utc"),
        "close_date": item.get("close_date") or item.get("close_date_utc"),
        "open_rate": item.get("open_rate"),
        "close_rate": item.get("close_rate"),
        "profit_abs": item.get("profit_abs") or item.get("close_profit_abs"),
        "profit_ratio": item.get("profit_ratio") or item.get("close_profit"),
        "is_short": bool(item.get("is_short", False)),
        "enter_tag": item.get("enter_tag"),
        "exit_reason": item.get("exit_reason"),
    }


@router.get("/strategies", response_model=list[StrategyTemplateOut])
async def list_strategies(
    lite: int = Query(1),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(StrategyTemplate).order_by(StrategyTemplate.created_at.desc()).offset(offset).limit(limit)
    rows = (await db.execute(query)).scalars().all()
    if lite:
        return [StrategyTemplateOut.model_validate(item, from_attributes=True) for item in rows]
    return [StrategyTemplateOut.model_validate(item, from_attributes=True) for item in rows]


@router.post("/strategies", response_model=StrategyTemplateOut)
async def create_strategy(
    strategy_in: StrategyTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    strategy = StrategyTemplate(**strategy_in.model_dump())
    db.add(strategy)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError("Strategy with this slug already exists") from exc
    await db.refresh(strategy)
    return StrategyTemplateOut.model_validate(strategy, from_attributes=True)


@router.put("/strategies/{strategy_id}", response_model=StrategyTemplateOut)
async def update_strategy(
    strategy_id: str,
    strategy_in: StrategyTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    strategy = await db.get(StrategyTemplate, strategy_id)
    if not strategy:
        raise NotFoundError("Strategy not found")
    payload = strategy_in.model_dump(exclude={"strategy_id"})
    for key, value in payload.items():
        setattr(strategy, key, value)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError("Strategy with this slug already exists") from exc
    await db.refresh(strategy)
    return StrategyTemplateOut.model_validate(strategy, from_attributes=True)


@router.delete("/strategies/{strategy_id}")
async def delete_strategy(
    strategy_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    strategy = await db.get(StrategyTemplate, strategy_id)
    if not strategy:
        raise NotFoundError("Strategy not found")
    await db.delete(strategy)
    await db.commit()
    return {"deleted": True, "strategy_id": strategy_id}


@router.get("/models", response_model=list[FreqAIModelVariantOut])
async def list_models(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (await db.execute(select(FreqAIModelVariant).order_by(FreqAIModelVariant.created_at.desc()))).scalars().all()
    return [FreqAIModelVariantOut.model_validate(item, from_attributes=True) for item in rows]

@router.post("/models", response_model=FreqAIModelVariantOut)
async def create_model(
    model_in: FreqAIModelVariantCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Создает новую модель FreqAI"""
    service = FreqAIService(db)
    return await service.create_model(model_in)


@router.put("/models/{model_id}", response_model=FreqAIModelVariantOut)
async def update_model(
    model_id: str,
    model_in: FreqAIModelVariantUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    model = await db.get(FreqAIModelVariant, model_id)
    if not model:
        raise NotFoundError("Model not found")
    payload = model_in.model_dump(exclude={"model_id"})
    for key, value in payload.items():
        setattr(model, key, value)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError("Model with this slug already exists") from exc
    await db.refresh(model)
    return FreqAIModelVariantOut.model_validate(model, from_attributes=True)


@router.delete("/models/{model_id}")
async def delete_model(
    model_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    model = await db.get(FreqAIModelVariant, model_id)
    if not model:
        raise NotFoundError("Model not found")
    await db.delete(model)
    await db.commit()
    return {"deleted": True, "model_id": model_id}


@router.get("/alignments", response_model=list[StrategyAlignmentOut])
async def list_alignments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (await db.execute(select(StrategyAlignment).order_by(StrategyAlignment.created_at.desc()))).scalars().all()
    return [StrategyAlignmentOut.model_validate(item, from_attributes=True) for item in rows]


@router.post("/alignments", response_model=StrategyAlignmentOut)
async def create_alignment(
    alignment_in: StrategyAlignmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    alignment = StrategyAlignment(**alignment_in.model_dump())
    db.add(alignment)
    await db.commit()
    await db.refresh(alignment)
    return StrategyAlignmentOut.model_validate(alignment, from_attributes=True)


@router.put("/alignments/{alignment_id}", response_model=StrategyAlignmentOut)
async def update_alignment(
    alignment_id: str,
    alignment_in: StrategyAlignmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    alignment = await db.get(StrategyAlignment, alignment_id)
    if not alignment:
        raise NotFoundError("Alignment not found")
    payload = alignment_in.model_dump(exclude={"alignment_id"})
    for key, value in payload.items():
        setattr(alignment, key, value)
    await db.commit()
    await db.refresh(alignment)
    return StrategyAlignmentOut.model_validate(alignment, from_attributes=True)


@router.delete("/alignments/{alignment_id}")
async def delete_alignment(
    alignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    alignment = await db.get(StrategyAlignment, alignment_id)
    if not alignment:
        raise NotFoundError("Alignment not found")
    await db.delete(alignment)
    await db.commit()
    return {"deleted": True, "alignment_id": alignment_id}


@router.post("/alignments/{alignment_id}/generate-bot")
async def generate_bot_from_alignment(
    alignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await generate_bot_for_alignment(db, alignment_id, current_user.user_id)
    return result


@router.get("/backtests")
async def list_backtests(
    limit: int = Query(100, ge=1, le=500),
    strategy: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    results_dir = _backtest_results_dir()
    files = _iter_backtest_files(results_dir)
    out: list[dict[str, Any]] = []

    for fp in files:
        parsed = parse_backtest_file(fp)
        if not parsed:
            continue
        if strategy and strategy.lower() not in str(parsed.get("strategy_name", "")).lower():
            continue
        out.append(parsed)
        if len(out) >= limit:
            break

    return {
        "backtests": out,
        "total": len(out),
        "path": str(results_dir),
    }


@router.get("/backtests/{backtest_id}")
async def get_backtest_detail(
    backtest_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    results_dir = _backtest_results_dir()
    files = _iter_backtest_files(results_dir)
    matched = next((fp for fp in files if fp.stem == backtest_id or fp.name == backtest_id), None)
    if not matched:
        raise NotFoundError("Backtest result not found")

    data = _read_backtest_payload(matched)
    trades = [_normalize_trade(item) for item in _extract_trades(data)]
    if "trades" not in data:
        data["trades"] = trades
    return {
        "id": matched.stem,
        "filename": matched.name,
        "data": data,
    }

@router.post("/models/{model_id}/train")
async def train_model(
    model_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Запускает обучение модели"""
    service = FreqAIService(db)
    model = await service.get_model(model_id)
    if not model:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Model not found")

    await service.train_model(model_id)
    return {"status": "training_started"}


@router.get("/configs/{config_id}/params", response_model=ConfigParamsOut)
async def get_config_params(
    config_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    service = ConfigParamsService(db)
    out = await service.get_config_with_params(config_id, user_id=current_user.user_id)
    return {
        "config": out["config"],
        "params": out["params"],
        "source": out["source"],
    }


@router.post("/configs/{config_id}/params", response_model=ConfigParamsOut)
async def save_config_params_as_new_version(
    config_id: str,
    payload: ConfigParamsSaveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    service = ConfigParamsService(db)
    out = await service.save_params_as_new_version(
        base_config_id=config_id,
        user_id=current_user.user_id,
        name=payload.name,
        make_active=payload.make_active,
        params=payload.params,
    )
    return {
        "config": out["config"],
        "params": out["params"],
        "source": out["source"],
    }


@router.get("/configs/diff")
async def diff_configs(
    from_config_id: str = Query(..., alias="from"),
    to_config_id: str = Query(..., alias="to"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    service = ConfigParamsService(db)
    return await service.diff_params(from_config_id, to_config_id, user_id=current_user.user_id)


@router.get("/configs/diff/export")
async def export_diff_configs(
    from_config_id: str = Query(..., alias="from"),
    to_config_id: str = Query(..., alias="to"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    service = ConfigParamsService(db)
    payload = await service.diff_params(from_config_id, to_config_id, user_id=current_user.user_id)
    return JSONResponse(
        content=jsonable_encoder(payload),
        headers={
            "Content-Disposition": f'attachment; filename="config-diff-{from_config_id[:8]}-{to_config_id[:8]}.json"'
        },
    )


@router.get("/configs/{config_id}/audit", response_model=ConfigAuditListOut)
async def get_config_audit(
    config_id: str,
    action: str | None = Query(default=None),
    created_from: datetime | None = Query(default=None),
    created_to: datetime | None = Query(default=None),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    service = ConfigParamsService(db)
    return await service.get_config_audit(
        config_id,
        user_id=current_user.user_id,
        limit=limit,
        offset=offset,
        action=action,
        created_from=created_from,
        created_to=created_to,
        order=order,
    )


@router.get("/configs/{config_id}/audit/export")
async def export_config_audit(
    config_id: str,
    action: str | None = Query(default=None),
    created_from: datetime | None = Query(default=None),
    created_to: datetime | None = Query(default=None),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
    limit: int = Query(1000, ge=1, le=5000),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    service = ConfigParamsService(db)
    payload = await service.get_config_audit(
        config_id,
        user_id=current_user.user_id,
        limit=limit,
        offset=offset,
        action=action,
        created_from=created_from,
        created_to=created_to,
        order=order,
    )
    return JSONResponse(
        content=jsonable_encoder(payload),
        headers={"Content-Disposition": f'attachment; filename="config-audit-{config_id[:8]}.json"'},
    )


@router.get("/configs/{config_id}/audit/export.csv")
async def export_config_audit_csv(
    config_id: str,
    action: str | None = Query(default=None),
    created_from: datetime | None = Query(default=None),
    created_to: datetime | None = Query(default=None),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
    limit: int = Query(1000, ge=1, le=5000),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    service = ConfigParamsService(db)
    payload = await service.get_config_audit(
        config_id,
        user_id=current_user.user_id,
        limit=limit,
        offset=offset,
        action=action,
        created_from=created_from,
        created_to=created_to,
        order=order,
    )

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "event_id",
        "config_id",
        "user_id",
        "scope",
        "owner_id",
        "action",
        "created_at",
        "details_json",
    ])

    for item in payload.get("items", []):
        writer.writerow(
            [
                item.get("event_id"),
                item.get("config_id"),
                item.get("user_id"),
                item.get("scope"),
                item.get("owner_id"),
                item.get("action"),
                item.get("created_at"),
                json.dumps(item.get("details", {}), ensure_ascii=False),
            ]
        )

    content = buffer.getvalue()
    buffer.close()

    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="config-audit-{config_id[:8]}.csv"'},
    )
