"""pytest fixtures.

Env vars MUST be set before `agent.config` is imported anywhere, so we do it at module
load time (before any other imports below).
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

# ---- env setup (runs before any agent imports) ----
_TMP = Path(tempfile.mkdtemp(prefix="bbc-test-"))
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_PUBLISHABLE_KEY", "test-publishable-key")
os.environ["AGENT_LOG_PATH"] = str(_TMP / "test.jsonl")
os.environ.setdefault("AGENT_MODE", "paper")
os.environ.setdefault("AGENT_BANKROLL", "50")
os.environ.setdefault("AGENT_PER_MARKET_CAP", "2")
os.environ.setdefault("AGENT_CATEGORIES", "geopolitics,world,politics")

import pytest  # noqa: E402

from agent.store import db  # noqa: E402
from tests.fakes.postgrest import FakePostgrest  # noqa: E402


@pytest.fixture(autouse=True)
def _store(monkeypatch):
    """Give every test a fresh in-memory PostgREST store.

    `monkeypatch.setattr` on the module-level client handle is undone after each
    test, so isolation matches the pre-migration fixture's behavior: a new
    empty store per test, with nothing leaking across.
    """
    monkeypatch.setattr(db, "_client", FakePostgrest())
    db.init_db()
    yield


@pytest.fixture
def fresh_db(monkeypatch):
    """A clean store for a single test (the autouse fixture already isolates)."""
    monkeypatch.setattr(db, "_client", FakePostgrest())
    db.init_db()
    yield


@pytest.fixture
def fake_postgrest():
    """A standalone in-memory PostgREST fake, for tests that drive it directly."""
    return FakePostgrest()
