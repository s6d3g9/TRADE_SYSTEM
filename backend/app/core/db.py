from collections.abc import AsyncIterator
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from app.core.config import settings

class DatabaseManager:
    """
    Менеджер подключений к базе данных (Core Layer).
    Инкапсулирует логику создания движка и сессий.
    """
    def __init__(self):
        self._engine: AsyncEngine | None = None
        self._sessionmaker: async_sessionmaker[AsyncSession] | None = None

    def get_engine(self) -> AsyncEngine:
        if self._engine is None:
            # pool_pre_ping=True защищает от "отвалившихся" соединений
            # pool_size и max_overflow настраивают пул для высоконагруженных систем
            self._engine = create_async_engine(
                settings.database_url, 
                pool_pre_ping=True,
                pool_size=10,
                max_overflow=20,
                echo=False # Поставьте True для дебага SQL-запросов
            )
        return self._engine

    def get_sessionmaker(self) -> async_sessionmaker[AsyncSession]:
        if self._sessionmaker is None:
            self._sessionmaker = async_sessionmaker(
                bind=self.get_engine(), 
                expire_on_commit=False,
                autoflush=False
            )
        return self._sessionmaker

    async def close(self):
        """Закрывает все соединения (вызывать при остановке приложения)."""
        if self._engine is not None:
            await self._engine.dispose()

# Глобальный инстанс менеджера БД
db_manager = DatabaseManager()

async def get_db() -> AsyncIterator[AsyncSession]:
    """
    Dependency Injection для FastAPI роутеров.
    Выдает новую сессию на каждый HTTP-запрос и автоматически закрывает ее.
    """
    sessionmaker = db_manager.get_sessionmaker()
    async with sessionmaker() as session:
        try:
            yield session
        finally:
            await session.close()
