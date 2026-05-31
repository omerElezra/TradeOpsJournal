"""Trade history endpoints (grouped round-trips, paginated)."""
from __future__ import annotations

import base64
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

from app.core.ranges import resolve_range
from app.domain.models import Paginated, TradeGroup, TradeGroupDetail
from app.services import trades_service

router = APIRouter(prefix="/api/v1/trades", tags=["trades"])

_SORT_KEYS = {
    "entryTime": lambda t: t.entry_time,
    "exitTime": lambda t: (t.exit_time or t.entry_time),
    "netPnl": lambda t: t.net_pnl,
    "returnPct": lambda t: t.return_pct,
    "symbol": lambda t: t.symbol,
    "side": lambda t: t.side,
    "result": lambda t: t.result,
    "qty": lambda t: t.qty,
    "avgEntry": lambda t: t.avg_entry,
    "rMultiple": lambda t: (t.r_multiple if t.r_multiple is not None else float("-inf")),
    "holdingMinutes": lambda t: (t.holding_minutes if t.holding_minutes is not None else -1),
}


@router.get("", response_model=Paginated[TradeGroup])
def list_trades(
    range: Optional[str] = Query("90d"),
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    cursor: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=200),
    sort: str = Query("entryTime"),
    dir: str = Query("desc"),
    symbol: Optional[str] = Query(None),
    side: Optional[str] = Query(None),
    result: Optional[str] = Query(None),
) -> Paginated[TradeGroup]:
    start, end = resolve_range(range, from_, to)
    groups, journal = trades_service.load_groups(start, end)
    items = [trades_service.to_trade_group(g, journal) for g in groups]

    if symbol:
        items = [t for t in items if t.symbol.upper() == symbol.upper()]
    if side:
        items = [t for t in items if t.side == side.upper()]
    if result:
        items = [t for t in items if t.result == result.upper()]

    key = _SORT_KEYS.get(sort, _SORT_KEYS["entryTime"])
    items.sort(key=key, reverse=(dir.lower() == "desc"))

    offset = _decode_cursor(cursor)
    page = items[offset : offset + limit]
    next_offset = offset + limit
    next_cursor = _encode_cursor(next_offset) if next_offset < len(items) else None

    return Paginated[TradeGroup](data=page, next_cursor=next_cursor, total=len(items))


@router.get("/{trade_id}", response_model=TradeGroupDetail)
def get_trade(
    trade_id: str,
    range: Optional[str] = Query("all"),
) -> TradeGroupDetail:
    start, end = resolve_range(range)
    groups, journal = trades_service.load_groups(start, end)
    for g in groups:
        if g.id == trade_id:
            return trades_service.to_detail(g, journal)
    raise HTTPException(status_code=404, detail="Trade group not found")


def _encode_cursor(offset: int) -> str:
    return base64.urlsafe_b64encode(str(offset).encode()).decode()


def _decode_cursor(cursor: Optional[str]) -> int:
    if not cursor:
        return 0
    try:
        return int(base64.urlsafe_b64decode(cursor.encode()).decode())
    except Exception:
        return 0
