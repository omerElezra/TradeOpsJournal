"""Pydantic DTOs — mirror the TypeScript interfaces in docs/redesign/state-and-data.md."""
from __future__ import annotations

from datetime import datetime
from typing import Generic, List, Literal, Optional, TypeVar

from pydantic import BaseModel, Field

Side = Literal["LONG", "SHORT"]
TradeResult = Literal["WIN", "LOSS", "BREAKEVEN"]
TradeStatus = Literal["OPEN", "CLOSED"]

T = TypeVar("T")


def camel(s: str) -> str:
    head, *tail = s.split("_")
    return head + "".join(w.capitalize() for w in tail)


class CamelModel(BaseModel):
    """Serializes snake_case Python fields as camelCase JSON for the frontend."""

    model_config = {"alias_generator": camel, "populate_by_name": True}


# ---------------------------------------------------------------------------
# Executions & trade groups
# ---------------------------------------------------------------------------
class Execution(CamelModel):
    trade_id: str
    exec_time: datetime
    action: Literal["BUY", "SELL"]
    quantity: float
    price: float
    proceeds: Optional[float] = None
    commission: Optional[float] = None
    realized_pnl: Optional[float] = None


class TradeMarker(CamelModel):
    time: int  # epoch seconds (Lightweight Charts)
    price: float
    side: Literal["BUY", "SELL"]
    qty: float


class TradeGroup(CamelModel):
    id: str
    symbol: str
    side: Side
    status: TradeStatus
    result: TradeResult
    entry_time: datetime
    exit_time: Optional[datetime] = None
    qty: float
    avg_entry: float
    avg_exit: Optional[float] = None
    net_pnl: float
    realized_pnl: float
    commission: float
    return_pct: float
    r_multiple: Optional[float] = None
    holding_minutes: Optional[int] = None
    currency: str = "USD"
    setup: Optional[str] = None
    psych_tags: List[str] = Field(default_factory=list)
    has_notes: bool = False


class TradeGroupDetail(TradeGroup):
    executions: List[Execution] = Field(default_factory=list)
    journal: Optional["JournalEntry"] = None
    markers: List[TradeMarker] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------
class MetricDeltas(CamelModel):
    win_rate: Optional[float] = None
    profit_factor: Optional[float] = None
    net_roi: Optional[float] = None
    total_trades: Optional[float] = None


class RangeWindow(CamelModel):
    from_: datetime = Field(alias="from")
    to: datetime


class MetricsSummary(CamelModel):
    range: RangeWindow
    total_trades: int
    win_rate: float
    profit_factor: float
    net_roi: float
    net_pnl: float
    gross_profit: float
    gross_loss: float
    avg_win: float
    avg_loss: float
    expectancy: float
    max_drawdown: float
    deltas: MetricDeltas = Field(default_factory=MetricDeltas)
    currency: str = "USD"


class EquityPoint(CamelModel):
    t: datetime
    equity: float
    drawdown: Optional[float] = None


# ---------------------------------------------------------------------------
# Journal
# ---------------------------------------------------------------------------
class JournalEntry(CamelModel):
    id: Optional[int] = None
    symbol: str
    entry_time: datetime
    setup: Optional[str] = None
    psych_tags: List[str] = Field(default_factory=list)
    notes: str = ""
    planned_stop: Optional[float] = None
    planned_target: Optional[float] = None
    risk_amount: Optional[float] = None
    updated_at: Optional[datetime] = None


class JournalUpsert(CamelModel):
    symbol: str
    entry_time: datetime
    setup: Optional[str] = None
    psych_tags: List[str] = Field(default_factory=list)
    notes: str = ""
    planned_stop: Optional[float] = None
    planned_target: Optional[float] = None
    risk_amount: Optional[float] = None


# ---------------------------------------------------------------------------
# AI insights
# ---------------------------------------------------------------------------
InsightType = Literal["STRENGTH", "WEAKNESS", "PATTERN", "WARNING", "SUGGESTION"]
InsightStatus = Literal["new", "accepted", "dismissed"]


class Insight(CamelModel):
    id: str
    type: InsightType
    title: str
    summary: str
    recommendation: Optional[str] = None
    confidence: float
    evidence_trade_ids: List[str] = Field(default_factory=list)
    status: InsightStatus = "new"
    created_at: datetime


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------
class Paginated(CamelModel, Generic[T]):
    data: List[T]
    next_cursor: Optional[str] = None
    total: int


TradeGroupDetail.model_rebuild()
