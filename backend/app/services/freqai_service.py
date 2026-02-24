from pathlib import Path
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.exceptions import NotFoundError, NotImplementedAppError
from app.models.strategylab import FreqAIModelVariant
from app.schemas.strategylab import FreqAIModelVariantCreate
from app.core.config import settings

class FreqAIService:
    """
    Сервис для управления моделями машинного обучения FreqAI.
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_data_host_dir = (
            Path(settings.freqtrade_user_data_host)
            if settings.freqtrade_user_data_host
            else Path("freqtrade/user_data")
        ).resolve()
        self.user_data_container_dir = Path(settings.freqtrade_user_data)
        
    async def create_model(self, model_in: FreqAIModelVariantCreate) -> FreqAIModelVariant:
        model = FreqAIModelVariant(model_id=uuid4().hex, **model_in.model_dump())
        self.db.add(model)
        await self.db.commit()
        await self.db.refresh(model)
        return model
        
    async def get_model(self, model_id: str) -> FreqAIModelVariant | None:
        result = await self.db.execute(select(FreqAIModelVariant).where(FreqAIModelVariant.model_id == model_id))
        return result.scalar_one_or_none()
        
    async def train_model(self, model_id: str) -> None:
        """
        Запускает обучение модели через Freqtrade.
        """
        model = await self.get_model(model_id)
        if not model:
            raise NotFoundError("Model not found")
            
        raise NotImplementedAppError("FreqAI training orchestration is not implemented yet")
