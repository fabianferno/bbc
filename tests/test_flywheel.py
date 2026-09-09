from agent.treasury import flywheel, ledger


def _fixed_price(monkeypatch, price):
    monkeypatch.setattr(flywheel, "ansem_price_usd", lambda: (price, "test"))


def test_profitable_settlement_splits_fifty_thirtyfive_fifteen(monkeypatch):
    ledger.seed_if_empty()
    _fixed_price(monkeypatch, 0.02)
    ev = flywheel.on_settlement(position_id=1, realized_pnl=100.0)
    assert ev["treasury_share"] == 50.0
    assert ev["ansem_share"] == 35.0
    assert ev["reserve_share"] == 15.0
    assert ev["ansem_qty"] == 1750.0  # 35 / 0.02
    assert ev["mode"] == "paper"


def test_losing_settlement_writes_nothing(monkeypatch):
    ledger.seed_if_empty()
    _fixed_price(monkeypatch, 0.02)
    assert flywheel.on_settlement(position_id=2, realized_pnl=-40.0) is None
    assert flywheel.events() == []


def test_price_failure_still_records_the_split(monkeypatch):
    ledger.seed_if_empty()
    monkeypatch.setattr(flywheel, "ansem_price_usd", lambda: (None, "unavailable"))
    ev = flywheel.on_settlement(position_id=3, realized_pnl=100.0)
    assert ev["ansem_share"] == 35.0
    assert ev["ansem_price_usd"] is None
    assert ev["ansem_qty"] is None


def test_totals_are_aggregated_from_the_event_log(monkeypatch):
    ledger.seed_if_empty()
    _fixed_price(monkeypatch, 0.02)
    flywheel.on_settlement(position_id=4, realized_pnl=100.0)
    flywheel.on_settlement(position_id=5, realized_pnl=200.0)
    t = flywheel.totals()
    assert t["ansem_usd"] == 105.0  # 35 + 70
    assert t["ansem_qty"] == 5250.0
    assert t["reserve_usd"] == 45.0
    assert t["simulated"] is True


def test_settlement_is_idempotent_per_position(monkeypatch):
    ledger.seed_if_empty()
    _fixed_price(monkeypatch, 0.02)
    flywheel.on_settlement(position_id=6, realized_pnl=100.0)
    flywheel.on_settlement(position_id=6, realized_pnl=100.0)
    assert len(flywheel.events()) == 1


def test_terminal_close_after_partials_fires_flywheel_once_with_true_total_pnl():
    from agent.store import db

    ledger.seed_if_empty()
    with db.connect() as conn:
        pid = db.next_id(conn, "positions")
        conn["positions"].insert_one(
            {
                "_id": pid,
                "market_id": 1,
                "venue": "manifold",
                "leg": "slow",
                "shares": 100.0,
                "notional_in": 50.0,
                "notional_in_original": 50.0,
                "notional_out": 0.0,
                "pnl": 0.0,
                "fees": 0.0,
                "status": "open",
                "entry_price": 0.5,
                "opened_at": "2026-01-01T00:00:00Z",
            }
        )

        db.close_position(
            conn,
            pid,
            exit_price=0.6,
            notional_out=30.0,
            exit_decision_id=None,
            venue_exit_order=None,
            p_yes_at_exit=0.6,
            shares_closed=50.0,
        )
        assert flywheel.events() == [] or all(e["position_id"] != pid for e in flywheel.events())

        db.close_position(
            conn,
            pid,
            exit_price=0.7,
            notional_out=35.0,
            exit_decision_id=None,
            venue_exit_order=None,
            p_yes_at_exit=0.7,
            shares_closed=50.0,
        )

        pos = db._row(conn["positions"].find_one({"_id": pid}))
        assert pos["status"] == "closed"
        true_total_pnl = pos["pnl"]

    matches = [e for e in flywheel.events(limit=100) if e["position_id"] == pid]
    assert len(matches) == 1
    assert matches[0]["realized_pnl"] == round(true_total_pnl, 6)
