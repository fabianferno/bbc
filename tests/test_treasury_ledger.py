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
        # equity is unchanged by deploying capital: cash 9500 + deployed 500
        assert ledger.equity() == 10000.0
        db.close_position(
            conn, pid, exit_price=0.7, notional_out=700.0,
            exit_decision_id=None, venue_exit_order=None, p_yes_at_exit=0.7,
        )
    # 9500 cash + 700 proceeds = 10200, minus the flywheel outflow (35% + 15% of
    # the 200 profit = 100) that leaves the book for the $ANSEM buy and reserve.
    # The treasury therefore keeps exactly 50% of the profit.
    assert ledger.balance() == 10100.0


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


def test_partial_close_leaves_position_open_and_credits_partial_proceeds():
    ledger.seed_if_empty()
    with db.connect() as conn:
        pid = db.open_position(conn, {
            "market_id": "manifold:p1", "venue": "manifold", "side": "YES",
            "shares": 10.0, "entry_price": 0.5, "notional_in": 500.0, "leg": "fast",
        })
        bal_after_entry = ledger.balance()
        db.close_position(
            conn, pid, exit_price=0.7, notional_out=280.0,
            exit_decision_id=None, venue_exit_order=None, p_yes_at_exit=0.7,
            shares_closed=4.0,
        )
        pos = conn["positions"].find_one({"_id": pid})
    assert pos["status"] == "open"
    assert pos["shares"] == 6.0
    assert pos["notional_in"] == 300.0
    assert ledger.balance() == bal_after_entry + 280.0


def test_two_partial_closes_match_single_full_close_balance():
    ledger.seed_if_empty()
    bal_before_a = ledger.balance()
    with db.connect() as conn:
        pid_a = db.open_position(conn, {
            "market_id": "manifold:p2a", "venue": "manifold", "side": "YES",
            "shares": 10.0, "entry_price": 0.5, "notional_in": 500.0, "leg": "fast",
        })
        db.close_position(
            conn, pid_a, exit_price=0.7, notional_out=280.0,
            exit_decision_id=None, venue_exit_order=None, p_yes_at_exit=0.7,
            shares_closed=4.0,
        )
        db.close_position(
            conn, pid_a, exit_price=0.7, notional_out=420.0,
            exit_decision_id=None, venue_exit_order=None, p_yes_at_exit=0.7,
            shares_closed=6.0,
        )
        partial_delta = ledger.balance() - bal_before_a
        pos_a = conn["positions"].find_one({"_id": pid_a})

    bal_before_b = ledger.balance()
    with db.connect() as conn:
        pid_b = db.open_position(conn, {
            "market_id": "manifold:p2b", "venue": "manifold", "side": "YES",
            "shares": 10.0, "entry_price": 0.5, "notional_in": 500.0, "leg": "fast",
        })
        db.close_position(
            conn, pid_b, exit_price=0.7, notional_out=700.0,
            exit_decision_id=None, venue_exit_order=None, p_yes_at_exit=0.7,
        )
        full_delta = ledger.balance() - bal_before_b

    assert pos_a["status"] == "closed"
    assert partial_delta == full_delta


def test_full_close_still_marks_closed_and_sets_closed_at():
    ledger.seed_if_empty()
    with db.connect() as conn:
        pid = db.open_position(conn, {
            "market_id": "manifold:p3", "venue": "manifold", "side": "YES",
            "shares": 10.0, "entry_price": 0.5, "notional_in": 500.0, "leg": "fast",
        })
        db.close_position(
            conn, pid, exit_price=0.7, notional_out=700.0,
            exit_decision_id=None, venue_exit_order=None, p_yes_at_exit=0.7,
        )
        pos = conn["positions"].find_one({"_id": pid})
    assert pos["status"] == "closed"
    assert pos["closed_at"] is not None
    assert pos["pnl"] == 200.0


def test_final_slice_of_multi_partial_close_reports_true_total_pnl():
    ledger.seed_if_empty()
    with db.connect() as conn:
        pid_a = db.open_position(conn, {
            "market_id": "manifold:p4a", "venue": "manifold", "side": "YES",
            "shares": 10.0, "entry_price": 0.5, "notional_in": 500.0, "leg": "fast",
        })
        db.close_position(
            conn, pid_a, exit_price=0.7, notional_out=280.0,
            exit_decision_id=None, venue_exit_order=None, p_yes_at_exit=0.7,
            shares_closed=4.0,
        )
        db.close_position(
            conn, pid_a, exit_price=0.7, notional_out=420.0,
            exit_decision_id=None, venue_exit_order=None, p_yes_at_exit=0.7,
            shares_closed=6.0,
        )
        pos_a = conn["positions"].find_one({"_id": pid_a})

    with db.connect() as conn:
        pid_b = db.open_position(conn, {
            "market_id": "manifold:p4b", "venue": "manifold", "side": "YES",
            "shares": 10.0, "entry_price": 0.5, "notional_in": 500.0, "leg": "fast",
        })
        db.close_position(
            conn, pid_b, exit_price=0.7, notional_out=700.0,
            exit_decision_id=None, venue_exit_order=None, p_yes_at_exit=0.7,
        )
        pos_b = conn["positions"].find_one({"_id": pid_b})

    assert pos_a["pnl"] == pos_b["pnl"] == 200.0
    assert pos_a["notional_out"] == pos_b["notional_out"] == 700.0


def test_positions_today_pnl_matches_between_multi_partial_and_single_full_close():
    with db.connect() as conn:
        pid_a = db.open_position(conn, {
            "market_id": "manifold:p5a", "venue": "manifold", "side": "YES",
            "shares": 10.0, "entry_price": 0.5, "notional_in": 500.0, "leg": "fast",
        })
        before = db.positions_today_pnl(conn)
        db.close_position(
            conn, pid_a, exit_price=0.7, notional_out=280.0,
            exit_decision_id=None, venue_exit_order=None, p_yes_at_exit=0.7,
            shares_closed=4.0,
        )
        db.close_position(
            conn, pid_a, exit_price=0.7, notional_out=420.0,
            exit_decision_id=None, venue_exit_order=None, p_yes_at_exit=0.7,
            shares_closed=6.0,
        )
        partial_path_total = db.positions_today_pnl(conn) - before

    with db.connect() as conn:
        pid_b = db.open_position(conn, {
            "market_id": "manifold:p5b", "venue": "manifold", "side": "YES",
            "shares": 10.0, "entry_price": 0.5, "notional_in": 500.0, "leg": "fast",
        })
        before_b = db.positions_today_pnl(conn)
        db.close_position(
            conn, pid_b, exit_price=0.7, notional_out=700.0,
            exit_decision_id=None, venue_exit_order=None, p_yes_at_exit=0.7,
        )
        full_path_total = db.positions_today_pnl(conn) - before_b

    assert partial_path_total == full_path_total == 200.0
