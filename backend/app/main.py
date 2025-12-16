from fastapi import FastAPI

from app.api.router import api_router

app = FastAPI(title="TRADE_SYSTEM Backend")
app.include_router(api_router)
