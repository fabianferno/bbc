"""A scale-in is a fresh entry: it must inherit the position's leg and clear the
same published risk limits as any other entry."""

from __future__ import annotations

from typing import Any

import pytest

from agent.monitor import positions as monitor
from agent.store import db
from agent.strategy import exit as exit_mod
from agent.treasury import ledger


class _RecordingExecutor:
    def __init__(self) -> None:
        self.entries: list[dict[str, Any]] = []

    def place_entry(self, **kw: Any) -> dict[str, Any]:
        self.entries.append(kw)
        return {}

    def close_position(self, **kw: Any) -> dict[str, Any]:  # pragma: no cover
        raise AssertionError("close_position must not be called in these tests")


def _setup(monkeypatch, *, notional_in: float, leg: str) -> int:
    ledger.seed_if_empty()
    with db.connect() as conn:
        mid = db.upsert_market(
            conn,
            {
                "venue": "manifold",
                "external_id": "si-1",
                "question": "Scale in?",
                "category": "politics",
            },
        )
        pid = db.open_position(
            conn,
            {
                "market_id": mid,
                "venue": "manifold",
                "leg": leg,
                "side": "YES",
                "shares": 10.0,
                "entry_price": 0.5,
                "notional_in": notional_in,
            },
        )
    monkeypatch.setattr(monitor, "_refresh_market_price", lambda m: 0.5)
    monkeypatch.setattr(
        exit_mod,
        "plan_exit",
        lambda **kw: exit_mod.ExitPlan(
            action="scale_in",
            reason="test",
            position_id=kw["position"]["id"],
            size_fraction=0.5,
        ),
    )
    return pid


@pytest.mark.parametrize("leg", ["fast", "slow"])
def test_scale_in_inherits_the_positions_leg(monkeypatch, leg):
    _setup(monkeypatch, notional_in=1.0, leg=leg)
    exe = _RecordingExecutor()
    assert monitor.reevaluate_all(exe) == 1
    assert exe.entries[0]["leg"] == leg


def test_scale_in_is_blocked_by_the_position_cap(monkeypatch):
    """A scale-in above 5% of the book must be rejected, not silently placed."""
    _setup(monkeypatch, notional_in=2000.0, leg="fast")
    exe = _RecordingExecutor()
    # per-market cap leaves headroom, but 5% of the 10_000 equity book is 500 and
    # the scale-in would be 1000 — `entry_allowed` must reject it.
    monkeypatch.setattr(monitor.settings, "agent_per_market_cap", 10_000.0)
    assert monitor.reevaluate_all(exe) == 0
    assert exe.entries == []
