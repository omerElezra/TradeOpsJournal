"""Supabase client (service role) — server-side only."""
from __future__ import annotations

from functools import lru_cache
from typing import Optional

from supabase import Client, create_client

from app.core.config import get_settings


@lru_cache
def get_supabase() -> Optional[Client]:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_key:
        return None
    return create_client(settings.supabase_url, settings.supabase_service_key)
