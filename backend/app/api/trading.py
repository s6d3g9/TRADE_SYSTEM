"""Trading API endpoints - comprehensive bot management"""
import json
import uuid
import zipfile
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user, maybe_current_user
from app.core.config import settings
from app.models.trading import (
    Bot,
    BotSession,
    Trade,
    Position,
    Backtest,
    BotMetric,
    ExchangeAccount,
)
from app.services.freqtrade_sync import FreqtradeClient
from app.models.user import User
from app.schemas.trading import (
    BotCreate,
    BotUpdate,
    Bot as BotSchema,
    BotWithSession,
    BotStats,
    BotSessionCreate,
    BotSession as BotSessionSchema,
    SessionStats,
    TradeCreate,
    Trade as TradeSchema,
    PositionCreate,
    PositionUpdate,
    Position as PositionSchema,
    BacktestCreate,
    Backtest as BacktestSchema,
    BotMetricCreate,
    BotMetric as BotMetricSchema,
    MarketSummary,
)
from app.schemas.user_stats import UserStats

router = APIRouter(prefix="/trading", tags=["trading"])


# =========================================================================
# BACKTESTS (DB)
# =========================================================================


@router.get("/bots/{bot_id}/backtests", response_model=list[BacktestSchema])
async def list_bot_backtests(
    bot_id: str,
    limit: int = Query(20, ge=1, le=200),
    offset: int = 0,
    session: AsyncSession = Depends(get_db),
    user: User | None = Depends(maybe_current_user),
) -> list[Backtest]:
    """List persisted backtests for a bot (newest first)."""

    if user:
        bot_stmt = select(Bot).where(and_(Bot.bot_id == bot_id, Bot.user_id == user.user_id))
        bot_result = await session.execute(bot_stmt)
        if not bot_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Bot not found")

    stmt = (
        select(Backtest)
        .where(Backtest.bot_id == bot_id)
        .order_by(desc(Backtest.created_at))
        .limit(limit)
        .offset(offset)
    )
    res = await session.execute(stmt)
    return res.scalars().all()


@router.get("/backtests")
async def list_backtests_benchmark(
    strategy: str | None = Query(default=None, description="Filter by strategy_name (contains)"),
    pair: str | None = Query(default=None, description="Filter by pair (contains)"),
    timeframe: str | None = Query(default=None, description="Filter by timeframe (exact)"),
    status: str | None = Query(default=None, description="Filter by status (exact)"),
    bot_id: str | None = Query(default=None),
    alignment_id: str | None = Query(default=None),
    created_from: datetime | None = Query(default=None, description="ISO datetime"),
    created_to: datetime | None = Query(default=None, description="ISO datetime"),
    sort_by: str = Query(
        default="created_at",
        description="created_at,total_return_percent,sharpe_ratio,max_drawdown_percent,win_rate,profit_factor,total_trades,avg_trade_return",
    ),
    order: str = Query(default="desc", description="asc|desc"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = 0,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Benchmark/compare backtests with basic filters."""

    stmt = select(Backtest).where(Backtest.user_id == user.user_id)

    if bot_id:
        stmt = stmt.where(Backtest.bot_id == bot_id)
    if alignment_id:
        stmt = stmt.where(Backtest.alignment_id == alignment_id)
    if status:
        stmt = stmt.where(Backtest.status == status)
    if timeframe:
        stmt = stmt.where(Backtest.timeframe == timeframe)
    if strategy:
        stmt = stmt.where(Backtest.strategy_name.ilike(f"%{strategy}%"))
    if pair:
        stmt = stmt.where(Backtest.pair.ilike(f"%{pair}%"))
    if created_from:
        stmt = stmt.where(Backtest.created_at >= created_from)
    if created_to:
        stmt = stmt.where(Backtest.created_at <= created_to)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_stmt)).scalar() or 0

    sort_map = {
        "created_at": Backtest.created_at,
        "total_return_percent": Backtest.total_return_percent,
        "sharpe_ratio": Backtest.sharpe_ratio,
        "max_drawdown_percent": Backtest.max_drawdown_percent,
        "win_rate": Backtest.win_rate,
        "profit_factor": Backtest.profit_factor,
        "total_trades": Backtest.total_trades,
        "avg_trade_return": Backtest.avg_trade_return,
    }
    sort_col = sort_map.get(sort_by, Backtest.created_at)
    if order.lower() == "asc":
        stmt = stmt.order_by(sort_col.asc().nullslast())
    else:
        stmt = stmt.order_by(sort_col.desc().nullslast())

    stmt = stmt.limit(limit).offset(offset)
    items = (await session.execute(stmt)).scalars().all()

    return {
        "items": [BacktestSchema.model_validate(x, from_attributes=True).model_dump() for x in items],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/backtests/{backtest_id}/trades")
async def get_backtest_trades(
    backtest_id: str,
    order: str = Query(default="asc", description="asc|desc (chronological by open time)"),
    limit: int = Query(1000, ge=1, le=5000),
    offset: int = 0,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Return trades for a persisted backtest by reading its result file.

    Trades are sorted chronologically (open time).
    """

    row = await session.get(Backtest, backtest_id)
    if not row or row.user_id != user.user_id:
        raise HTTPException(status_code=404, detail="Backtest not found")

    if not row.result_file_path:
        raise HTTPException(status_code=404, detail="Backtest has no result_file_path")

    filepath = Path(row.result_file_path)
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Result file not found")

    def _parse_dt(value: Any) -> datetime | None:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        if isinstance(value, (int, float)):
            try:
                return datetime.fromtimestamp(float(value), tz=timezone.utc)
            except Exception:
                return None
        if isinstance(value, str):
            s = value.strip()
            if not s:
                return None
            try:
                dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
                return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
            except Exception:
                pass
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
                try:
                    return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
                except Exception:
                    continue
        return None

    def _trade_sort_key(t: dict[str, Any]) -> tuple:
        for k in (
            "open_date_utc",
            "open_date",
            "open_time",
            "open_timestamp",
            "open_ts",
        ):
            if k in t:
                dt = _parse_dt(t.get(k))
                if dt:
                    return (dt,)
        # Fallback: push unknown dates to end
        return (datetime.max.replace(tzinfo=timezone.utc),)

    # Load raw report JSON from file
    try:
        if filepath.suffix.lower() == ".zip":
            with zipfile.ZipFile(filepath, "r") as zf:
                json_files = [
                    n
                    for n in zf.namelist()
                    if n.endswith(".json") and (not n.endswith("_config.json"))
                ]
                if not json_files:
                    raise HTTPException(status_code=500, detail="No JSON found in ZIP")
                with zf.open(json_files[0]) as jf:
                    data = json.load(jf)
        else:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read result file: {e}")

    trades: list[dict[str, Any]] = []
    try:
        strategy_data = None
        if isinstance(data, dict) and isinstance(data.get("strategy"), dict) and data.get("strategy"):
            # Prefer the row strategy name if present.
            if row.strategy_name and row.strategy_name in data["strategy"]:
                strategy_data = data["strategy"][row.strategy_name]
            else:
                first_key = next(iter(data["strategy"].keys()))
                strategy_data = data["strategy"].get(first_key)
        elif isinstance(data, dict) and isinstance(data.get("strategy"), str):
            strategy_data = data

        if isinstance(strategy_data, dict) and isinstance(strategy_data.get("trades"), list):
            trades = [t for t in strategy_data.get("trades", []) if isinstance(t, dict)]
        elif isinstance(data, dict) and isinstance(data.get("trades"), list):
            trades = [t for t in data.get("trades", []) if isinstance(t, dict)]
    except Exception:
        trades = []

    trades_sorted = sorted(trades, key=_trade_sort_key, reverse=(order.lower() == "desc"))
    total = len(trades_sorted)
    sliced = trades_sorted[offset : offset + limit]

    # Provide columns for UI
    cols: list[str] = []
    if sliced:
        key_set: set[str] = set()
        for t in sliced:
            key_set.update(t.keys())
        cols = sorted(key_set)

    return {
        "items": sliced,
        "total": total,
        "limit": limit,
        "offset": offset,
        "columns": cols,
    }


# ============================================================================
# USER STATS
# ============================================================================


@router.get("/user/stats", response_model=UserStats)
async def get_user_stats(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Get aggregated statistics for current user"""
    
    # Count total bots
    total_bots_stmt = select(func.count()).where(Bot.user_id == user.user_id)
    total_bots_result = await session.execute(total_bots_stmt)
    total_bots = total_bots_result.scalar() or 0
    
    # Count active (running) bots
    active_bots_stmt = select(func.count()).where(
        and_(Bot.user_id == user.user_id, Bot.status == "running")
    )
    active_bots_result = await session.execute(active_bots_stmt)
    active_bots = active_bots_result.scalar() or 0
    
    # Get all user's bot IDs
    bot_ids_stmt = select(Bot.bot_id).where(Bot.user_id == user.user_id)
    bot_ids_result = await session.execute(bot_ids_stmt)
    bot_ids = [row[0] for row in bot_ids_result.fetchall()]
    
    if not bot_ids:
        return {
            "user_id": user.user_id,
            "total_bots": 0,
            "active_bots": 0,
            "total_sessions": 0,
            "total_trades": 0,
            "open_positions": 0,
            "total_pnl": Decimal("0"),
            "total_pnl_percent": Decimal("0"),
            "win_rate": Decimal("0"),
        }
    
    # Count total sessions
    total_sessions_stmt = select(func.count()).where(BotSession.bot_id.in_(bot_ids))
    total_sessions_result = await session.execute(total_sessions_stmt)
    total_sessions = total_sessions_result.scalar() or 0
    
    # Count total trades
    total_trades_stmt = select(func.count()).where(Trade.bot_id.in_(bot_ids))
    total_trades_result = await session.execute(total_trades_stmt)
    total_trades = total_trades_result.scalar() or 0
    
    # Count open positions
    open_positions_stmt = select(func.count()).where(
        and_(Position.bot_id.in_(bot_ids), Position.status == "open")
    )
    open_positions_result = await session.execute(open_positions_stmt)
    open_positions = open_positions_result.scalar() or 0
    
    # Calculate total PnL from all sessions
    sessions_stmt = select(BotSession).where(BotSession.bot_id.in_(bot_ids))
    sessions_result = await session.execute(sessions_stmt)
    sessions = sessions_result.scalars().all()
    
    total_initial = Decimal("0")
    total_final = Decimal("0")
    for s in sessions:
        if s.initial_balance:
            total_initial += s.initial_balance
        if s.final_balance:
            total_final += s.final_balance
    
    total_pnl = total_final - total_initial if total_final > 0 else Decimal("0")
    total_pnl_percent = (
        ((total_final - total_initial) / total_initial * 100)
        if total_initial > 0
        else Decimal("0")
    )
    
    # Calculate win rate from closed trades
    closed_trades_stmt = select(Trade).where(
        and_(Trade.bot_id.in_(bot_ids), Trade.status == "closed")
    )
    closed_trades_result = await session.execute(closed_trades_stmt)
    closed_trades = closed_trades_result.scalars().all()
    
    if closed_trades:
        winning_trades = sum(1 for t in closed_trades if (t.meta or {}).get("profit", 0) > 0)
        win_rate = Decimal(winning_trades) / Decimal(len(closed_trades)) * 100
    else:
        win_rate = Decimal("0")
    
    # Find best performing bot
    best_bot_id = None
    best_bot_name = None
    best_bot_pnl = None
    
    for bot_id in bot_ids:
        bot_sessions_stmt = select(BotSession).where(BotSession.bot_id == bot_id)
        bot_sessions_result = await session.execute(bot_sessions_stmt)
        bot_sessions = bot_sessions_result.scalars().all()
        
        bot_pnl = Decimal("0")
        for bs in bot_sessions:
            if bs.initial_balance and bs.final_balance:
                bot_pnl += bs.final_balance - bs.initial_balance
        
        if best_bot_pnl is None or bot_pnl > best_bot_pnl:
            best_bot_pnl = bot_pnl
            best_bot_id = bot_id
            
            # Get bot name
            bot_stmt = select(Bot).where(Bot.bot_id == bot_id)
            bot_result = await session.execute(bot_stmt)
            bot = bot_result.scalar_one_or_none()
            if bot:
                best_bot_name = bot.name
    
    return {
        "user_id": user.user_id,
        "total_bots": total_bots,
        "active_bots": active_bots,
        "total_sessions": total_sessions,
        "total_trades": total_trades,
        "open_positions": open_positions,
        "total_pnl": total_pnl,
        "total_pnl_percent": total_pnl_percent,
        "win_rate": win_rate,
        "best_bot_id": best_bot_id,
        "best_bot_name": best_bot_name,
        "best_bot_pnl": best_bot_pnl,
    }


# ============================================================================
# BOTS CRUD
# ============================================================================


@router.post("/bots", response_model=BotSchema)
async def create_bot(
    bot_data: BotCreate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Bot:
    """Create a new trading bot"""
    bot = Bot(
        bot_id=str(uuid.uuid4()),
        name=bot_data.name,
        alignment_id=bot_data.alignment_id,
        user_id=user.user_id if user else bot_data.user_id,
        config_path=bot_data.config_path,
        exchange=bot_data.exchange,
        status=bot_data.status,
        mode=bot_data.mode,
        tags=bot_data.tags,
        meta=bot_data.meta,
    )
    session.add(bot)
    await session.commit()
    await session.refresh(bot)
    return bot


@router.get("/bots", response_model=list[BotWithSession])
async def list_bots(
    status: str | None = None,
    mode: str | None = None,
    exchange: str | None = None,
    limit: int = Query(100, le=1000),
    offset: int = 0,
    session: AsyncSession = Depends(get_db),
    user: User | None = Depends(maybe_current_user),
) -> list[Bot]:
    """List all bots (filtered by user if authenticated)"""
    stmt = select(Bot)

    if user:
        stmt = stmt.where(Bot.user_id == user.user_id)

    if status:
        stmt = stmt.where(Bot.status == status)
    if mode:
        stmt = stmt.where(Bot.mode == mode)
    if exchange:
        stmt = stmt.where(Bot.exchange == exchange)

    stmt = stmt.order_by(desc(Bot.created_at)).limit(limit).offset(offset)

    result = await session.execute(stmt)
    bots = result.scalars().all()

    # Enrich with current session info
    enriched = []
    for bot in bots:
        # Get current (latest) session
        session_stmt = (
            select(BotSession)
            .where(BotSession.bot_id == bot.bot_id)
            .order_by(desc(BotSession.started_at))
            .limit(1)
        )
        session_result = await session.execute(session_stmt)
        current_session = session_result.scalar_one_or_none()

        # Count open positions
        pos_stmt = select(func.count()).where(
            and_(Position.bot_id == bot.bot_id, Position.status == "open")
        )
        pos_result = await session.execute(pos_stmt)
        open_positions_count = pos_result.scalar() or 0

        bot_dict = {
            **bot.__dict__,
            "current_session": current_session,
            "open_positions_count": open_positions_count,
            "current_balance": current_session.final_balance if current_session else None,
            "current_pnl": None,  # Calculate from metrics
        }
        enriched.append(bot_dict)

    return enriched


@router.get("/bots/{bot_id}", response_model=BotWithSession)
async def get_bot(
    bot_id: str,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Bot:
    """Get bot details"""
    stmt = select(Bot).where(Bot.bot_id == bot_id)
    if user:
        stmt = stmt.where(Bot.user_id == user.user_id)

    result = await session.execute(stmt)
    bot = result.scalar_one_or_none()

    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    # Get current session
    session_stmt = (
        select(BotSession)
        .where(BotSession.bot_id == bot_id)
        .order_by(desc(BotSession.started_at))
        .limit(1)
    )
    session_result = await session.execute(session_stmt)
    current_session = session_result.scalar_one_or_none()

    # Count open positions
    pos_stmt = select(func.count()).where(
        and_(Position.bot_id == bot_id, Position.status == "open")
    )
    pos_result = await session.execute(pos_stmt)
    open_positions_count = pos_result.scalar() or 0

    return {
        **bot.__dict__,
        "current_session": current_session,
        "open_positions_count": open_positions_count,
        "current_balance": current_session.final_balance if current_session else None,
        "current_pnl": None,
    }


@router.put("/bots/{bot_id}", response_model=BotSchema)
async def update_bot(
    bot_id: str,
    bot_data: BotUpdate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Bot:
    """Update bot configuration"""
    stmt = select(Bot).where(Bot.bot_id == bot_id)
    if user:
        stmt = stmt.where(Bot.user_id == user.user_id)

    result = await session.execute(stmt)
    bot = result.scalar_one_or_none()

    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    # Update fields
    for field, value in bot_data.model_dump(exclude_unset=True).items():
        setattr(bot, field, value)

    await session.commit()
    await session.refresh(bot)
    return bot


@router.delete("/bots/{bot_id}")
async def delete_bot(
    bot_id: str,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Delete a bot"""
    stmt = select(Bot).where(Bot.bot_id == bot_id)
    if user:
        stmt = stmt.where(Bot.user_id == user.user_id)

    result = await session.execute(stmt)
    bot = result.scalar_one_or_none()

    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    await session.delete(bot)
    await session.commit()

    return {"ok": True, "bot_id": bot_id}


# ============================================================================
# BOT SESSIONS
# ============================================================================


@router.post("/sessions", response_model=BotSessionSchema)
async def create_bot_session(
    session_data: BotSessionCreate,
    session: AsyncSession = Depends(get_db),
) -> BotSession:
    """Start a new bot session"""
    bot_session = BotSession(
        session_id=str(uuid.uuid4()),
        bot_id=session_data.bot_id,
        container_id=session_data.container_id,
        container_name=session_data.container_name,
        initial_balance=session_data.initial_balance,
        stats=session_data.stats,
    )
    session.add(bot_session)

    # Update bot status
    bot_stmt = select(Bot).where(Bot.bot_id == session_data.bot_id)
    bot_result = await session.execute(bot_stmt)
    bot = bot_result.scalar_one_or_none()
    if bot:
        bot.status = "running"

    await session.commit()
    await session.refresh(bot_session)
    return bot_session


@router.get("/bots/{bot_id}/sessions", response_model=list[BotSessionSchema])
async def list_bot_sessions(
    bot_id: str,
    limit: int = Query(50, le=500),
    offset: int = 0,
    session: AsyncSession = Depends(get_db),
    user: User | None = Depends(maybe_current_user),
) -> list[BotSession]:
    """List all sessions for a bot"""
    # Verify bot ownership
    if user:
        bot_stmt = select(Bot).where(and_(Bot.bot_id == bot_id, Bot.user_id == user.user_id))
        bot_result = await session.execute(bot_stmt)
        if not bot_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Bot not found")

    stmt = (
        select(BotSession)
        .where(BotSession.bot_id == bot_id)
        .order_by(desc(BotSession.started_at))
        .limit(limit)
        .offset(offset)
    )

    result = await session.execute(stmt)
    return result.scalars().all()


@router.get("/sessions/{session_id}/stats", response_model=SessionStats)
async def get_session_stats(
    session_id: str,
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Get aggregated statistics for a session"""
    # Get session
    sess_stmt = select(BotSession).where(BotSession.session_id == session_id)
    sess_result = await session.execute(sess_stmt)
    bot_session = sess_result.scalar_one_or_none()

    if not bot_session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Calculate runtime
    end_time = bot_session.stopped_at or datetime.now(timezone.utc)
    runtime_seconds = int((end_time - bot_session.started_at).total_seconds())

    # Count trades
    trades_stmt = select(func.count()).where(Trade.session_id == session_id)
    trades_result = await session.execute(trades_stmt)
    total_trades = trades_result.scalar() or 0

    # Count open positions
    pos_stmt = select(func.count()).where(
        and_(Position.session_id == session_id, Position.status == "open")
    )
    pos_result = await session.execute(pos_stmt)
    open_positions = pos_result.scalar() or 0

    # Calculate PnL (simplified)
    balance_change = Decimal("0")
    balance_change_percent = Decimal("0")
    if bot_session.initial_balance and bot_session.final_balance:
        balance_change = bot_session.final_balance - bot_session.initial_balance
        balance_change_percent = (balance_change / bot_session.initial_balance) * 100

    return {
        "session_id": session_id,
        "bot_id": bot_session.bot_id,
        "runtime_seconds": runtime_seconds,
        "total_trades": total_trades,
        "open_positions": open_positions,
        "total_pnl": balance_change,
        "win_rate": Decimal("0"),  # Calculate from trades
        "balance_change": balance_change,
        "balance_change_percent": balance_change_percent,
    }


# ============================================================================
# TRADES & POSITIONS
# ============================================================================


@router.get("/bots/{bot_id}/trades", response_model=list[TradeSchema])
async def list_bot_trades(
    bot_id: str,
    status: str | None = None,
    pair: str | None = None,
    limit: int = Query(100, le=1000),
    offset: int = 0,
    session: AsyncSession = Depends(get_db),
) -> list[Trade]:
    """List trades for a bot"""
    stmt = select(Trade).where(Trade.bot_id == bot_id)

    if status:
        stmt = stmt.where(Trade.status == status)
    if pair:
        stmt = stmt.where(Trade.pair == pair)

    stmt = stmt.order_by(desc(Trade.opened_at)).limit(limit).offset(offset)

    result = await session.execute(stmt)
    return result.scalars().all()


@router.post("/bots/{bot_id}/trades", response_model=TradeSchema)
async def create_trade(
    bot_id: str,
    trade_data: TradeCreate,
    session: AsyncSession = Depends(get_db),
) -> Trade:
    """Record a new trade for a bot"""
    # Verify bot exists
    bot_stmt = select(Bot).where(Bot.bot_id == bot_id)
    bot_result = await session.execute(bot_stmt)
    if not bot_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Bot not found")

    trade = Trade(
        trade_id=str(uuid.uuid4()),
        bot_id=bot_id,
        session_id=trade_data.session_id,
        source_type=trade_data.source_type,
        exchange=trade_data.exchange,
        pair=trade_data.pair,
        side=trade_data.side,
        order_type=trade_data.order_type,
        amount=trade_data.amount,
        price=trade_data.price,
        cost=trade_data.cost,
        fee_cost=trade_data.fee_cost,
        fee_currency=trade_data.fee_currency,
        exchange_order_id=trade_data.exchange_order_id,
        exchange_trade_id=trade_data.exchange_trade_id,
        status=trade_data.status,
        decision_log=trade_data.decision_log.model_dump() if hasattr(trade_data.decision_log, 'model_dump') else trade_data.decision_log,
        meta=trade_data.meta,
        opened_at=datetime.now(timezone.utc),
    )
    session.add(trade)
    await session.commit()
    await session.refresh(trade)
    return trade


@router.get("/bots/{bot_id}/positions", response_model=list[PositionSchema])
async def list_bot_positions(
    bot_id: str,
    status: str = "open",
    session: AsyncSession = Depends(get_db),
) -> list[Position]:
    """List positions for a bot"""
    stmt = select(Position).where(and_(Position.bot_id == bot_id, Position.status == status))
    stmt = stmt.order_by(desc(Position.opened_at))

    result = await session.execute(stmt)
    return result.scalars().all()


@router.post("/bots/{bot_id}/positions", response_model=PositionSchema)
async def create_position(
    bot_id: str,
    position_data: PositionCreate,
    session: AsyncSession = Depends(get_db),
) -> Position:
    """Open a new position for a bot"""
    # Verify bot exists
    bot_stmt = select(Bot).where(Bot.bot_id == bot_id)
    bot_result = await session.execute(bot_stmt)
    if not bot_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Bot not found")

    position = Position(
        position_id=str(uuid.uuid4()),
        bot_id=bot_id,
        session_id=position_data.session_id,
        exchange=position_data.exchange,
        pair=position_data.pair,
        side=position_data.side,
        entry_price=position_data.entry_price,
        amount=position_data.amount,
        leverage=position_data.leverage,
        stop_loss=position_data.stop_loss,
        take_profit=position_data.take_profit,
        decision_log=position_data.decision_log.model_dump() if hasattr(position_data.decision_log, 'model_dump') else position_data.decision_log,
        entry_trade_ids=position_data.entry_trade_ids,
        meta=position_data.meta,
        status="open",
        opened_at=datetime.now(timezone.utc),
    )
    session.add(position)
    await session.commit()
    await session.refresh(position)
    return position


@router.post("/positions/{position_id}/close")
async def close_position(
    position_id: str,
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Close an open position"""
    stmt = select(Position).where(Position.position_id == position_id)
    result = await session.execute(stmt)
    position = result.scalar_one_or_none()

    if not position:
        raise HTTPException(status_code=404, detail="Position not found")

    if position.status != "open":
        raise HTTPException(status_code=400, detail="Position is not open")

    # Close position
    position.status = "closed"
    position.closed_at = datetime.now(timezone.utc)

    await session.commit()

    return {"ok": True, "position_id": position_id, "closed_at": position.closed_at}


# ============================================================================
# METRICS & ANALYTICS
# ============================================================================


@router.get("/bots/{bot_id}/metrics", response_model=list[BotMetricSchema])
async def get_bot_metrics(
    bot_id: str,
    limit: int = Query(100, le=1000),
    session: AsyncSession = Depends(get_db),
) -> list[BotMetric]:
    """Get bot metrics history"""
    stmt = (
        select(BotMetric)
        .where(BotMetric.bot_id == bot_id)
        .order_by(desc(BotMetric.timestamp))
        .limit(limit)
    )

    result = await session.execute(stmt)
    return result.scalars().all()


@router.post("/bots/{bot_id}/metrics", response_model=BotMetricSchema)
async def record_bot_metric(
    bot_id: str,
    metric_data: BotMetricCreate,
    session: AsyncSession = Depends(get_db),
) -> BotMetric:
    """Record a new metric snapshot"""
    metric = BotMetric(**metric_data.model_dump())
    session.add(metric)
    await session.commit()
    await session.refresh(metric)
    return metric


@router.get("/bots/{bot_id}/stats", response_model=BotStats)
async def get_bot_stats(
    bot_id: str,
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Get aggregated bot statistics"""
    # Count sessions
    sessions_stmt = select(func.count()).where(BotSession.bot_id == bot_id)
    sessions_result = await session.execute(sessions_stmt)
    total_sessions = sessions_result.scalar() or 0

    # Total runtime
    runtime_stmt = select(
        func.sum(
            func.extract(
                "epoch",
                func.coalesce(BotSession.stopped_at, func.now()) - BotSession.started_at,
            )
        )
    ).where(BotSession.bot_id == bot_id)
    runtime_result = await session.execute(runtime_stmt)
    total_runtime_seconds = int(runtime_result.scalar() or 0)

    # Trade statistics (simplified)
    trades_stmt = select(func.count()).where(Trade.bot_id == bot_id)
    trades_result = await session.execute(trades_stmt)
    total_trades = trades_result.scalar() or 0

    return {
        "bot_id": bot_id,
        "total_sessions": total_sessions,
        "total_runtime_seconds": total_runtime_seconds,
        "total_trades": total_trades,
        "winning_trades": 0,
        "losing_trades": 0,
        "win_rate": Decimal("0"),
        "total_pnl": Decimal("0"),
        "best_trade": None,
        "worst_trade": None,
        "avg_trade": None,
    }


# ============================================================================
# BOT DEPLOYMENT & STATUS (Docker container management)
# ============================================================================


@router.post("/bots/{bot_id}/deploy")
async def deploy_bot(
    bot_id: str,
    session: AsyncSession = Depends(get_db),
    user: User | None = Depends(maybe_current_user),
) -> dict:
    """Deploy bot to Docker container"""
    import subprocess
    from pathlib import Path
    import shutil
    
    # Get bot
    stmt = select(Bot).where(Bot.bot_id == bot_id)
    if user and user.user_id:
        stmt = stmt.where(Bot.user_id == user.user_id)
    
    result = await session.execute(stmt)
    bot = result.scalar_one_or_none()
    if not bot:
        raise HTTPException(status_code=404, detail=f"Bot {bot_id} not found")
    
    # Check config
    config_path = Path(bot.config_path)
    if not config_path.exists():
        raise HTTPException(status_code=404, detail=f"Config file not found: {bot.config_path}")

    # docker CLI uses the host daemon (via docker.sock). Ensure the bind-mounted
    # source path is host-visible by copying config into the shared /freqtrade/user_data.
    docker_visible_dir = Path("/freqtrade/user_data") / "configs" / "bots" / bot_id
    docker_visible_dir.mkdir(parents=True, exist_ok=True)
    docker_config_path = docker_visible_dir / "config.json"
    try:
        shutil.copyfile(config_path, docker_config_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to prepare docker config: {str(e)}")

    # Choose image based on whether config enables FreqAI.
    docker_image = "freqtradeorg/freqtrade:stable"
    try:
        cfg_obj = json.loads(docker_config_path.read_text(encoding="utf-8"))
        freqai = cfg_obj.get("freqai") if isinstance(cfg_obj, dict) else None
        if isinstance(freqai, dict) and freqai.get("enabled") is True:
            docker_image = "freqtradeorg/freqtrade:stable_freqai"
    except Exception:
        pass
    
    container_name = f"freqtrade-bot-{bot_id.replace('_', '-')}"
    
    try:
        # Stop and remove existing container
        check_cmd = f"docker ps -a --filter name={container_name} --format '{{{{.Names}}}}'"
        result_check = subprocess.run(check_cmd, shell=True, capture_output=True, text=True)
        
        if result_check.stdout.strip():
            subprocess.run(f"docker stop {container_name}", shell=True, capture_output=True)
            subprocess.run(f"docker rm {container_name}", shell=True, capture_output=True)
        
        # Start new container
        user_data_host = Path(settings.freqtrade_user_data_host or settings.freqtrade_user_data)
        try:
            rel = docker_config_path.resolve().relative_to(Path(settings.freqtrade_user_data).resolve())
            docker_config_host = user_data_host / rel
        except Exception:
            docker_config_host = docker_config_path

        docker_cmd = [
            "docker", "run", "-d",
            "--name", container_name,
            "--network", "trade_system_default",
            "-v", f"{docker_config_host}:/freqtrade/config.json:ro",
            "-v", f"{user_data_host}:/freqtrade/user_data",
            docker_image,
            "trade",
            "--config", "/freqtrade/config.json",
            "--strategy-path", "/freqtrade/user_data/strategies",
        ]
        
        proc_result = subprocess.run(docker_cmd, capture_output=True, text=True, check=True)
        container_id = proc_result.stdout.strip()

        now = datetime.now(timezone.utc)

        # Close any previous running session (best-effort)
        prev_stmt = (
            select(BotSession)
            .where(and_(BotSession.bot_id == bot_id, BotSession.stopped_at.is_(None)))
            .order_by(desc(BotSession.started_at))
        )
        prev_res = await session.execute(prev_stmt)
        prev = prev_res.scalars().first()
        if prev:
            prev.stopped_at = now
            prev.status = "stopped"

        # Create new session
        new_session = BotSession(
            session_id=str(uuid.uuid4()),
            bot_id=bot_id,
            started_at=now,
            status="running",
            container_id=container_id[:12],
            container_name=container_name,
        )
        session.add(new_session)
        
        # Update bot status
        bot.status = "running"
        await session.commit()
        bot.updated_at = now
        
        return {
            "bot_id": bot_id,
            "container_name": container_name,
            "container_id": container_id[:12],
            "status": "running",
            "config_path": bot.config_path,
            "deployed_at": datetime.now(timezone.utc).isoformat(),
        }
        
    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Docker deployment failed: {e.stderr or e.stdout or str(e)}"
        )


@router.get("/bots/{bot_id}/container-status")
async def get_bot_container_status(
    bot_id: str,
    session: AsyncSession = Depends(get_db),
    user: User | None = Depends(maybe_current_user),
) -> dict:
    """Get Docker container status for bot"""
    import subprocess
    
    stmt = select(Bot).where(Bot.bot_id == bot_id)
    if user:
        stmt = stmt.where(Bot.user_id == user.user_id)
    
    result = await session.execute(stmt)
    bot = result.scalar_one_or_none()
    if not bot:
        raise HTTPException(status_code=404, detail=f"Bot {bot_id} not found")
    
    container_name = f"freqtrade-bot-{bot_id.replace('_', '-')}"
    
    try:
        status_cmd = f"docker inspect --format '{{{{.State.Status}}}}' {container_name}"
        proc_result = subprocess.run(status_cmd, shell=True, capture_output=True, text=True)
        
        if proc_result.returncode != 0:
            return {"bot_id": bot_id, "container_name": container_name, "status": "not_deployed"}
        
        status = proc_result.stdout.strip()

        started_at_raw = None
        uptime_seconds = None
        if status == "running":
            started_cmd = f"docker inspect --format '{{{{.State.StartedAt}}}}' {container_name}"
            started_res = subprocess.run(started_cmd, shell=True, capture_output=True, text=True)
            started_at_raw = started_res.stdout.strip() or None
            if started_at_raw:
                try:
                    # docker returns RFC3339Nano; python can parse with fromisoformat after Z handling
                    started_dt = datetime.fromisoformat(started_at_raw.replace("Z", "+00:00"))
                    uptime_seconds = int((datetime.now(timezone.utc) - started_dt).total_seconds())
                except Exception:
                    uptime_seconds = None
        
        # Get logs
        logs_cmd = f"docker logs --tail 50 {container_name}"
        logs_result = subprocess.run(logs_cmd, shell=True, capture_output=True, text=True)
        
        return {
            "bot_id": bot_id,
            "container_name": container_name,
            "status": status,
            "started_at": started_at_raw,
            "uptime_seconds": uptime_seconds,
            "logs": logs_result.stdout + logs_result.stderr,
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Status check error: {str(e)}")


@router.post("/bots/{bot_id}/stop")
async def stop_bot(
    bot_id: str,
    session: AsyncSession = Depends(get_db),
    user: User | None = Depends(maybe_current_user),
) -> dict:
    """Stop bot Docker container"""
    import subprocess
    
    stmt = select(Bot).where(Bot.bot_id == bot_id)
    if user and user.user_id:
        stmt = stmt.where(Bot.user_id == user.user_id)
    
    result = await session.execute(stmt)
    bot = result.scalar_one_or_none()
    if not bot:
        raise HTTPException(status_code=404, detail=f"Bot {bot_id} not found")
    
    container_name = f"freqtrade-bot-{bot_id.replace('_', '-')}"
    
    try:
        subprocess.run(f"docker stop {container_name}", shell=True, check=True, capture_output=True)

        now = datetime.now(timezone.utc)

        # Update latest running session (best-effort)
        sess_stmt = (
            select(BotSession)
            .where(and_(BotSession.bot_id == bot_id, BotSession.stopped_at.is_(None)))
            .order_by(desc(BotSession.started_at))
        )
        sess_res = await session.execute(sess_stmt)
        running_sess = sess_res.scalars().first()
        if running_sess:
            running_sess.stopped_at = now
            running_sess.status = "stopped"

        # Update status
        bot.status = "stopped"
        bot.updated_at = now
        await session.commit()
        
        return {"bot_id": bot_id, "status": "stopped"}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to stop container: {e.stderr}")


# =========================================================================
# FREQTRADE SYNC (Real trades into Postgres)
# =========================================================================


@router.post("/bots/{bot_id}/sync-freqtrade-trades")
async def sync_freqtrade_trades(
    bot_id: str,
    session: AsyncSession = Depends(get_db),
    user: User | None = Depends(maybe_current_user),
) -> dict:
    """Sync trades from a Freqtrade API into our Postgres `trades` table.

    Storage model:
    - We store the full Freqtrade payload into `Trade.meta`.
    - We use a deterministic PK: trade_id = "ft:{bot_id}:{ft_trade_id}" for idempotent upserts.
    """
    # Verify bot exists (and belongs to user if authenticated)
    stmt = select(Bot).where(Bot.bot_id == bot_id)
    if user and user.user_id:
        stmt = stmt.where(Bot.user_id == user.user_id)
    bot_res = await session.execute(stmt)
    bot = bot_res.scalar_one_or_none()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    # Allow per-bot overrides via bot.meta, fallback to global settings
    meta = bot.meta or {}
    base_url = str(meta.get("freqtrade_api_url") or settings.freqtrade_api_url)
    username = meta.get("freqtrade_api_username")
    password = meta.get("freqtrade_api_password")
    if username is None:
        username = settings.freqtrade_api_username
    if password is None:
        password = settings.freqtrade_api_password

    client = FreqtradeClient(base_url=base_url, username=username, password=password)

    try:
        ft_trades = await client.fetch_trades()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Freqtrade sync failed: {e}")

    # Load recent sessions once to be able to attach trades to a session window.
    # We keep this heuristic simple and robust:
    # - if ft.open_date is available: match started_at <= open_date <= stopped_at (or now if running)
    # - else (no open_date): attach only open trades to current running session (if any)
    sessions_stmt = (
        select(BotSession)
        .where(BotSession.bot_id == bot_id)
        .order_by(desc(BotSession.started_at))
        .limit(200)
    )
    sessions_res = await session.execute(sessions_stmt)
    sessions = sessions_res.scalars().all()

    now = datetime.now(timezone.utc)

    def pick_session_id(opened_at: datetime | None, is_open: bool) -> str | None:
        if opened_at is not None:
            for s in sessions:
                end = s.stopped_at or now
                if s.started_at <= opened_at <= end:
                    return s.session_id

        if is_open:
            for s in sessions:
                if s.stopped_at is None and s.status == "running":
                    return s.session_id

        return None

    upserted = 0
    for ft in ft_trades:
        pk = f"ft:{bot_id}:{ft.ft_trade_id}"
        existing = await session.get(Trade, pk)

        status = "open" if ft.is_open else "closed"
        opened_at = ft.open_date or now
        sess_id = pick_session_id(ft.open_date, ft.is_open)

        # Map freqtrade trade into our Trade row (with full raw payload in meta)
        if existing:
            existing.status = status
            existing.pair = ft.pair
            existing.exchange = ft.exchange
            existing.amount = ft.amount
            existing.price = ft.open_rate
            existing.cost = ft.open_trade_value or (ft.amount * ft.open_rate)
            existing.closed_at = ft.close_date
            existing.meta = ft.raw
            if sess_id is not None:
                existing.session_id = sess_id
            existing.updated_at = now
        else:
            row = Trade(
                trade_id=pk,
                bot_id=bot_id,
                session_id=sess_id,
                source_type=bot.mode or "dry_run",
                exchange=ft.exchange,
                pair=ft.pair,
                side="buy",
                order_type="limit",
                amount=ft.amount,
                price=ft.open_rate,
                cost=ft.open_trade_value or (ft.amount * ft.open_rate),
                fee_cost=None,
                fee_currency=None,
                exchange_order_id=None,
                exchange_trade_id=ft.ft_trade_id,
                status=status,
                decision_log=None,
                opened_at=opened_at,
                closed_at=ft.close_date,
                meta=ft.raw,
            )
            session.add(row)
        upserted += 1

    await session.commit()
    return {"bot_id": bot_id, "synced": upserted}


# ============================================================================
# NEURO PROVIDER BINDING (moved from /bots)
# ============================================================================


@router.post("/bots/{bot_id}/attach-provider")
async def attach_provider(
    bot_id: str,
    provider_id: str | None = None,
    overrides: dict = None,
    enabled: bool = True,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Attach a NeuroProvider to a bot"""
    from app.models.neuro import NeuroProvider, ProviderBinding
    
    # Verify bot
    stmt = select(Bot).where(Bot.bot_id == bot_id)
    if user:
        stmt = stmt.where(Bot.user_id == user.user_id)
    
    result = await session.execute(stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Bot not found")
    
    # Verify provider
    if provider_id:
        provider = await session.get(NeuroProvider, provider_id)
        if not provider:
            raise HTTPException(status_code=404, detail="Provider not found")
    
    # Upsert binding
    binding = await session.scalar(select(ProviderBinding).where(ProviderBinding.bot_id == bot_id))
    now = datetime.now(timezone.utc)
    
    if binding:
        binding.provider_id = provider_id
        binding.overrides = overrides or {}
        binding.enabled = enabled
        binding.updated_at = now
    else:
        binding = ProviderBinding(
            binding_id=f"{bot_id}:default",
            bot_id=bot_id,
            provider_id=provider_id,
            overrides=overrides or {},
            enabled=enabled,
            updated_at=now,
        )
        session.add(binding)
    
    await session.commit()
    await session.refresh(binding)
    
    return {
        "binding_id": binding.binding_id,
        "bot_id": binding.bot_id,
        "provider_id": binding.provider_id,
        "overrides": binding.overrides,
        "enabled": binding.enabled,
        "updated_at": binding.updated_at.isoformat(),
    }


@router.get("/bots/{bot_id}/provider")
async def get_bot_provider(
    bot_id: str,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Get the NeuroProvider attached to a bot"""
    from app.models.neuro import ProviderBinding
    
    # Verify bot
    stmt = select(Bot).where(Bot.bot_id == bot_id)
    if user:
        stmt = stmt.where(Bot.user_id == user.user_id)
    
    result = await session.execute(stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Bot not found")
    
    binding = await session.scalar(select(ProviderBinding).where(ProviderBinding.bot_id == bot_id))
    
    if not binding:
        return {"bot_id": bot_id, "provider_id": None}
    
    return {
        "binding_id": binding.binding_id,
        "bot_id": binding.bot_id,
        "provider_id": binding.provider_id,
        "overrides": binding.overrides,
        "enabled": binding.enabled,
        "updated_at": binding.updated_at.isoformat(),
    }
