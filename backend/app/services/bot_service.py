import json
import subprocess
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.exceptions import ExternalServiceError, NotFoundError, NotImplementedAppError
from app.models.strategylab import StrategyAlignment, StrategyTemplate
from app.models.trading import Bot, BotSession
from app.schemas.trading import BotCreate
from app.core.config import settings


class BotService:
    """
    Сервис для управления торговыми ботами.
    Реализует паттерн "Умная обертка" вокруг Freqtrade.
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
    def _merge_dicts(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
        out: dict[str, Any] = dict(base)
        for key, value in override.items():
            if key in out and isinstance(out[key], dict) and isinstance(value, dict):
                out[key] = BotService._merge_dicts(out[key], value)
            else:
                out[key] = value
        return out
        
    async def create_bot(self, bot_in: BotCreate) -> Bot:
        """Создает запись о боте в БД"""
        bot = Bot(**bot_in.model_dump())
        self.db.add(bot)
        await self.db.commit()
        await self.db.refresh(bot)
        return bot
        
    async def get_bot(self, bot_id: str) -> Bot | None:
        """Получает бота по ID"""
        result = await self.db.execute(select(Bot).where(Bot.bot_id == bot_id))
        return result.scalar_one_or_none()
        
    async def generate_freqtrade_config(self, bot: Bot) -> Path:
        """
        Генерирует config.json для Freqtrade на основе данных из БД.
        Это ключевой метод "Умной обертки".
        """
        # Базовый конфиг
        config = {
            "max_open_trades": 3,
            "stake_currency": "USDT",
            "stake_amount": "unlimited",
            "tradable_balance_ratio": 0.99,
            "fiat_display_currency": "USD",
            "dry_run": bot.mode == "dry_run",
            "exchange": {
                "name": bot.exchange,
                "key": "", # Будет подставляться из секретов
                "secret": "",
                "ccxt_config": {},
                "ccxt_async_config": {}
            },
            "pairlists": [
                {
                    "method": "StaticPairList",
                    "pairlist": ["BTC/USDT", "ETH/USDT"]
                }
            ],
            "bot_name": bot.name,
            "initial_state": "running",
            "force_entry_enable": True,
            "internals": {
                "process_throttle_secs": 5
            },
            "strategy": "SampleStrategy",
        }
        
        # Если есть сонастройка (StrategyAlignment), применяем ее
        if bot.alignment_id:
            alignment = await self.db.get(StrategyAlignment, bot.alignment_id)
            if not alignment:
                raise NotFoundError("StrategyAlignment not found")

            strategy = await self.db.get(StrategyTemplate, alignment.strategy_id)
            if not strategy:
                raise NotFoundError("StrategyTemplate not found for alignment")

            strategy_name = (strategy.strategy_class or strategy.slug or strategy.name).strip()
            if not strategy_name:
                raise NotImplementedAppError("StrategyAlignment has no resolvable strategy class")

            config["strategy"] = strategy_name

            overrides = alignment.freqtrade_overrides if isinstance(alignment.freqtrade_overrides, dict) else {}
            if overrides:
                config = self._merge_dicts(config, overrides)

            # Keep resolved strategy as source of truth for launcher.
            config["strategy"] = strategy_name
            
        # Сохраняем во временный файл
        config_dir = self.user_data_host_dir / "configs" / "generated"
        config_dir.mkdir(parents=True, exist_ok=True)
        
        config_path = config_dir / f"config_{bot.bot_id}.json"
        with open(config_path, "w") as f:
            json.dump(config, f, indent=4)
            
        return config_path
        
    async def start_bot(self, bot_id: str) -> BotSession:
        """
        Запускает Docker-контейнер с Freqtrade.
        """
        bot = await self.get_bot(bot_id)
        if not bot:
            raise NotFoundError("Bot not found")
            
        # 1. Генерируем конфиг
        config_path = await self.generate_freqtrade_config(bot)

        strategy_name = "SampleStrategy"
        try:
            with open(config_path, "r", encoding="utf-8") as fh:
                cfg = json.load(fh)
            if isinstance(cfg, dict):
                val = cfg.get("strategy")
                if isinstance(val, str) and val.strip():
                    strategy_name = val.strip()
        except Exception:
            strategy_name = "SampleStrategy"
        
        # 2. Создаем сессию в БД
        session = BotSession(bot_id=bot.bot_id, status="starting")
        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)
        
        # 3. Формируем команду запуска Docker
        container_name = f"freqtrade_bot_{bot.bot_id}_{session.session_id}"
        
        # В реальной системе здесь будет вызов Docker API (aiodocker)
        # Для примера используем subprocess (в фоне)
        cmd = [
            "docker", "run", "-d",
            "--name", container_name,
            "-v", f"{self.user_data_host_dir}:{self.user_data_container_dir}",
            "freqtradeorg/freqtrade:stable",
            "trade",
            "--config",
            str(self.user_data_container_dir / "configs" / "generated" / config_path.name),
            "--strategy", strategy_name,
        ]
        
        try:
            # Запускаем контейнер
            process = subprocess.run(cmd, capture_output=True, text=True, check=True)
            container_id = process.stdout.strip()
            
            # Обновляем сессию
            session.container_id = container_id
            session.container_name = container_name
            session.status = "running"
            bot.status = "running"
            
            await self.db.commit()
            
        except subprocess.CalledProcessError as e:
            session.status = "failed"
            session.error_message = e.stderr
            bot.status = "failed"
            await self.db.commit()
            raise ExternalServiceError(
                "Failed to start bot container",
                details={"stderr": e.stderr, "stdout": e.stdout},
                status_code=502,
                code="freqtrade_start_failed",
            )
            
        return session
        
    async def stop_bot(self, bot_id: str) -> None:
        """Останавливает Docker-контейнер бота"""
        bot = await self.get_bot(bot_id)
        if not bot:
            raise NotFoundError("Bot not found")
            
        # Ищем активную сессию
        result = await self.db.execute(
            select(BotSession)
            .where(BotSession.bot_id == bot_id, BotSession.status == "running")
        )
        session = result.scalar_one_or_none()
        
        if not session or not session.container_name:
            bot.status = "stopped"
            await self.db.commit()
            return
            
        # Останавливаем контейнер
        try:
            subprocess.run(["docker", "stop", session.container_name], check=True)
            subprocess.run(["docker", "rm", session.container_name], check=True)
        except subprocess.CalledProcessError:
            pass # Игнорируем ошибки, если контейнер уже удален
            
        session.status = "stopped"
        bot.status = "stopped"
        await self.db.commit()
