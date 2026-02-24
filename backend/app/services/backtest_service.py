from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.exceptions import BadRequestError, NotFoundError
from app.models.trading import Backtest
from app.schemas.trading import BacktestCreate
from app.core.config import settings
from app.services.trading_backtest import run_backtest_for_bot

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

    @staticmethod
    def _to_timerange(backtest: Backtest) -> str:
        start = backtest.backtest_start.astimezone(timezone.utc).strftime("%Y%m%d")
        end = backtest.backtest_end.astimezone(timezone.utc).strftime("%Y%m%d")
        return f"{start}-{end}"

    @staticmethod
    def _to_decimal(value: Any) -> Decimal | None:
        if value is None:
            return None
        if isinstance(value, Decimal):
            return value
        if isinstance(value, (int, float)):
            return Decimal(str(value))
        if isinstance(value, str):
            s = value.strip()
            if not s:
                return None
            try:
                return Decimal(s)
            except Exception:
                return None
        return None
        
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

        if not backtest.bot_id:
            raise BadRequestError("Backtest bot_id is required for execution")

        backtest.status = "running"
        backtest.error_message = None
        await self.db.commit()

        try:
            result = await run_backtest_for_bot(
                bot_id=backtest.bot_id,
                timerange=self._to_timerange(backtest),
                options={
                    "timeframe": backtest.timeframe,
                    "pairs": [backtest.pair] if backtest.pair else None,
                },
                session=self.db,
            )

            parsed = result.get("backtest") if isinstance(result, dict) else None
            parsed = parsed if isinstance(parsed, dict) else {}

            backtest.status = "completed"
            backtest.completed_at = datetime.now(timezone.utc)
            backtest.strategy_name = str(parsed.get("strategy_name") or backtest.strategy_name)
            backtest.total_trades = int(parsed.get("total_trades") or backtest.total_trades or 0)
            wins = int(parsed.get("wins") or backtest.winning_trades or 0)
            losses = int(parsed.get("losses") or backtest.losing_trades or 0)
            backtest.winning_trades = wins
            backtest.losing_trades = losses
            backtest.win_rate = self._to_decimal(parsed.get("win_rate")) or backtest.win_rate
            backtest.total_return_percent = self._to_decimal(parsed.get("total_return")) or backtest.total_return_percent
            backtest.avg_trade_return = self._to_decimal(parsed.get("avg_trade")) or backtest.avg_trade_return
            backtest.max_drawdown_percent = self._to_decimal(parsed.get("max_drawdown")) or backtest.max_drawdown_percent
            backtest.sharpe_ratio = self._to_decimal(parsed.get("sharpe_ratio")) or backtest.sharpe_ratio
            backtest.profit_factor = self._to_decimal(parsed.get("profit_factor")) or backtest.profit_factor

            merged_metrics = dict(backtest.metrics or {})
            if isinstance(parsed, dict) and parsed:
                merged_metrics.update(parsed)
            if isinstance(result, dict) and result.get("status") is not None:
                merged_metrics["runner_status"] = result.get("status")
            if isinstance(result, dict) and result.get("timerange") is not None:
                merged_metrics["runner_timerange"] = result.get("timerange")
            backtest.metrics = merged_metrics

            await self.db.commit()
        except Exception as exc:
            backtest.status = "failed"
            backtest.completed_at = datetime.now(timezone.utc)
            backtest.error_message = str(exc)
            await self.db.commit()
            raise

        await self.db.refresh(backtest)
        return backtest
