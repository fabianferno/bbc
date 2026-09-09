from fastapi.testclient import TestClient

from agent.api.server import app
from agent.store import db
from agent.treasury import ledger, legs

client = TestClient(app)


def test_treasury_endpoint_reports_notional_and_risk_params():
    ledger.seed_if_empty()
    body = client.get("/api/treasury").json()
    assert body["currency"] == "USD_NOTIONAL"
    assert body["simulated"] is True
    assert body["mode"] == "paper"
    assert body["notional"] is True
    assert body["risk_params"]["drawdown_kill_switch"] == 0.20
    assert "fast" in body["deployed"] and "slow" in body["deployed"]
    assert isinstance(body["breakers"], list)


def test_treasury_endpoint_does_not_trip_the_drawdown_kill_switch():
    """GET /api/treasury must observe breaker state, never evaluate/trip it.

    Drive balance into a >20% drawdown (which `safety.all_clear()` WOULD persist as
    a tripped drawdown breaker) and confirm the read-only endpoint leaves it alone.
    """
    ledger.seed_if_empty()
    with db.connect() as conn:
        db.clear_breakers(conn)
        conn.table("treasury").upsert(
            {
                "id": ledger.TREASURY_DOC_ID,
                "balance": 100.0,
                "high_water_mark": 100.0,
            },
            on_conflict="id",
        ).execute()
        conn.table("treasury").update({"balance": 50.0}).eq(
            "id", ledger.TREASURY_DOC_ID
        ).execute()
    assert ledger.drawdown() >= 0.20

    client.get("/api/treasury")

    with db.connect() as conn:
        state = db.breaker_status(conn, "drawdown")
    assert state is None or not state["tripped"]


def test_treasury_endpoint_is_idempotent_on_breaker_state():
    ledger.seed_if_empty()
    with db.connect() as conn:
        before = db.all_breakers(conn)

    client.get("/api/treasury")
    client.get("/api/treasury")

    with db.connect() as conn:
        after = db.all_breakers(conn)
    assert before == after


def test_flywheel_endpoint_carries_the_simulation_notice():
    body = client.get("/api/flywheel").json()
    assert body["simulated"] is True
    assert "No tokens have been purchased or distributed" in body["notice"]


def test_settled_positions_endpoint_shape():
    body = client.get("/api/positions/settled").json()
    assert body["mode"] == "paper"
    assert body["simulated"] is True
    assert body["notional"] is True
    assert isinstance(body["positions"], list)


def test_settled_positions_reports_fast_and_slow_legs_separately():
    with db.connect() as conn:
        mid = db.upsert_market(
            conn,
            {
                "venue": "manifold",
                "external_id": "desk-1",
                "question": "Will fast leg resolve yes?",
            },
        )
        fast_id = db.open_position(
            conn,
            {
                "market_id": mid,
                "venue": "manifold",
                "leg": legs.FAST,
                "side": "yes",
                "shares": 10.0,
                "entry_price": 0.5,
                "notional_in": 10.0,
            },
        )
        db.close_position(
            conn,
            fast_id,
            exit_price=1.0,
            notional_out=15.0,
            exit_decision_id=None,
            venue_exit_order=None,
            p_yes_at_exit=1.0,
        )
        slow_id = db.open_position(
            conn,
            {
                "market_id": mid,
                "venue": "manifold",
                "leg": legs.SLOW,
                "side": "yes",
                "shares": 10.0,
                "entry_price": 0.5,
                "notional_in": 10.0,
            },
        )
        db.close_position(
            conn,
            slow_id,
            exit_price=0.0,
            notional_out=2.0,
            exit_decision_id=None,
            venue_exit_order=None,
            p_yes_at_exit=0.0,
        )

    body = client.get("/api/positions/settled").json()
    perf = body["leg_performance"]
    assert perf["fast"]["settled"] >= 1
    assert perf["slow"]["settled"] >= 1
    assert perf["fast"]["win_rate"] != perf["slow"]["win_rate"]
    assert perf["fast"]["wins"] >= 1
    assert perf["slow"]["wins"] == 0 or perf["slow"]["win_rate"] is not None


def test_settled_excludes_backtest_positions_on_real_markets():
    """A backtest position (venue="simulated") on a REAL manifold market must not
    be published as a settled paper trade.

    `positions_with_market` overwrites `venue` with the MARKET's venue, so the
    endpoint has to filter on the position's own `position_venue`.
    """
    with db.connect() as conn:
        mid = db.upsert_market(
            conn,
            {"venue": "manifold", "external_id": "bt-1", "question": "Backtested?"},
        )
        sim_id = db.open_position(
            conn,
            {
                "market_id": mid, "venue": "simulated", "leg": legs.FAST, "side": "yes",
                "shares": 10.0, "entry_price": 0.5, "notional_in": 10.0,
            },
        )
        db.close_position(
            conn, sim_id, exit_price=1.0, notional_out=99.0,
            exit_decision_id=None, venue_exit_order=None, p_yes_at_exit=1.0,
        )

    body = client.get("/api/positions/settled").json()
    assert all(p["id"] != sim_id for p in body["positions"])
    perf = body["leg_performance"]
    assert perf["fast"]["settled"] == 0
    assert perf["fast"]["realized_pnl_notional"] == 0.0


def test_settled_ignores_unknown_leg_labels():
    """A legacy/unknown `leg` value must not 500 the endpoint or blend into a leg."""
    with db.connect() as conn:
        mid = db.upsert_market(
            conn, {"venue": "manifold", "external_id": "leg-x", "question": "Odd leg?"},
        )
        pid = db.open_position(
            conn,
            {
                "market_id": mid, "venue": "manifold", "leg": "medium", "side": "yes",
                "shares": 10.0, "entry_price": 0.5, "notional_in": 10.0,
            },
        )
        db.close_position(
            conn, pid, exit_price=1.0, notional_out=15.0,
            exit_decision_id=None, venue_exit_order=None, p_yes_at_exit=1.0,
        )

    resp = client.get("/api/positions/settled")
    assert resp.status_code == 200
    perf = resp.json()["leg_performance"]
    assert perf["fast"]["settled"] == 0
    assert perf["slow"]["settled"] == 0


def test_flywheel_endpoint_keeps_the_scalar_count_and_the_log_separate():
    body = client.get("/api/flywheel").json()
    assert isinstance(body["event_count"], int)
    assert isinstance(body["events"], list)
    assert body["event_count"] == len(body["events"])


def test_anchor_record_rejects_unknown_foreign_keys():
    """`decision_id`/`market_id` are FK-constrained in Postgres.

    A stale id was silently accepted under Mongo; unvalidated it would now raise a
    foreign-key violation and surface to the caller as a 500.
    """
    body = {
        "kind": "anchor",
        "tx_hash": "5" * 64,
        "decision_id": 999999,
    }
    assert client.post("/api/anchors/record", json=body).status_code == 422

    body = {"kind": "anchor", "tx_hash": "5" * 64, "market_id": "manifold:nope"}
    assert client.post("/api/anchors/record", json=body).status_code == 422


def test_anchor_record_accepts_a_live_decision_id():
    with db.connect() as conn:
        market_id = db.upsert_market(
            conn, {"venue": "manifold", "external_id": "anchor-ok", "question": "q"}
        )
        did = db.record_decision(conn, {
            "market_id": market_id, "kind": "entry", "as_of": "2026-01-01T00:00:00+00:00",
            "prompt": "p", "model_id": "m", "response_raw": "{}",
        })
    resp = client.post("/api/anchors/record", json={
        "kind": "anchor", "tx_hash": "6" * 64,
        "decision_id": did, "market_id": market_id,
    })
    assert resp.status_code == 200
    assert resp.json()["tx_hash"] == "6" * 64
