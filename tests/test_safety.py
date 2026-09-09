import contextlib

from agent.execution import safety


def test_all_clear_when_fresh():
    ok, checks = safety.all_clear()
    assert ok
    assert all(not c.tripped for c in checks)


def test_manual_breaker_round_trip():
    safety.trip_manual("test")
    ok, _ = safety.all_clear()
    assert not ok
    safety.reset_manual()
    ok2, _ = safety.all_clear()
    assert ok2


def test_slippage_check():
    assert safety.slippage_ok(0.4, 0.405)
    assert not safety.slippage_ok(0.4, 0.45)
    assert not safety.slippage_ok(0, 0.4)


@contextlib.contextmanager
def _null_conn(*a, **k):
    yield None


# --- Venue minimum bet size ------------------------------------------------
# Manifold 400s on any bet below 1 mana. Kelly output scaled by the calibration
# multiplier lands under that for marginal-edge entries, so the executor rounds up
# — but must never breach the per-market cap to do it.

def test_sub_minimum_stake_is_raised_to_venue_floor(monkeypatch):
    from agent.execution import paper

    sent = {}

    class FakeClient:
        def place_bet(self, *, contract_id, outcome, amount, limit_prob):
            sent.update(amount=amount, limit_prob=limit_prob, outcome=outcome)
            return {"id": "b1", "shares": 2.0, "probAfter": 0.5}

    ex = paper.ManifoldExecutor.__new__(paper.ManifoldExecutor)
    ex._client = FakeClient()
    monkeypatch.setattr(paper.db, "connect", _null_conn)
    monkeypatch.setattr(paper.db, "record_order", lambda *a, **k: 1)
    monkeypatch.setattr(paper.db, "update_order", lambda *a, **k: None)
    monkeypatch.setattr(paper.db, "open_position", lambda *a, **k: 1)

    ex.place_entry(
        market={"id": "manifold:x", "external_id": "x"},
        side="YES", usd_size=0.72, target_price=0.5, decision_id=None,
    )
    assert sent["amount"] == paper.MIN_BET_MANA


def test_stake_above_minimum_is_not_altered(monkeypatch):
    from agent.execution import paper

    sent = {}

    class FakeClient:
        def place_bet(self, *, contract_id, outcome, amount, limit_prob):
            sent.update(amount=amount)
            return {"id": "b1", "shares": 2.0, "probAfter": 0.5}

    ex = paper.ManifoldExecutor.__new__(paper.ManifoldExecutor)
    ex._client = FakeClient()
    monkeypatch.setattr(paper.db, "connect", _null_conn)
    monkeypatch.setattr(paper.db, "record_order", lambda *a, **k: 1)
    monkeypatch.setattr(paper.db, "update_order", lambda *a, **k: None)
    monkeypatch.setattr(paper.db, "open_position", lambda *a, **k: 1)

    ex.place_entry(
        market={"id": "manifold:x", "external_id": "x"},
        side="YES", usd_size=1.8, target_price=0.5, decision_id=None,
    )
    assert sent["amount"] == 1.8


def test_venue_minimum_never_breaches_per_market_cap(monkeypatch):
    """If the floor exceeds the cap the position is not expressible — refuse it."""
    import pytest

    from agent.execution import paper

    monkeypatch.setattr(paper.settings, "agent_per_market_cap", 0.5, raising=False)
    ex = paper.ManifoldExecutor.__new__(paper.ManifoldExecutor)
    ex._client = None
    with pytest.raises(ValueError, match="exceeds per-market cap"):
        ex.place_entry(
            market={"id": "manifold:x", "external_id": "x"},
            side="YES", usd_size=0.2, target_price=0.5, decision_id=None,
        )
