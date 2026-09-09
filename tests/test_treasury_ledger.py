from agent.store import db
from agent.treasury import ledger


def test_seed_creates_single_event_and_balance():
    ledger.seed_if_empty()
    assert ledger.balance() == 10000.0
    assert ledger.high_water_mark() == 10000.0
    ledger.seed_if_empty()  # idempotent
    assert ledger.balance() == 10000.0


def test_balance_is_replay_of_event_log():
    ledger.seed_if_empty()
    ledger.record("entry", -250.0, position_id=1, leg="fast")
    ledger.record("settlement", 310.0, position_id=1, leg="fast")
    assert ledger.balance() == 10060.0
    assert ledger.replay_balance() == ledger.balance()


def test_high_water_mark_never_decreases():
    ledger.seed_if_empty()
    ledger.record("settlement", 500.0)
    assert ledger.high_water_mark() == 10500.0
    ledger.record("settlement", -800.0)
    assert ledger.balance() == 9700.0
    assert ledger.high_water_mark() == 10500.0


def test_drawdown_from_high_water_mark():
    ledger.seed_if_empty()
    ledger.record("settlement", -2000.0)
    assert abs(ledger.drawdown() - 0.20) < 1e-9


def test_snapshot_reports_notional_currency():
    ledger.seed_if_empty()
    snap = ledger.snapshot()
    assert snap["currency"] == "USD_NOTIONAL"
    assert snap["balance"] == 10000.0



def test_open_and_close_position_move_the_treasury():
    ledger.seed_if_empty()
    with db.connect() as conn:
        pid = db.open_position(conn, {
            "market_id": "manifold:m1", "venue": "manifold", "side": "YES",
            "shares": 10.0, "entry_price": 0.5, "notional_in": 500.0, "leg": "fast",
        })
        assert ledger.balance() == 9500.0
        db.close_position(
            conn, pid, exit_price=0.7, notional_out=700.0,
            exit_decision_id=None, venue_exit_order=None, p_yes_at_exit=0.7,
        )
    assert ledger.balance() == 10200.0


def test_backtest_positions_do_not_touch_the_treasury():
    ledger.seed_if_empty()
    with db.connect() as conn:
        pid = db.open_position(conn, {
            "market_id": "sim:m1", "venue": "simulated", "side": "YES",
            "shares": 10.0, "entry_price": 0.5, "notional_in": 500.0, "leg": "fast",
        })
        db.close_position(
            conn, pid, exit_price=0.7, notional_out=700.0,
            exit_decision_id=None, venue_exit_order=None, p_yes_at_exit=0.7,
        )
    assert ledger.balance() == 10000.0


def test_leg_is_persisted_and_defaults_to_slow():
    with db.connect() as conn:
        pid = db.open_position(conn, {
            "market_id": "manifold:m2", "venue": "manifold", "side": "NO",
            "shares": 1.0, "entry_price": 0.5, "notional_in": 1.0,
        })
        pos = conn["positions"].find_one({"_id": pid})
    assert pos["leg"] == "slow"
