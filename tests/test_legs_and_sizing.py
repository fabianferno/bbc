from agent.strategy import sizing
from agent.treasury import ledger, legs


def test_classify_by_intended_hold():
    assert legs.classify(6) == "fast"
    assert legs.classify(48) == "fast"
    assert legs.classify(49) == "slow"
    assert legs.classify(None) == "slow"  # unknown hold is conservative


def test_sleeve_fractions():
    assert legs.sleeve_fraction("fast") == 0.80
    assert legs.sleeve_fraction("slow") == 0.20


def test_size_draws_against_leg_sleeve():
    ledger.seed_if_empty()  # 10_000 notional
    fast = sizing.size_position(
        p_agent=0.70, p_market=0.50, leg="fast", calibration_mul=1.0, per_market_cap=1e9
    )
    slow = sizing.size_position(
        p_agent=0.70, p_market=0.50, leg="slow", calibration_mul=1.0, per_market_cap=1e9
    )
    # both hit the 5% cap of their own sleeve: 0.05 * 8000 vs 0.05 * 2000
    assert abs(fast.usd - 400.0) < 1e-6
    assert abs(slow.usd - 100.0) < 1e-6


def test_exhausted_sleeve_returns_zero_and_never_borrows(monkeypatch):
    ledger.seed_if_empty()
    # pretend the whole slow sleeve is already deployed
    monkeypatch.setattr(ledger, "deployed", lambda leg=None: 2000.0 if leg == "slow" else 0.0)
    sd = sizing.size_position(
        p_agent=0.70, p_market=0.50, leg="slow", calibration_mul=1.0, per_market_cap=1e9
    )
    assert sd.usd == 0.0
    assert sd.reason == "leg_sleeve_full"
