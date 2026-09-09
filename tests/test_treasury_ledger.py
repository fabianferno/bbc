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
