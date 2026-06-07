"""Metric endpoints."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Query

from app.core.ranges import resolve_range
from app.domain.models import EquityPoint, MetricsSummary
from app.services import trades_service

router = APIRouter(prefix="/api/v1/metrics", tags=["metrics"])


@router.get("/summary", response_model=MetricsSummary)
def get_summary(
    range: Optional[str] = Query("30d"),
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
) -> MetricsSummary:
    start, end = resolve_range(range, from_, to)
    groups, _ = trades_service.load_groups(start, end)

    # Previous comparable window for deltas.
    span = end - start
    prev_groups, _ = trades_service.load_groups(start - span, start)
    return trades_service.summary_from_groups(start, end, groups, prev_groups)


@router.get("/equity-curve", response_model=List[EquityPoint])
def get_equity_curve(
    range: Optional[str] = Query("30d"),
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
) -> List[EquityPoint]:
    start, end = resolve_range(range, from_, to)
    return trades_service.build_equity_curve(start, end)
