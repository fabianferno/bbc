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


def test_risk_params_exported_for_dashboard():
    for key in (
        "max_position_fraction",
        "fast_leg_deployment_cap",
        "slow_leg_cap",
        "category_concentration_cap",
        "drawdown_kill_switch",
    ):
        assert key in safety.RISK_PARAMS
