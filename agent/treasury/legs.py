"""Barbell legs, classified by INTENDED HOLD DURATION rather than market category.

`prd.md` §5.2 excludes sub-hour crypto and sports as zero-edge categories. The
barbell therefore splits by how long a position is meant to be held, reusing the
continuous-exit model of §5.4: the fast leg is a discipline about hold time and
size, not a bet on a different kind of market.

The leg is fixed when the position opens and never reclassified — a fast trade
that drifts into a week-long hold is reported as a FAILED FAST TRADE, which is
what keeps the separately-reported leg win rates meaningful.
"""

from __future__ import annotations

FAST_LEG_MAX_HOURS = 48

FAST_SLEEVE = 0.80
SLOW_SLEEVE = 0.20

FAST = "fast"
SLOW = "slow"


def classify(intended_hold_hours: float | None) -> str:
    """Fast if the position is meant to be closed within FAST_LEG_MAX_HOURS.

    An unknown intended hold classifies as `slow`: the slow sleeve is the smaller
    one, so an unclassifiable trade consumes the more constrained budget.
    """
    if intended_hold_hours is None:
        return SLOW
    return FAST if float(intended_hold_hours) <= FAST_LEG_MAX_HOURS else SLOW


def sleeve_fraction(leg: str) -> float:
    return FAST_SLEEVE if leg == FAST else SLOW_SLEEVE
