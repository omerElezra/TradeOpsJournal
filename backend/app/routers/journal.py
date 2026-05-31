"""Journal upsert endpoint (notes, tags, planned stop/target, risk)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.db import queries
from app.domain.models import JournalEntry, JournalUpsert

router = APIRouter(prefix="/api/v1/journal", tags=["journal"])


@router.post("", response_model=JournalEntry)
def upsert_journal(payload: JournalUpsert) -> JournalEntry:
    row = queries.upsert_journal(
        {
            "symbol": payload.symbol,
            "entry_time": payload.entry_time.isoformat(),
            "setup": payload.setup,
            "psych_tags": payload.psych_tags,
            "notes": payload.notes,
            "planned_stop": payload.planned_stop,
            "planned_target": payload.planned_target,
            "risk_amount": payload.risk_amount,
        }
    )
    if row is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    return JournalEntry.model_validate(row)
