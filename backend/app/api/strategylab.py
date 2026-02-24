"""Strategy Lab API endpoints"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.schemas.strategylab import (
    ConfigParamsOut,
    ConfigParamsSaveRequest,
    FreqAIModelVariantCreate,
    FreqAIModelVariantOut,
)
from app.services.config_params_service import ConfigParamsService
from app.services.freqai_service import FreqAIService

router = APIRouter(prefix="/strategylab", tags=["strategylab"])

@router.post("/models", response_model=FreqAIModelVariantOut)
async def create_model(
    model_in: FreqAIModelVariantCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Создает новую модель FreqAI"""
    service = FreqAIService(db)
    return await service.create_model(model_in)

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
