from fastapi import APIRouter

from app.api.ai import router as ai_router
from app.api.alignment import router as alignment_router
from app.api.analysis import router as analysis_router
from app.api.auth import router as auth_router
from app.api.graphs import router as graphs_router
from app.api.health import router as health_router
from app.api.market import router as market_router
from app.api.neuro import router as neuro_router
from app.api.signals import router as signals_router
from app.api.store import router as store_router
from app.api.strategylab import router as strategylab_router
from app.api.tasks import router as tasks_router
from app.api.trading import router as trading_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(ai_router)
api_router.include_router(alignment_router)
api_router.include_router(analysis_router)
api_router.include_router(graphs_router)
api_router.include_router(market_router)
api_router.include_router(neuro_router)
api_router.include_router(signals_router)
api_router.include_router(store_router)
api_router.include_router(strategylab_router)
api_router.include_router(tasks_router)
api_router.include_router(trading_router)

