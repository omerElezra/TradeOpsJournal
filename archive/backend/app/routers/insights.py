"""AI insights endpoint (mock today, LLM later)."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Query

from app.core.ranges import resolve_range
from app.domain.models import Insight
from app.services import ai_coach, trades_service

router = APIRouter(prefix="/api/v1/insights", tags=["insights"])


@router.get("", response_model=List[Insight])
def get_insights(range: Optional[str] = Query("90d")) -> List[Insight]:
    start, end = resolve_range(range)
    groups, _ = trades_service.load_groups(start, end)
    return ai_coach.generate_insights(groups)
