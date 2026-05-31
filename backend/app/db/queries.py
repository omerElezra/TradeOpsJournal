"""Read queries against Supabase tables (trades, trade_journal)."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from app.db.supabase_client import get_supabase
from app.domain.grouping import RawExecution


def fetch_executions(start: datetime, end: datetime) -> List[RawExecution]:
    """Fetch stock executions in [start, end] ordered by exec_time."""
    client = get_supabase()
    if client is None:
        return []

    rows: List[dict] = []
    page_size = 1000
    offset = 0
    while True:
        resp = (
            client.table("trades")
            .select(
                "trade_id, exec_time, symbol, action, quantity, price, "
                "proceeds, commission, realized_pnl, currency"
            )
            .gte("exec_time", start.isoformat())
            .lte("exec_time", end.isoformat())
            .order("exec_time")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = resp.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    return [_to_raw(r) for r in rows]


def fetch_journal_map(start: datetime, end: datetime) -> dict[tuple[str, str], dict]:
    """Return {(symbol, entry_time_iso): journal_row} for journal entries in range."""
    client = get_supabase()
    if client is None:
        return {}

    resp = (
        client.table("trade_journal")
        .select("*")
        .gte("entry_time", start.isoformat())
        .lte("entry_time", end.isoformat())
        .execute()
    )
    out: dict[tuple[str, str], dict] = {}
    for row in resp.data or []:
        key = (row["symbol"], _norm_iso(row["entry_time"]))
        out[key] = row
    return out


def upsert_journal(payload: dict) -> Optional[dict]:
    client = get_supabase()
    if client is None:
        return None
    resp = (
        client.table("trade_journal")
        .upsert(payload, on_conflict="symbol,entry_time")
        .execute()
    )
    return (resp.data or [None])[0]


def _to_raw(r: dict) -> RawExecution:
    return RawExecution(
        trade_id=str(r.get("trade_id")),
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


def _f(v) -> Optional[float]:
    return None if v is None else float(v)


def _parse(v: str) -> datetime:
    return datetime.fromisoformat(str(v).replace("Z", "+00:00"))


def _norm_iso(v: str) -> str:
    return _parse(v).isoformat()
