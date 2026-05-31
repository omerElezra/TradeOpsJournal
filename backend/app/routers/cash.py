"""Cash transactions endpoint — exposes the cash_transactions table."""
from __future__ import annotations

import base64
from typing import Optional

from fastapi import APIRouter, Query

from app.core.ranges import resolve_range
from app.db import queries
from app.domain.models import CashTransactionRow, Paginated

router = APIRouter(prefix="/api/v1/cash", tags=["cash"])


@router.get("", response_model=Paginated[CashTransactionRow])
def list_cash(
    range: Optional[str] = Query("90d"),
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    cursor: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    sort: str = Query("execTime"),
    dir: str = Query("desc"),
    symbol: Optional[str] = Query(None),
) -> Paginated[CashTransactionRow]:
    start, end = resolve_range(range, from_, to)
    offset = _decode(cursor)

    rows, total = queries.fetch_cash_page(
        start=start,
        end=end,
        offset=offset,
        limit=limit,
        sort=sort,
        dir=dir,
        symbol=symbol,
    )

    items = [_to_dto(r) for r in rows]
    next_offset = offset + limit
    next_cursor = _encode(next_offset) if next_offset < total else None
    return Paginated[CashTransactionRow](data=items, next_cursor=next_cursor, total=total)


def _to_dto(r: dict) -> CashTransactionRow:
    from app.db.queries import _parse, _f
    return CashTransactionRow(
        transaction_id=str(r["transaction_id"]),
        exec_time=_parse(r["exec_time"]),
        symbol=r["symbol"],
        description=r.get("description"),
        action=r.get("action"),
        currency=r.get("currency"),
        quantity=float(r["quantity"]),
        rate=_f(r.get("rate")),
        net_cash=_f(r.get("net_cash")),
        commission=_f(r.get("commission")),
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
