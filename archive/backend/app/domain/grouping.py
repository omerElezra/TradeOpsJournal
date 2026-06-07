"""Pure trade-grouping logic: raw executions -> round-trip TradeGroups.

No DB, no FastAPI imports — keep this module pure so it is trivially unit-testable
and reusable by the future AI coaching layer.

A "trade group" is a round-trip: a position that opens from flat and closes back to
flat. The grouping key (symbol, entry_time of the first execution) matches the
`trade_journal` UNIQUE(symbol, entry_time) constraint so journal rows line up 1:1.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional

EPS = 1e-9


@dataclass
class RawExecution:
    trade_id: str
    exec_time: datetime
    symbol: str
    action: str  # "BUY" | "SELL"
    quantity: float
    price: float
    proceeds: Optional[float] = None
    commission: Optional[float] = None
    realized_pnl: Optional[float] = None
    currency: str = "USD"


@dataclass
class GroupedTrade:
    id: str
    symbol: str
    side: str  # "LONG" | "SHORT"
    status: str  # "OPEN" | "CLOSED"
    result: str  # "WIN" | "LOSS" | "BREAKEVEN"
    entry_time: datetime
    exit_time: Optional[datetime]
    qty: float
    avg_entry: float
    avg_exit: Optional[float]
    net_pnl: float
    realized_pnl: float
    commission: float
    return_pct: float
    holding_minutes: Optional[int]
    currency: str
    executions: List[RawExecution] = field(default_factory=list)


def stable_group_id(symbol: str, entry_time: datetime) -> str:
    digest = hashlib.sha1(f"{symbol}|{entry_time.isoformat()}".encode()).hexdigest()
    return digest[:16]


def group_executions(executions: List[RawExecution]) -> List[GroupedTrade]:
    """Group executions into round-trip trades, FIFO by symbol and time."""
    by_symbol: dict[str, List[RawExecution]] = {}
    for ex in executions:
        by_symbol.setdefault(ex.symbol, []).append(ex)

    groups: List[GroupedTrade] = []
    for symbol, execs in by_symbol.items():
        execs_sorted = sorted(execs, key=lambda e: e.exec_time)
        groups.extend(_group_symbol(symbol, execs_sorted))

    groups.sort(key=lambda g: g.entry_time, reverse=True)
    return groups


def _signed(ex: RawExecution) -> float:
    return ex.quantity if ex.action.upper() == "BUY" else -ex.quantity


def _group_symbol(symbol: str, execs: List[RawExecution]) -> List[GroupedTrade]:
    groups: List[GroupedTrade] = []
    position = 0.0
    bucket: List[RawExecution] = []

    for ex in execs:
        if abs(position) < EPS:
            bucket = []  # opening a fresh position
        bucket.append(ex)
        position += _signed(ex)

        if abs(position) < EPS and bucket:
            groups.append(_build_group(symbol, bucket, closed=True))
            bucket = []

    if bucket:  # leftover open position
        groups.append(_build_group(symbol, bucket, closed=False))

    return groups


def _build_group(symbol: str, execs: List[RawExecution], closed: bool) -> GroupedTrade:
    first = execs[0]
    side = "LONG" if first.action.upper() == "BUY" else "SHORT"
    open_action = first.action.upper()

    entry_execs = [e for e in execs if e.action.upper() == open_action]
    exit_execs = [e for e in execs if e.action.upper() != open_action]

    entry_qty = sum(e.quantity for e in entry_execs)
    exit_qty = sum(e.quantity for e in exit_execs)

    avg_entry = _vwap(entry_execs)
    avg_exit = _vwap(exit_execs) if exit_execs else None

    matched_qty = min(entry_qty, exit_qty) if exit_execs else 0.0
    commission = sum(e.commission or 0.0 for e in execs)
    realized = sum(e.realized_pnl or 0.0 for e in execs)
    has_realized = any(e.realized_pnl is not None for e in execs)

    if closed and avg_exit is not None:
        price_pnl = (
            (avg_exit - avg_entry) * matched_qty
            if side == "LONG"
            else (avg_entry - avg_exit) * matched_qty
        )
    else:
        price_pnl = 0.0

    net_pnl = (realized if has_realized else price_pnl) + commission

    if not closed or abs(net_pnl) < EPS:
        result = "BREAKEVEN"
    elif net_pnl > 0:
        result = "WIN"
    else:
        result = "LOSS"

    cost_basis = avg_entry * entry_qty
    return_pct = (net_pnl / cost_basis * 100.0) if cost_basis > EPS else 0.0

    exit_time = execs[-1].exec_time if closed else None
    holding_minutes = (
        int((exit_time - first.exec_time).total_seconds() // 60)
        if exit_time is not None
        else None
    )

    return GroupedTrade(
        id=stable_group_id(symbol, first.exec_time),
        symbol=symbol,
        side=side,
        status="CLOSED" if closed else "OPEN",
        result=result,
        entry_time=first.exec_time,
        exit_time=exit_time,
        qty=entry_qty,
        avg_entry=round(avg_entry, 6),
        avg_exit=round(avg_exit, 6) if avg_exit is not None else None,
        net_pnl=round(net_pnl, 2),
        realized_pnl=round(realized, 2),
        commission=round(commission, 2),
        return_pct=round(return_pct, 4),
        holding_minutes=holding_minutes,
        currency=first.currency,
        executions=execs,
    )


def _vwap(execs: List[RawExecution]) -> float:
    total_qty = sum(e.quantity for e in execs)
    if total_qty < EPS:
        return 0.0
    return sum(e.price * e.quantity for e in execs) / total_qty
