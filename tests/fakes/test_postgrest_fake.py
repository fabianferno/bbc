"""Unit tests for tests/fakes/postgrest.py — the in-memory PostgREST fake.

Not part of the DAO test suite (the DAO still uses pymongo in this task); these
tests exercise the fake in isolation so its behaviour is trustworthy before
tasks 4-6 build the real DAO rewrite on top of it.
"""

from __future__ import annotations

import pytest

from tests.fakes.postgrest import FakePostgrest, PostgrestFakeError


@pytest.fixture
def store() -> FakePostgrest:
    return FakePostgrest()


def test_identity_id_increments(store: FakePostgrest) -> None:
    r1 = store.table("decisions").insert({"market_id": "m:1", "kind": "entry"}).execute()
    r2 = store.table("decisions").insert({"market_id": "m:1", "kind": "entry"}).execute()
    assert r1.data[0]["id"] == 1
    assert r2.data[0]["id"] == 2


def test_identity_id_scoped_per_table(store: FakePostgrest) -> None:
    d = store.table("decisions").insert({"market_id": "m:1"}).execute()
    p = store.table("positions").insert({"market_id": "m:1"}).execute()
    assert d.data[0]["id"] == 1
    assert p.data[0]["id"] == 1


def test_string_primary_key_upsert_replaces(store: FakePostgrest) -> None:
    store.table("markets").upsert({"id": "poly:1", "question": "Will it rain?"}, on_conflict="id").execute()
    store.table("markets").upsert({"id": "poly:1", "question": "Updated?"}, on_conflict="id").execute()
    rows = store.table("markets").select("*").eq("id", "poly:1").execute().data
    assert len(rows) == 1
    assert rows[0]["question"] == "Updated?"


def test_flywheel_events_position_id_unique_violation(store: FakePostgrest) -> None:
    store.table("flywheel_events").insert(
        {"position_id": 1, "realized_pnl": 1.0, "treasury_share": 0, "ansem_share": 0,
         "reserve_share": 0, "mode": "paper", "created_at": "t"}
    ).execute()
    with pytest.raises(PostgrestFakeError):
        store.table("flywheel_events").insert(
            {"position_id": 1, "realized_pnl": 2.0, "treasury_share": 0, "ansem_share": 0,
             "reserve_share": 0, "mode": "paper", "created_at": "t"}
        ).execute()


def test_market_snapshots_market_asof_unique_violation(store: FakePostgrest) -> None:
    store.table("market_snapshots").insert(
        {"market_id": "m:1", "as_of": "2026-01-01", "price_yes": 0.5}
    ).execute()
    with pytest.raises(PostgrestFakeError):
        store.table("market_snapshots").insert(
            {"market_id": "m:1", "as_of": "2026-01-01", "price_yes": 0.6}
        ).execute()
    # different as_of is fine
    store.table("market_snapshots").insert(
        {"market_id": "m:1", "as_of": "2026-01-02", "price_yes": 0.6}
    ).execute()
    rows = store.table("market_snapshots").select("*").eq("market_id", "m:1").execute().data
    assert len(rows) == 2


def test_metrics_asof_category_unique_violation(store: FakePostgrest) -> None:
    store.table("metrics").insert(
        {"as_of": "2026-01-01", "category": "politics", "n_resolved": 1}
    ).execute()
    with pytest.raises(PostgrestFakeError):
        store.table("metrics").insert(
            {"as_of": "2026-01-01", "category": "politics", "n_resolved": 2}
        ).execute()


def test_upsert_metrics_on_conflict_replaces(store: FakePostgrest) -> None:
    store.table("metrics").upsert(
        {"as_of": "2026-01-01", "category": "politics", "n_resolved": 1},
        on_conflict="as_of,category",
    ).execute()
    store.table("metrics").upsert(
        {"as_of": "2026-01-01", "category": "politics", "n_resolved": 5},
        on_conflict="as_of,category",
    ).execute()
    rows = store.table("metrics").select("*").eq("category", "politics").execute().data
    assert len(rows) == 1
    assert rows[0]["n_resolved"] == 5


def test_like_prefix_match(store: FakePostgrest) -> None:
    for i, closed_at in enumerate(["2026-09-09T01:00:00", "2026-09-09T02:00:00", "2026-09-08T01:00:00"]):
        store.table("positions").insert(
            {"market_id": "m:1", "status": "closed", "closed_at": closed_at, "pnl": float(i)}
        ).execute()
    rows = store.table("positions").select("*").like("closed_at", "2026-09-09%").execute().data
    assert len(rows) == 2
    assert {r["pnl"] for r in rows} == {0.0, 1.0}


def test_order_desc_and_limit(store: FakePostgrest) -> None:
    for _i in range(5):
        store.table("decisions").insert({"market_id": "m:1", "kind": "entry"}).execute()
    rows = store.table("decisions").select("*").order("id", desc=True).limit(2).execute().data
    assert [r["id"] for r in rows] == [5, 4]


def test_eq_neq_in_compose(store: FakePostgrest) -> None:
    store.table("onchain_anchors").insert(
        {"decision_id": 1, "kind": "entry", "tx_hash": "a", "from_address": "0xabc", "created_at": "t"}
    ).execute()
    store.table("onchain_anchors").insert(
        {"decision_id": 2, "kind": "entry", "tx_hash": "b", "from_address": None, "created_at": "t"}
    ).execute()
    store.table("onchain_anchors").insert(
        {"decision_id": 3, "kind": "entry", "tx_hash": "c", "from_address": "0xabc", "created_at": "t"}
    ).execute()

    rows = (
        store.table("onchain_anchors")
        .select("decision_id")
        .eq("from_address", "0xabc")
        .neq("decision_id", None)
        .execute()
        .data
    )
    assert {r["decision_id"] for r in rows} == {1, 3}

    rows = store.table("onchain_anchors").select("*").in_("decision_id", [1, 2]).execute().data
    assert {r["decision_id"] for r in rows} == {1, 2}


def test_gte_lte_range_filter(store: FakePostgrest) -> None:
    for price in [0.02, 0.5, 0.9, 0.98]:
        store.table("markets").insert(
            {"id": f"poly:{price}", "venue": "poly", "external_id": str(price),
             "question": "q", "resolved": 0, "last_price_yes": price}
        ).execute()
    rows = (
        store.table("markets")
        .select("*")
        .gte("last_price_yes", 0.05)
        .lte("last_price_yes", 0.95)
        .execute()
        .data
    )
    assert {r["last_price_yes"] for r in rows} == {0.5, 0.9}


def test_update_applies_to_matching_rows(store: FakePostgrest) -> None:
    store.table("orders").insert({"market_id": "m:1", "status": "open"}).execute()
    store.table("orders").insert({"market_id": "m:1", "status": "open"}).execute()
    store.table("orders").update({"status": "filled"}).eq("market_id", "m:1").execute()
    rows = store.table("orders").select("*").eq("status", "filled").execute().data
    assert len(rows) == 2


def test_delete_removes_matching_rows(store: FakePostgrest) -> None:
    store.table("graph_nodes").insert({"decision_id": 1, "market_id": "m:1", "node_key": "n1",
                                        "label": "l", "type": "t", "created_at": "t"}).execute()
    store.table("graph_nodes").insert({"decision_id": 2, "market_id": "m:1", "node_key": "n2",
                                        "label": "l", "type": "t", "created_at": "t"}).execute()
    store.table("graph_nodes").delete().eq("decision_id", 1).execute()
    remaining = store.table("graph_nodes").select("*").execute().data
    assert len(remaining) == 1
    assert remaining[0]["decision_id"] == 2


def test_single_returns_dict_not_list(store: FakePostgrest) -> None:
    store.table("markets").insert(
        {"id": "poly:1", "venue": "poly", "external_id": "1", "question": "q", "resolved": 0}
    ).execute()
    row = store.table("markets").select("*").eq("id", "poly:1").single().execute().data
    assert isinstance(row, dict)
    assert row["id"] == "poly:1"


def test_single_raises_on_zero_rows(store: FakePostgrest) -> None:
    with pytest.raises(PostgrestFakeError):
        store.table("markets").select("*").eq("id", "missing").single().execute()


def test_single_raises_on_multiple_rows(store: FakePostgrest) -> None:
    store.table("decisions").insert({"market_id": "m:1", "kind": "entry"}).execute()
    store.table("decisions").insert({"market_id": "m:1", "kind": "entry"}).execute()
    with pytest.raises(PostgrestFakeError):
        store.table("decisions").select("*").eq("market_id", "m:1").single().execute()


def test_upsert_without_on_conflict_uses_primary_key(store: FakePostgrest) -> None:
    store.table("breaker_state").upsert({"name": "daily_loss", "tripped": False}).execute()
    store.table("breaker_state").upsert({"name": "daily_loss", "tripped": True}).execute()
    rows = store.table("breaker_state").select("*").execute().data
    assert len(rows) == 1
    assert rows[0]["tripped"] is True


def test_unknown_table_raises(store: FakePostgrest) -> None:
    with pytest.raises(KeyError):
        store.table("not_a_real_table")


def test_insert_returns_data_isolated_from_store(store: FakePostgrest) -> None:
    """Mutating the returned .data must not corrupt the fake's internal state."""
    result = store.table("markets").insert(
        {"id": "poly:1", "venue": "poly", "external_id": "1", "question": "q", "resolved": 0}
    ).execute()
    result.data[0]["question"] = "mutated"
    row = store.table("markets").select("*").eq("id", "poly:1").single().execute().data
    assert row["question"] == "q"
