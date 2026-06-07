"""Date-range parsing helpers shared across routers."""
from __future__ import annotations

from datetime import datetime, timezone, date
from typing import Optional, Tuple

VALID_RANGES = {"7d", "30d", "90d", "ytd", "all"}


def resolve_range(
    range_key: Optional[str] = None,
    frm: Optional[str] = None,
    to: Optional[str] = None,
) -> Tuple[datetime, datetime]:
    """Resolve a range key (or explicit from/to ISO dates) to a UTC window.

    Returns (start, end) as timezone-aware UTC datetimes.
    """
    now = datetime.now(timezone.utc)

    if frm and to:
        return _parse_iso(frm), _parse_iso(to)

    key = (range_key or "30d").lower()
    if key not in VALID_RANGES:
        key = "30d"

    if key == "all":
        return datetime(1970, 1, 1, tzinfo=timezone.utc), now
    if key == "ytd":
        return datetime(now.year, 1, 1, tzinfo=timezone.utc), now

    days = {"7d": 7, "30d": 30, "90d": 90}[key]
    from datetime import timedelta

    return now - timedelta(days=days), now


def _parse_iso(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt
