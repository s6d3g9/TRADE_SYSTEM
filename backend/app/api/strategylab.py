"""Strategy Lab API endpoints"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user
from app.core.exceptions import NotFoundError
from app.models.user import User
from app.schemas.strategylab import (
    FreqAIModelVariantCreate,
    FreqAIModelVariantOut,
)
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
        raise NotFoundError("Model not found")

    await service.train_model(model_id)
    return {"status": "training_started"}
