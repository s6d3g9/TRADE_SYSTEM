"""Trading API endpoints - comprehensive bot management"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user
from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.trading import Backtest, Bot, BotSession
from app.models.user import User
from app.schemas.trading import (
    BotCreate,
    Bot as BotSchema,
    BotSession as BotSessionSchema,
    BacktestCreate,
    Backtest as BacktestSchema,
)
from app.services.bot_service import BotService
from app.services.backtest_service import BacktestService

router = APIRouter(prefix="/trading", tags=["trading"])


@router.get("/bots", response_model=list[BotSchema])
async def list_bots(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        await db.execute(
            select(Bot)
            .where(Bot.user_id == current_user.user_id)
            .order_by(Bot.created_at.desc())
        )
    ).scalars().all()
    return rows

@router.post("/bots", response_model=BotSchema)
async def create_bot(
    bot_in: BotCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Создает нового торгового бота"""
    bot_in = bot_in.model_copy(update={"user_id": current_user.user_id})
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
    if not bot:
        raise NotFoundError("Bot not found")
    if bot.user_id != current_user.user_id:
        raise ForbiddenError("Bot not found")
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
    if not bot:
        raise NotFoundError("Bot not found")
    if bot.user_id != current_user.user_id:
        raise ForbiddenError("Bot not found")

    return await service.start_bot(bot_id)


@router.post("/bots/{bot_id}/deploy")
async def deploy_bot(
    bot_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = BotService(db)
    bot = await service.get_bot(bot_id)
    if not bot:
        raise NotFoundError("Bot not found")
    if bot.user_id != current_user.user_id:
        raise ForbiddenError("Bot not found")

    session = await service.start_bot(bot_id)
    return {
        "bot_id": bot_id,
        "session_id": session.session_id,
        "container_id": session.container_id,
        "container_name": session.container_name,
        "status": session.status,
    }

@router.post("/bots/{bot_id}/stop")
async def stop_bot(
    bot_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Останавливает бота (убивает Docker-контейнер)"""
    service = BotService(db)
    bot = await service.get_bot(bot_id)
    if not bot:
        raise NotFoundError("Bot not found")
    if bot.user_id != current_user.user_id:
        raise ForbiddenError("Bot not found")

    await service.stop_bot(bot_id)
    return {"status": "stopped"}


@router.get("/bots/{bot_id}/status")
async def bot_status(
    bot_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = BotService(db)
    bot = await service.get_bot(bot_id)
    if not bot:
        raise NotFoundError("Bot not found")
    if bot.user_id != current_user.user_id:
        raise ForbiddenError("Bot not found")

    session = (
        await db.execute(
            select(BotSession)
            .where(BotSession.bot_id == bot_id)
            .order_by(BotSession.started_at.desc())
        )
    ).scalars().first()

    return {
        "bot_id": bot.bot_id,
        "status": bot.status,
        "container_name": session.container_name if session else None,
        "container_id": session.container_id if session else None,
        "session_status": session.status if session else None,
        "started_at": session.started_at if session else None,
        "stopped_at": session.stopped_at if session else None,
    }

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
    if not bot:
        raise NotFoundError("Bot not found")
    if bot.user_id != current_user.user_id:
        raise ForbiddenError("Bot not found")
        
    backtest = await service.create_backtest(backtest_in)

    return await service.run_backtest(backtest.backtest_id)


@router.get("/backtests", response_model=list[BacktestSchema])
async def list_backtests(
    bot_id: str | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(Backtest)
        .where(Backtest.user_id == current_user.user_id)
        .order_by(Backtest.created_at.desc())
        .limit(limit)
    )
    if bot_id:
        query = (
            select(Backtest)
            .where(Backtest.user_id == current_user.user_id, Backtest.bot_id == bot_id)
            .order_by(Backtest.created_at.desc())
            .limit(limit)
        )
    rows = (await db.execute(query)).scalars().all()
    return rows


@router.post("/bots/{bot_id}/backtests/run", response_model=BacktestSchema)
async def run_bot_backtest(
    bot_id: str,
    pair: str = "BTC/USDT",
    timeframe: str = "1h",
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bot_service = BotService(db)
    bot = await bot_service.get_bot(bot_id)
    if not bot:
        raise NotFoundError("Bot not found")
    if bot.user_id != current_user.user_id:
        raise ForbiddenError("Bot not found")

    strategy_name = "SampleStrategy"
    if bot.alignment_id:
        strategy_name = f"Alignment_{bot.alignment_id[:8]}"

    end_dt = datetime.now(timezone.utc)
    start_dt = end_dt - timedelta(days=max(days, 1))
    backtest_in = BacktestCreate(
        bot_id=bot.bot_id,
        alignment_id=bot.alignment_id,
        user_id=current_user.user_id,
        strategy_name=strategy_name,
        pair=pair,
        timeframe=timeframe,
        backtest_start=start_dt,
        backtest_end=end_dt,
        period_description=f"last_{max(days, 1)}d",
    )

    service = BacktestService(db)
    backtest = await service.create_backtest(backtest_in)
    return await service.run_backtest(backtest.backtest_id)
