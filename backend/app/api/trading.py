"""Trading API endpoints - comprehensive bot management"""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.schemas.trading import (
    BotCreate,
    BotUpdate,
    Bot as BotSchema,
    BotSessionCreate,
    BotSession as BotSessionSchema,
    BacktestCreate,
    Backtest as BacktestSchema,
)
from app.services.bot_service import BotService
from app.services.backtest_service import BacktestService

router = APIRouter(prefix="/trading", tags=["trading"])

@router.post("/bots", response_model=BotSchema)
async def create_bot(
    bot_in: BotCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Создает нового торгового бота"""
    bot_in.user_id = current_user.user_id
    service = BotService(db)
    return await service.create_bot(bot_in)

@router.get("/bots/{bot_id}", response_model=BotSchema)
async def get_bot(
    bot_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получает информацию о боте"""
    service = BotService(db)
    bot = await service.get_bot(bot_id)
    if not bot or bot.user_id != current_user.user_id:
        raise HTTPException(status_code=404, detail="Bot not found")
    return bot

@router.post("/bots/{bot_id}/start", response_model=BotSessionSchema)
async def start_bot(
    bot_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Запускает бота (создает сессию и Docker-контейнер)"""
    service = BotService(db)
    bot = await service.get_bot(bot_id)
    if not bot or bot.user_id != current_user.user_id:
        raise HTTPException(status_code=404, detail="Bot not found")
        
    try:
        return await service.start_bot(bot_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/bots/{bot_id}/stop")
async def stop_bot(
    bot_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Останавливает бота (убивает Docker-контейнер)"""
    service = BotService(db)
    bot = await service.get_bot(bot_id)
    if not bot or bot.user_id != current_user.user_id:
        raise HTTPException(status_code=404, detail="Bot not found")
        
    try:
        await service.stop_bot(bot_id)
        return {"status": "stopped"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/backtests", response_model=BacktestSchema)
async def run_backtest(
    backtest_in: BacktestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Запускает бэктест"""
    service = BacktestService(db)
    
    # Проверяем права на бота
    bot_service = BotService(db)
    bot = await bot_service.get_bot(backtest_in.bot_id)
    if not bot or bot.user_id != current_user.user_id:
        raise HTTPException(status_code=404, detail="Bot not found")
        
    backtest = await service.create_backtest(backtest_in)
    
    try:
        return await service.run_backtest(backtest.backtest_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
