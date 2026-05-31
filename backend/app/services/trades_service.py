"""Service layer: orchestrates DB reads + pure domain logic into API DTOs."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from app.db import queries
from app.domain import metrics
from app.domain.grouping import GroupedTrade, group_executions
from app.domain.models import (
    EquityPoint,
    Execution,
    JournalEntry,
    MetricDeltas,
    MetricsSummary,
    RangeWindow,
    TradeGroup,
    TradeGroupDetail,
    TradeMarker,
)


def _journal_key(g: GroupedTrade) -> tuple[str, str]:
    return (g.symbol, g.entry_time.isoformat())


def load_groups(start: datetime, end: datetime) -> tuple[List[GroupedTrade], dict]:
    execs = queries.fetch_executions(start, end)
    groups = group_executions(execs)
    journal = queries.fetch_journal_map(start, end)
    return groups, journal


def build_summary(
    start: datetime,
    end: datetime,
    prev: Optional[List[GroupedTrade]] = None,
) -> MetricsSummary:
    groups, _ = load_groups(start, end)
    return summary_from_groups(start, end, groups, prev)


def summary_from_groups(
    start: datetime,
    end: datetime,
    groups: List[GroupedTrade],
    prev: Optional[List[GroupedTrade]] = None,
) -> MetricsSummary:
    deltas = MetricDeltas()
    if prev is not None:
        deltas = MetricDeltas(
            win_rate=round(metrics.win_rate(groups) - metrics.win_rate(prev), 4),
            profit_factor=round(
                metrics.profit_factor(groups) - metrics.profit_factor(prev), 4
            ),
            net_roi=round(metrics.net_roi(groups) - metrics.net_roi(prev), 4),
            total_trades=metrics.total_trades(groups) - metrics.total_trades(prev),
        )

    currency = groups[0].currency if groups else "USD"
    return MetricsSummary(
        range=RangeWindow.model_validate({"from": start, "to": end}),
        total_trades=metrics.total_trades(groups),
        win_rate=metrics.win_rate(groups),
        profit_factor=metrics.profit_factor(groups),
        net_roi=metrics.net_roi(groups),
        net_pnl=metrics.net_pnl(groups),
        gross_profit=metrics.gross_profit(groups),
        gross_loss=metrics.gross_loss(groups),
        avg_win=metrics.avg_win(groups),
        avg_loss=metrics.avg_loss(groups),
        expectancy=metrics.expectancy(groups),
        max_drawdown=metrics.max_drawdown(groups),
        deltas=deltas,
        currency=currency,
    )


def build_equity_curve(start: datetime, end: datetime) -> List[EquityPoint]:
    groups, _ = load_groups(start, end)
    return [
        EquityPoint(t=t, equity=eq, drawdown=dd)
        for (t, eq, dd) in metrics.equity_curve(groups)
    ]


def to_trade_group(g: GroupedTrade, journal: dict) -> TradeGroup:
    jrow = journal.get(_journal_key(g))
    risk = jrow.get("risk_amount") if jrow else None
    return TradeGroup(
        id=g.id,
        symbol=g.symbol,
        side=g.side,  # type: ignore[arg-type]
        status=g.status,  # type: ignore[arg-type]
        result=g.result,  # type: ignore[arg-type]
        entry_time=g.entry_time,
        exit_time=g.exit_time,
        qty=g.qty,
        avg_entry=g.avg_entry,
        avg_exit=g.avg_exit,
        net_pnl=g.net_pnl,
        realized_pnl=g.realized_pnl,
        commission=g.commission,
        return_pct=g.return_pct,
        r_multiple=metrics.r_multiple(g.net_pnl, float(risk) if risk else None),
        holding_minutes=g.holding_minutes,
        currency=g.currency,
        setup=jrow.get("setup") if jrow else None,
        psych_tags=(jrow.get("psych_tags") or []) if jrow else [],
        has_notes=bool(jrow and (jrow.get("notes") or "").strip()),
    )


def to_detail(g: GroupedTrade, journal: dict) -> TradeGroupDetail:
    base = to_trade_group(g, journal).model_dump(by_alias=False)
    jrow = journal.get(_journal_key(g))

    executions = [
        Execution(
            trade_id=e.trade_id,
            exec_time=e.exec_time,
            action=e.action,  # type: ignore[arg-type]
            quantity=e.quantity,
            price=e.price,
            proceeds=e.proceeds,
            commission=e.commission,
            realized_pnl=e.realized_pnl,
        )
        for e in g.executions
    ]
    markers = [
        TradeMarker(
            time=int(e.exec_time.timestamp()),
            price=e.price,
            side=e.action,  # type: ignore[arg-type]
            qty=e.quantity,
        )
        for e in g.executions
    ]
    journal_entry = (
        JournalEntry(
            id=jrow.get("id"),
            symbol=jrow["symbol"],
            entry_time=jrow["entry_time"],
            setup=jrow.get("setup"),
            psych_tags=jrow.get("psych_tags") or [],
            notes=jrow.get("notes") or "",
            planned_stop=jrow.get("planned_stop"),
            planned_target=jrow.get("planned_target"),
            risk_amount=jrow.get("risk_amount"),
            updated_at=jrow.get("updated_at"),
        )
        if jrow
        else None
    )
    return TradeGroupDetail(**base, executions=executions, markers=markers, journal=journal_entry)
