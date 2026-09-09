"""Position sizing (PRD §5.6).

Calibration-adjusted fractional Kelly:

    f* = (p*b - (1-p)) / b        where b = (1 - q) / q

    size = bankroll
           × min( 0.25 * f*,
                  max_position_cap,
                  0.05 * bankroll )
           × calibration_multiplier[category]

Always returns a non-negative USD amount, capped by phase rules. If the recommended
fraction is non-positive (no edge), returns 0.
"""

from __future__ import annotations

from dataclasses import dataclass

from agent.config import settings
from agent.treasury import ledger, legs


def kelly_fraction(p_agent: float, p_market: float) -> float:
    """Kelly fraction for a YES-side bet at market price q = p_market.

    A YES share bought at price q pays $1 with probability p, so the gross odds-to-one
    on the stake are (1 - q) / q.
    """
    if not (0.0 < p_market < 1.0):
        return 0.0
    b = (1.0 - p_market) / p_market
    if b <= 0:
        return 0.0
    f = (p_agent * b - (1.0 - p_agent)) / b
    return max(0.0, f)


@dataclass(slots=True)
class SizeDecision:
    usd: float
    side: str               # 'YES' or 'NO'
    kelly_full: float
    kelly_fractional: float
    calibration_mul: float
    reason: str
    leg: str = legs.SLOW


def size_position(
    *,
    p_agent: float,
    p_market: float,
    leg: str = legs.SLOW,
    bankroll: float | None = None,
    per_market_cap: float | None = None,
    calibration_mul: float = 0.5,
    kelly_fraction_of_full: float = 0.25,
    max_bankroll_fraction: float = 0.05,
) -> SizeDecision:
    """Choose direction (YES if p_agent > p_market, else NO) and USD size.

    Sizing draws against this leg's SLEEVE of the notional treasury — 80% for the
    fast leg, 20% for the slow leg. A leg never borrows from the other sleeve: if
    its sleeve is fully deployed, the size is 0 with reason `leg_sleeve_full`.

    For a NO side, we flip both probabilities: bet on (1 - p_agent) at price (1 - p_market).
    """
    headroom: float | None = None
    if bankroll is None:
        treasury = ledger.balance() or settings.agent_bankroll
        sleeve = treasury * legs.sleeve_fraction(leg)
        headroom = sleeve - ledger.deployed(leg)
        if headroom <= 0:
            return SizeDecision(0.0, "YES", 0.0, 0.0, calibration_mul, "leg_sleeve_full", leg)
        bankroll = sleeve
    per_market_cap = per_market_cap if per_market_cap is not None else settings.agent_per_market_cap

    if p_agent >= p_market:
        side = "YES"
        p, q = p_agent, p_market
    else:
        side = "NO"
        p, q = 1.0 - p_agent, 1.0 - p_market

    f_full = kelly_fraction(p, q)
    if f_full <= 0:
        return SizeDecision(0.0, side, 0.0, 0.0, calibration_mul, "no_edge", leg)

    f_frac = f_full * kelly_fraction_of_full

    raw_usd = bankroll * min(f_frac, max_bankroll_fraction)
    capped_usd = min(raw_usd, per_market_cap)
    final_usd = capped_usd * calibration_mul
    if headroom is not None:
        final_usd = min(final_usd, headroom)

    return SizeDecision(
        usd=max(0.0, final_usd),
        side=side,
        kelly_full=f_full,
        kelly_fractional=f_frac,
        calibration_mul=calibration_mul,
        reason="ok",
        leg=leg,
    )
