"""FastAPI application entrypoint."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.routers import insights, journal, metrics, trades

settings = get_settings()

app = FastAPI(title="TradeOpsJournal API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(metrics.router)
app.include_router(trades.router)
app.include_router(journal.router)
app.include_router(insights.router)


@app.get("/health", tags=["health"])
def health() -> dict:
    return {"status": "ok", "db": bool(settings.supabase_url and settings.supabase_service_key)}
