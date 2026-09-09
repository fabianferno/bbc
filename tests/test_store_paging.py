"""Regression tests for the PostgREST failure modes the fake used to hide.

Three defect classes, none of them visible before the fake grew a row cap:

1. Every unbounded `.select()` is silently truncated at the project's `Max rows`
   setting and still answers HTTP 200 — so a full-history read returns partial
   data with no error. `db.fetch_all` pages around it.
2. `.in_()` with thousands of text ids overflows the HTTP request line (414);
   `db.fetch_in_chunks` splits it.
3. `.in_()` with an EMPTY list renders as `in.()` and is rejected with a 400.
4. Postgres orders NULLS FIRST under DESC, the opposite of Mongo, which would
   float value-less markets to the top of every discovery listing.
"""

from __future__ import annotations

import pytest

from agent.store import db
from agent.treasury import ledger
from tests.fakes.postgrest import FakePostgrest

CAP = 3


@pytest.fixture
def capped(monkeypatch):
    """A store whose PostgREST max-rows cap is tiny, so truncation is testable."""
    store = FakePostgrest(max_rows=CAP)
    monkeypatch.setattr(db, "_client", store)
    return store


def _seed_events(n: int) -> None:
    with db.connect() as conn:
        for _ in range(n):
            conn.table("treasury_events").insert(
                {"kind": "seed", "amount": 1.0, "balance_after": 0.0, "mode": "paper"}
            ).execute()


def test_raw_select_is_truncated_but_fetch_all_pages(capped):
    _seed_events(10)
    with db.connect() as conn:
        raw = db._rows(conn.table("treasury_events").select("amount").execute())
        paged = db.fetch_all(
            lambda: conn.table("treasury_events").select("amount"), page_size=CAP
        )
    assert len(raw) == CAP, "the fake must model PostgREST's silent row cap"
    assert len(paged) == 10


def test_replay_balance_sums_every_event_past_the_row_cap(capped):
    _seed_events(10)
    # Ten $1 events: a truncated read would report 3.0 and then persist it.
    assert ledger.replay_balance() == 10.0


def test_fetch_all_stops_on_an_exact_multiple_of_the_page_size(capped):
    _seed_events(CAP * 2)
    with db.connect() as conn:
        rows = db.fetch_all(
            lambda: conn.table("treasury_events").select("amount"), page_size=CAP
        )
    assert len(rows) == CAP * 2


def test_fetch_in_chunks_splits_a_large_in_list(capped):
    with db.connect() as conn:
        ids = []
        for i in range(10):
            ids.append(
                db.upsert_market(
                    conn,
                    {"venue": "manifold", "external_id": f"m{i}", "question": f"q{i}"},
                )
            )
        got = db.fetch_in_chunks(
            lambda: conn.table("markets").select("*"), "id", ids, chunk_size=2, page_size=CAP
        )
    assert {r["id"] for r in got} == set(ids)


def test_fetch_in_chunks_short_circuits_an_empty_id_list(capped):
    calls = []
    with db.connect() as conn:
        def _q():
            calls.append(1)
            return conn.table("markets").select("*")

        assert db.fetch_in_chunks(_q, "id", []) == []
    assert calls == [], "an empty .in_() must never reach PostgREST (it 400s)"


def test_positions_for_a_wallet_with_no_anchors_is_empty_not_an_error():
    # `decision_ids_for_wallet` returns [] here; passing that to `.in_()` would
    # render `in.()` and 400 against real PostgREST.
    with db.connect() as conn:
        assert db.positions_with_market(conn, wallet="0xnothinganchored") == []


def test_null_sort_column_sorts_last_not_first():
    with db.connect() as conn:
        db.upsert_market(conn, {
            "venue": "manifold", "external_id": "novol", "question": "no volume",
        })
        db.upsert_market(conn, {
            "venue": "manifold", "external_id": "vol", "question": "has volume",
            "volume_24h": 100.0,
        })
        rows = db.list_open_markets(conn, limit=10)
    assert [r["external_id"] for r in rows] == ["vol", "novol"]


def test_resolved_market_with_null_end_date_sorts_last():
    with db.connect() as conn:
        db.upsert_market(conn, {
            "venue": "manifold", "external_id": "noend", "question": "no end date",
            "resolved": True, "resolution_value": 1.0,
        })
        db.upsert_market(conn, {
            "venue": "manifold", "external_id": "dated", "question": "dated",
            "resolved": True, "resolution_value": 0.0, "end_date": "2026-01-01",
        })
        rows = db.list_resolved_markets(conn)
    assert [r["external_id"] for r in rows] == ["dated", "noend"]


def test_upsert_market_survives_a_concurrent_insert_of_the_same_id():
    """The existence check and the insert are not atomic; a racing cycle can win.

    Simulated by forcing the existence probe to report "absent" for a row that
    is in fact present, which is exactly the state a concurrent cycle creates.
    """
    import agent.store.db as dbmod

    with db.connect() as conn:
        first = db.upsert_market(
            conn, {"venue": "manifold", "external_id": "race", "question": "q"}
        )
        orig_first = dbmod._first
        dbmod._first = lambda res: None  # type: ignore[assignment]
        try:
            second = db.upsert_market(
                conn,
                {"venue": "manifold", "external_id": "race", "question": "updated"},
            )
        finally:
            dbmod._first = orig_first  # type: ignore[assignment]
        assert first == second
        assert db.get_market(conn, second)["question"] == "updated"
