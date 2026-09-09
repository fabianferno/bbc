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
os.environ["MONGO_DB_URL"] = "mongodb://localhost:27017"
os.environ["MONGO_DB_NAME"] = "bbc_test"
os.environ["AGENT_LOG_PATH"] = str(_TMP / "test.jsonl")
os.environ.setdefault("AGENT_MODE", "paper")
os.environ.setdefault("AGENT_BANKROLL", "50")
os.environ.setdefault("AGENT_PER_MARKET_CAP", "2")
os.environ.setdefault("AGENT_CATEGORIES", "geopolitics,world,politics")

import mongomock  # noqa: E402
import pytest  # noqa: E402

from agent.store import db  # noqa: E402
from tests.fakes.postgrest import FakePostgrest  # noqa: E402


@pytest.fixture(autouse=True)
def _mongo(monkeypatch):
    """Give every test a fresh in-memory MongoDB via mongomock."""
    client = mongomock.MongoClient()
    monkeypatch.setattr(db, "_client", client)
    db.init_db()
    yield
    client.drop_database("bbc_test")


@pytest.fixture
def fresh_db(monkeypatch):
    """A clean DB for a single test (mongomock is already per-test isolated)."""
    client = mongomock.MongoClient()
    monkeypatch.setattr(db, "_client", client)
    db.init_db()
    yield


@pytest.fixture
def fake_postgrest():
    """A fresh in-memory PostgREST fake (tests/fakes/postgrest.py).

    Not yet wired into `agent.store.db` — the DAO still speaks pymongo (tasks
    4-6 will port it to `supabase-py` and swap the call sites over). This
    fixture exists so tests that target the fake directly, or a Task 4+ DAO,
    get per-test isolation matching `_mongo`'s. It is intentionally NOT
    autouse: making it autouse now would not affect anything (nothing reads
    it yet) but would suggest a swap that hasn't happened.
    """
    return FakePostgrest()
