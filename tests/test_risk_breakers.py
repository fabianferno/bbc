from agent.execution import safety
from agent.treasury import ledger


def test_drawdown_breaker_trips_at_twenty_percent():
    ledger.seed_if_empty()
    assert not safety.check_drawdown().tripped
    ledger.record("settlement", -2000.0)  # exactly 20% below HWM
    assert safety.check_drawdown().tripped
    ok, _ = safety.all_clear()
    assert not ok


def test_drawdown_breaker_does_not_auto_expire():
    """Unlike daily_loss, the kill-switch has no cooldown — it needs a manual reset."""
    ledger.seed_if_empty()
    ledger.record("settlement", -2500.0)
    assert safety.check_drawdown().tripped
    from agent.store import db

    with db.connect() as conn:
        state = db.breaker_status(conn, "drawdown")
    assert state["tripped"] is True
    assert state.get("expires_at") in (None, "")


def test_position_cap_rejects_oversized_candidate():
    ledger.seed_if_empty()
    chk = safety.entry_allowed(usd_size=600.0, leg="fast", category="politics")  # >5% of 10k
    assert chk.tripped
    assert "position_cap" in chk.name


def test_position_within_cap_is_allowed():
    ledger.seed_if_empty()
    assert not safety.entry_allowed(usd_size=400.0, leg="fast", category="politics").tripped


def test_entry_breaker_does_not_halt_the_agent():
    ledger.seed_if_empty()
    assert safety.entry_allowed(usd_size=9999.0, leg="fast", category="politics").tripped
    ok, _ = safety.all_clear()
    assert ok


def test_fast_leg_deployment_cap(monkeypatch):
    ledger.seed_if_empty()
    monkeypatch.setattr(ledger, "deployed", lambda leg=None: 2400.0 if leg == "fast" else 0.0)
    # 2400 deployed + 200 new = 2600 > 25% of 10_000
    assert safety.entry_allowed(usd_size=200.0, leg="fast", category="politics").tripped


def test_category_concentration_cap(monkeypatch):
    ledger.seed_if_empty()
    monkeypatch.setattr(
        safety,
        "_open_exposure_by_category",
        lambda: ({"politics": 2400.0, "world": 100.0}, 2500.0),
    )
    # politics would be 2600 of a 2700 book, far over the 40% cap
    assert safety.entry_allowed(usd_size=200.0, leg="slow", category="politics").tripped


def test_concentration_cap_does_not_block_an_empty_book():
    """The first position is always 100% of open exposure; the cap must not trip on it.

    Concentration is measured against the TARGET deployed book, not the current
    one, so an early position is judged against the book it is being built into.
    """
    ledger.seed_if_empty()
    assert not safety.entry_allowed(usd_size=400.0, leg="fast", category="politics").tripped


def test_entry_caps_still_enforced_on_unseeded_treasury():
    """An unseeded treasury must fail closed to the bankroll fallback, not bypass caps."""
    from agent.config import settings

    # Deliberately do NOT call ledger.seed_if_empty(): balance() is 0.
    oversized = settings.agent_bankroll * safety.MAX_POSITION_FRACTION + 1.0
    chk = safety.entry_allowed(usd_size=oversized, leg="fast", category="politics")
    assert chk.tripped
    assert "position_cap" in chk.name


def test_entry_rejects_with_no_book_at_all(monkeypatch):
    from agent.config import settings

    # Unseeded treasury AND no bankroll fallback: must reject, not silently allow.
    monkeypatch.setattr(settings, "agent_bankroll", 0.0)
    chk = safety.entry_allowed(usd_size=1.0, leg="fast", category="politics")
    assert chk.tripped
    assert chk.name == "entry.no_book"


def test_no_leverage_size_never_exceeds_sleeve_headroom():
    """No leverage: sizing draws only against a positive sleeve, with no borrowing path."""
    from agent.strategy import sizing
    from agent.treasury import legs

    ledger.seed_if_empty()
    for leg in (legs.FAST, legs.SLOW):
        sleeve = ledger.balance() * legs.sleeve_fraction(leg)
        sd = sizing.size_position(
            p_agent=0.99, p_market=0.01, leg=leg, calibration_mul=1.0, per_market_cap=1e9
        )
        assert 0.0 <= sd.usd <= sleeve


def test_no_leverage_empty_treasury_sizes_to_zero(monkeypatch):
    from agent.strategy import sizing

    monkeypatch.setattr(ledger, "balance", lambda: 0.0)
    monkeypatch.setattr("agent.config.settings.agent_bankroll", 0.0)
    sd = sizing.size_position(
        p_agent=0.99, p_market=0.01, leg="fast", calibration_mul=1.0, per_market_cap=1e9
    )
    assert sd.usd == 0.0


def _open_and_close(*, notional_in: float, notional_out: float) -> None:
    from agent.store import db

    with db.connect() as conn:
        pos_id = db.open_position(
            conn,
            {
                "market_id": "m-daily-loss",
                "venue": "manifold",
                "side": "YES",
                "shares": 10.0,
                "entry_price": 0.5,
                "notional_in": notional_in,
            },
        )
        db.close_position(
            conn,
            pos_id,
            exit_price=0.1,
            notional_out=notional_out,
            exit_decision_id=None,
            venue_exit_order=None,
            p_yes_at_exit=0.1,
        )


def test_daily_loss_threshold_scales_with_treasury(monkeypatch):
    """The cap is 20% of the notional TREASURY (10_000), not the legacy $50 bankroll.

    `db.close_position` does not itself move the ledger, so the treasury balance
    stays at the seeded value for both checks below.
    """
    from agent.config import settings

    ledger.seed_if_empty()
    book = ledger.balance()
    assert book == settings.agent_treasury_seed

    # Loss bigger than 20% of agent_bankroll (-10) but well inside 20% of treasury (-2000).
    _open_and_close(notional_in=100.0, notional_out=85.0)  # pnl = -15
    assert not safety.check_daily_loss().tripped


def test_daily_loss_threshold_trips_beyond_treasury_cap():
    from agent.store import db

    ledger.seed_if_empty()
    book = ledger.balance()
    threshold = -0.20 * book
    loss = threshold - 1.0  # just past the treasury-scaled cap

    with db.connect() as conn:
        pos_id = db.open_position(
            conn,
            {
                "market_id": "m-daily-loss-2",
                "venue": "manifold",
                "side": "YES",
                "shares": 10.0,
                "entry_price": 0.5,
                "notional_in": 3000.0,
            },
        )
        db.close_position(
            conn,
            pos_id,
            exit_price=0.1,
            notional_out=3000.0 + loss,
            exit_decision_id=None,
            venue_exit_order=None,
            p_yes_at_exit=0.1,
        )
    assert safety.check_daily_loss().tripped


def test_risk_params_exported_for_dashboard():
    for key in (
        "max_position_fraction",
        "fast_leg_deployment_cap",
        "slow_leg_cap",
        "category_concentration_cap",
        "drawdown_kill_switch",
    ):
        assert key in safety.RISK_PARAMS


def test_deploying_capital_does_not_trip_the_drawdown_kill_switch():
    """Regression: filling the fast sleeve to its own published cap is NOT a loss.

    `entry_allowed` permits the fast leg up to 25% of the book. Under a cash-based
    drawdown that alone reads as a 20%+ drawdown and permanently kill-switches the
    agent at zero P&L. Drawdown is measured against EQUITY (cash + deployed).
    """
    from agent.store import db

    ledger.seed_if_empty()
    with db.connect() as conn:
        for i in range(5):
            db.open_position(conn, {
                "market_id": f"manifold:dd{i}", "venue": "manifold", "side": "YES",
                "shares": 1000.0, "entry_price": 0.5, "notional_in": 500.0, "leg": "fast",
            })
    assert ledger.balance() == 7500.0
    assert ledger.equity() == 10000.0
    assert ledger.drawdown() == 0.0
    assert not safety.check_drawdown().tripped


def test_drawdown_measures_realized_loss_on_equity():
    from agent.store import db

    ledger.seed_if_empty()
    with db.connect() as conn:
        pid = db.open_position(conn, {
            "market_id": "manifold:dd-loss", "venue": "manifold", "side": "YES",
            "shares": 1000.0, "entry_price": 0.5, "notional_in": 3000.0, "leg": "fast",
        })
        # a total loss on 3000 of a 10000 equity book = 30% drawdown
        db.close_position(
            conn, pid, exit_price=0.0, notional_out=0.0,
            exit_decision_id=None, venue_exit_order=None, p_yes_at_exit=0.0,
        )
    assert ledger.equity() == 7000.0
    assert ledger.drawdown() == 0.30
    assert safety.check_drawdown().tripped
