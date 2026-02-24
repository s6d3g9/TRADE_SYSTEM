from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.exceptions import NotFoundError
from app.models.trading import Backtest
from app.schemas.trading import BacktestCreate
from app.core.config import settings

class BacktestService:
    """
    Сервис для управления бэктестами.
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_data_host_dir = (
            Path(settings.freqtrade_user_data_host)
            if settings.freqtrade_user_data_host
            else Path("freqtrade/user_data")
        ).resolve()
        self.user_data_container_dir = Path(settings.freqtrade_user_data)
        
    async def create_backtest(self, backtest_in: BacktestCreate) -> Backtest:
        backtest = Backtest(**backtest_in.model_dump())
        self.db.add(backtest)
        await self.db.commit()
        await self.db.refresh(backtest)
        return backtest
        
    async def get_backtest(self, backtest_id: str) -> Backtest | None:
        result = await self.db.execute(select(Backtest).where(Backtest.backtest_id == backtest_id))
        return result.scalar_one_or_none()
        
    async def run_backtest(self, backtest_id: str) -> Backtest:
        """
        Запускает бэктест через Freqtrade.
        """
        backtest = await self.get_backtest(backtest_id)
        if not backtest:
            raise NotFoundError("Backtest not found")
            
        backtest.status = "running"
        await self.db.commit()
        
        # TODO: Генерация конфига для бэктеста
        # TODO: Запуск docker run freqtrade backtesting
        # TODO: Парсинг результатов из JSON
        
        backtest.status = "completed"
        await self.db.commit()
        
        return backtest
