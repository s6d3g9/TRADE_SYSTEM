from fastapi import APIRouter

from app.api.bots import router as bots_router
from app.api.health import router as health_router
from app.api.market import router as market_router
from app.api.neuro import router as neuro_router
from app.api.signals import router as signals_router
from app.api.strategylab import router as strategylab_router
from app.api.tasks import router as tasks_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(bots_router)
api_router.include_router(market_router)
api_router.include_router(neuro_router)
api_router.include_router(signals_router)
api_router.include_router(strategylab_router)
api_router.include_router(tasks_router)
