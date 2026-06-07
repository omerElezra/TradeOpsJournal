"""Pure KPI/metric engine over grouped round-trip trades.

All functions are pure (no DB, no FastAPI) and operate on GroupedTrade objects.
Definitions:
  - Win rate      = wins / closed trades * 100
  - Profit factor = gross profit / |gross loss|
  - Expectancy    = mean net_pnl per closed trade
  - Net ROI       = net pnl / capital deployed (sum of cost basis of winners+losers) * 100
  - Max drawdown  = largest peak-to-trough drop of the cumulative equity curve
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from app.domain.grouping import GroupedTrade

EPS = 1e-9


def _closed(trades: List[GroupedTrade]) -> List[GroupedTrade]:
    return [t for t in trades if t.status == "CLOSED"]


def win_rate(trades: List[GroupedTrade]) -> float:
    closed = _closed(trades)
    if not closed:
        return 0.0
    wins = sum(1 for t in closed if t.result == "WIN")
    return round(wins / len(closed) * 100.0, 4)


def gross_profit(trades: List[GroupedTrade]) -> float:
    return round(sum(t.net_pnl for t in _closed(trades) if t.net_pnl > 0), 2)


def gross_loss(trades: List[GroupedTrade]) -> float:
    return round(sum(t.net_pnl for t in _closed(trades) if t.net_pnl < 0), 2)


def profit_factor(trades: List[GroupedTrade]) -> float:
    gp = gross_profit(trades)
    gl = abs(gross_loss(trades))
    if gl < EPS:
        return round(gp, 4) if gp > 0 else 0.0
    return round(gp / gl, 4)


def net_pnl(trades: List[GroupedTrade]) -> float:
    return round(sum(t.net_pnl for t in _closed(trades)), 2)


def avg_win(trades: List[GroupedTrade]) -> float:
    wins = [t.net_pnl for t in _closed(trades) if t.result == "WIN"]
    return round(sum(wins) / len(wins), 2) if wins else 0.0


def avg_loss(trades: List[GroupedTrade]) -> float:
    losses = [t.net_pnl for t in _closed(trades) if t.result == "LOSS"]
    return round(sum(losses) / len(losses), 2) if losses else 0.0


def expectancy(trades: List[GroupedTrade]) -> float:
    closed = _closed(trades)
    if not closed:
        return 0.0
    return round(sum(t.net_pnl for t in closed) / len(closed), 2)


def net_roi(trades: List[GroupedTrade]) -> float:
    closed = _closed(trades)
    capital = sum(t.avg_entry * t.qty for t in closed)
    if capital < EPS:
        return 0.0
    return round(net_pnl(trades) / capital * 100.0, 4)


def equity_curve(trades: List[GroupedTrade]) -> List[tuple[datetime, float, float]]:
    """Return [(timestamp, cumulative_equity, drawdown), ...] ordered by close time."""
    closed = sorted(
        (t for t in _closed(trades) if t.exit_time is not None),
        key=lambda t: t.exit_time,  # type: ignore[arg-type,return-value]
    )
    points: List[tuple[datetime, float, float]] = []
    cumulative = 0.0
    peak = 0.0
    for t in closed:
        cumulative += t.net_pnl
        peak = max(peak, cumulative)
        drawdown = cumulative - peak  # <= 0
        points.append((t.exit_time, round(cumulative, 2), round(drawdown, 2)))  # type: ignore[arg-type]
    return points


def max_drawdown(trades: List[GroupedTrade]) -> float:
    curve = equity_curve(trades)
    if not curve:
        return 0.0
    return round(min(d for _, _, d in curve), 2)


def total_trades(trades: List[GroupedTrade]) -> int:
    return len(_closed(trades))


def r_multiple(net: float, risk_amount: Optional[float]) -> Optional[float]:
    if risk_amount is None or abs(risk_amount) < EPS:
        return None
    return round(net / abs(risk_amount), 2)
