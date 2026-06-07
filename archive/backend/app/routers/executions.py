"""Raw executions endpoint — exposes the trades table as individual fills."""
from __future__ import annotations

import base64
from typing import Optional

from fastapi import APIRouter, Query

from app.core.ranges import resolve_range
from app.db import queries
from app.domain.models import CashTransactionRow, Paginated, RawExecutionRow

router = APIRouter(prefix="/api/v1/executions", tags=["executions"])


@router.get("", response_model=Paginated[RawExecutionRow])
def list_executions(
    range: Optional[str] = Query("90d"),
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    cursor: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    sort: str = Query("execTime"),
    dir: str = Query("desc"),
    symbol: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
) -> Paginated[RawExecutionRow]:
    start, end = resolve_range(range, from_, to)
    offset = _decode(cursor)

    rows, total = queries.fetch_executions_page(
        start=start,
        end=end,
        offset=offset,
        limit=limit,
        sort=sort,
        dir=dir,
        symbol=symbol,
        action=action,
    )

    items = [_to_dto(r) for r in rows]
    next_offset = offset + limit
    next_cursor = _encode(next_offset) if next_offset < total else None
    return Paginated[RawExecutionRow](data=items, next_cursor=next_cursor, total=total)


def _to_dto(r: dict) -> RawExecutionRow:
    from app.db.queries import _parse, _f
    return RawExecutionRow(
        trade_id=str(r["trade_id"]),
        exec_time=_parse(r["exec_time"]),
        symbol=r["symbol"],
        action=r["action"],
        quantity=float(r["quantity"]),
        price=float(r["price"]),
        proceeds=_f(r.get("proceeds")),
        commission=_f(r.get("commission")),
        realized_pnl=_f(r.get("realized_pnl")),
        currency=r.get("currency") or "USD",
    )


def _encode(offset: int) -> str:
    return base64.urlsafe_b64encode(str(offset).encode()).decode()


def _decode(cursor: Optional[str]) -> int:
    if not cursor:
        return 0
    try:
        return int(base64.urlsafe_b64decode(cursor.encode()).decode())
    except Exception:
        return 0
