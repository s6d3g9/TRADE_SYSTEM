import json
import subprocess
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

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
            }
        }
        
        # Если есть сонастройка (StrategyAlignment), применяем ее
        if bot.alignment_id:
            raise NotImplementedError("StrategyAlignment overrides are not implemented yet")
            
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
            raise ValueError(f"Bot {bot_id} not found")
            
        # 1. Генерируем конфиг
        config_path = await self.generate_freqtrade_config(bot)
        
        # 2. Создаем сессию в БД
        session = BotSession(
            bot_id=bot.bot_id,
            status="starting"
        )
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
            "--strategy", "SampleStrategy" # TODO: брать из StrategyAlignment
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
            raise RuntimeError(f"Failed to start bot container: {e.stderr}")
            
        return session
        
    async def stop_bot(self, bot_id: str) -> None:
        """Останавливает Docker-контейнер бота"""
        bot = await self.get_bot(bot_id)
        if not bot:
            raise ValueError(f"Bot {bot_id} not found")
            
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
