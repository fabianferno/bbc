"""Module-level cached Supabase client factory.

Prefers `settings.supabase_service_role_key` when configured (server-side,
bypasses RLS); falls back to `settings.supabase_publishable_key` (ships in
the browser bundle, subject to the RLS policies in `schema.sql`). Raises a
clear, actionable error when neither is configured or the URL is missing.
"""

from __future__ import annotations

from supabase import Client, create_client

from agent.config import settings

_client: Client | None = None


def get_client() -> Client:
    """Return the shared, cached Supabase client, creating it on first use."""
    global _client
    if _client is not None:
        return _client

    if not settings.supabase_url:
        raise RuntimeError(
            "SUPABASE_URL is not configured. Set `supabase_url` (env var "
            "SUPABASE_URL) in your .env before using the Supabase-backed store."
        )

    key = settings.supabase_service_role_key or settings.supabase_publishable_key
    if not key:
        raise RuntimeError(
            "No Supabase credential configured. Set either "
            "SUPABASE_SERVICE_ROLE_KEY (server-only, bypasses RLS) or "
            "SUPABASE_PUBLISHABLE_KEY (subject to the RLS policies in "
            "agent/store/schema.sql) in your .env."
        )

    _client = create_client(settings.supabase_url, key)
    return _client
