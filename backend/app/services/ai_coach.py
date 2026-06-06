"""AI coaching service.

Today: returns deterministic mock insights so the frontend <AIInsightPanel/> can be
built and demoed. Later: pull grouped trades + metrics + journal, build an LLM
context window, and return structured Insight objects persisted to ai_coach_insights.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from app.domain.grouping import GroupedTrade
from app.domain.models import Insight


def generate_insights(groups: List[GroupedTrade]) -> List[Insight]:
    now = datetime.now(timezone.utc)
    if not groups:
        return []

    # Placeholder heuristic stubs — replaced by an LLM later. confidence=0 signals mock.
    return [
        Insight(
            id="mock-overtrading",
            type="PATTERN",
            title="Watch for revenge trading",
            summary=(
                "Loss rate tends to climb after consecutive losing trades, which can "
                "indicate emotionally driven re-entries."
            ),
            recommendation="Consider a 2-loss daily stop to protect capital.",
            confidence=0.0,
            evidence_trade_ids=[g.id for g in groups[:3]],
            status="new",
            created_at=now,
        ),
        Insight(
            id="mock-winners",
            type="STRENGTH",
            title="Winners held longer than losers",
            summary="Your average winning hold time exceeds your losing hold time — a healthy sign of letting winners run.",
            recommendation=None,
            confidence=0.0,
            evidence_trade_ids=[g.id for g in groups[:2]],
            status="new",
            created_at=now,
        ),
    ]
