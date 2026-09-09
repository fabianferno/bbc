"""Circuit breakers (PRD §6.3).

Hard-coded, not bypassable by LLM. Each check returns a `BreakerCheck` with `tripped:bool`
and a reason. The agent loop must abort entry placement if any breaker is tripped.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from agent.config import settings
from agent.logging import get_logger
from agent.store import db
from agent.treasury import ledger, legs

log = get_logger(__name__)

API_FAILURE_THRESHOLD = 3
API_FAILURE_COOLDOWN = timedelta(hours=1)
DAILY_LOSS_COOLDOWN = timedelta(hours=24)

# Published risk parameters. The dashboard renders these directly, so a number
# pinned in the UI can never drift from the limit the code enforces.
MAX_POSITION_FRACTION = 0.05        # of treasury, per position
FAST_LEG_DEPLOYMENT_CAP = 0.25      # of treasury, simultaneously at risk on the fast leg
SLOW_LEG_CAP = 0.20                 # of treasury, total slow-leg exposure
CATEGORY_CONCENTRATION_CAP = 0.40   # of total open exposure, per category
DRAWDOWN_KILL_SWITCH = 0.20         # below the high-water mark

RISK_PARAMS: dict[str, float] = {
    "max_position_fraction": MAX_POSITION_FRACTION,
    "fast_leg_deployment_cap": FAST_LEG_DEPLOYMENT_CAP,
    "slow_leg_cap": SLOW_LEG_CAP,
    "category_concentration_cap": CATEGORY_CONCENTRATION_CAP,
    "drawdown_kill_switch": DRAWDOWN_KILL_SWITCH,
    "fast_sleeve": legs.FAST_SLEEVE,
    "slow_sleeve": legs.SLOW_SLEEVE,
    "fast_leg_max_hours": float(legs.FAST_LEG_MAX_HOURS),
}


@dataclass(slots=True)
class BreakerCheck:
    name: str
    tripped: bool
    reason: str | None = None


def _expired(expires_at: str | None) -> bool:
    if not expires_at:
        return False
    try:
        exp = datetime.fromisoformat(expires_at)
        return datetime.now(UTC) >= exp
    except ValueError:
        return False


def _check_persisted(name: str) -> BreakerCheck:
    with db.connect() as conn:
        state = db.breaker_status(conn, name)
    if not state or not state["tripped"]:
        return BreakerCheck(name, False)
    if _expired(state.get("expires_at")):
        with db.connect() as conn:
            db.set_breaker(conn, name, tripped=False)
        return BreakerCheck(name, False)
    return BreakerCheck(name, True, state.get("reason") or "tripped")


def check_daily_loss() -> BreakerCheck:
    persisted = _check_persisted("daily_loss")
    if persisted.tripped:
        return persisted
    with db.connect() as conn:
        pnl = db.positions_today_pnl(conn)
    # Denominate against the notional treasury EQUITY — cash plus notional deployed in
    # open positions (sizing.py draws position size from the same book) — falling back
    # to agent_bankroll only when the treasury is unseeded. Cash alone would shrink the
    # loss cap merely because capital is at work.
    book = ledger.equity() or settings.agent_bankroll
    threshold = -settings.agent_daily_loss_cap * book
    if pnl <= threshold:
        expires = (datetime.now(UTC) + DAILY_LOSS_COOLDOWN).isoformat()
        with db.connect() as conn:
            db.set_breaker(
                conn, "daily_loss", tripped=True,
                reason=f"pnl={pnl:.2f} <= threshold={threshold:.2f}",
                expires_at=expires,
            )
        return BreakerCheck("daily_loss", True, f"daily_loss:{pnl:.2f}")
    return BreakerCheck("daily_loss", False)


def check_drawdown() -> BreakerCheck:
    """Kill-switch: halt all new positions at DRAWDOWN_KILL_SWITCH below the equity HWM.

    Deliberately persisted with NO expiry, unlike `daily_loss`'s 24-hour cooldown.
    Clearing it requires an explicit `reset-breaker` plus a published reassessment.
    That absence of auto-expiry is what makes this a kill-switch and not a pause.
    """
    persisted = _check_persisted("drawdown")
    if persisted.tripped:
        return persisted
    dd = ledger.drawdown()
    if dd >= DRAWDOWN_KILL_SWITCH:
        with db.connect() as conn:
            db.set_breaker(
                conn, "drawdown", tripped=True,
                reason=f"drawdown={dd:.4f} >= {DRAWDOWN_KILL_SWITCH}",
            )
        log.error("breaker.drawdown.tripped", drawdown=dd)
        return BreakerCheck("drawdown", True, f"drawdown:{dd:.4f}")
    return BreakerCheck("drawdown", False)


def _open_exposure_by_category() -> tuple[dict[str, float], float]:
    """(exposure per category, total exposure) across open non-backtest positions."""
    by_cat: dict[str, float] = {}
    total = 0.0
    with db.connect() as conn:
        open_rows = db._rows(
            conn.table("positions").select("*")
            .eq("status", "open").neq("venue", "simulated").execute()
        )
        ids = list({r["market_id"] for r in open_rows})
        markets = (
            {m["id"]: m for m in db._rows(conn.table("markets").select("*").in_("id", ids).execute())}
            if ids else {}
        )
    for r in open_rows:
        cat = ((markets.get(r["market_id"]) or {}).get("category") or "uncategorised").lower()
        amt = float(r.get("notional_in") or 0.0)
        by_cat[cat] = by_cat.get(cat, 0.0) + amt
        total += amt
    return by_cat, total


def entry_allowed(*, usd_size: float, leg: str, category: str) -> BreakerCheck:
    """Per-candidate risk checks.

    These REJECT ONE CANDIDATE rather than halting the agent, so they are not part
    of `all_clear()`. Returns a tripped BreakerCheck naming the limit that blocked
    the entry, or an untripped one named `entry_allowed`.
    """
    # Same fallback book as sizing.py and check_daily_loss, so all three risk call
    # sites agree on what "the book" means. With no book at all there is no
    # denominator, so no position can be justified — fail closed, not open.
    book = ledger.equity() or settings.agent_bankroll
    if book <= 0:
        return BreakerCheck(
            "entry.no_book", True, "treasury unseeded and no bankroll fallback",
        )

    if usd_size > book * MAX_POSITION_FRACTION:
        return BreakerCheck(
            "entry.position_cap", True,
            f"size={usd_size:.2f} > {MAX_POSITION_FRACTION:.0%} of treasury {book:.2f}",
        )

    cap = FAST_LEG_DEPLOYMENT_CAP if leg == legs.FAST else SLOW_LEG_CAP
    if ledger.deployed(leg) + usd_size > book * cap:
        return BreakerCheck(
            "entry.leg_allocation", True,
            f"leg={leg} deployed+new > {cap:.0%} of treasury",
        )

    by_cat, total = _open_exposure_by_category()
    cat = (category or "uncategorised").lower()
    # Measure concentration against the TARGET deployed book, not merely the current
    # one. A single position is always 100% of a one-position book, so a raw ratio
    # would reject every opening trade. The denominator is therefore the larger of
    # the book after this entry and the fast-leg deployment target, which lets the
    # book be built up and starts biting once real exposure exists.
    denominator = max(total + usd_size, book * FAST_LEG_DEPLOYMENT_CAP)
    if denominator > 0 and (by_cat.get(cat, 0.0) + usd_size) / denominator > CATEGORY_CONCENTRATION_CAP:
        return BreakerCheck(
            "entry.category_concentration", True,
            f"category={cat} > {CATEGORY_CONCENTRATION_CAP:.0%} of the target book",
        )

    return BreakerCheck("entry_allowed", False)


def check_position_count() -> BreakerCheck:
    with db.connect() as conn:
        n = len(db.open_positions(conn))
    if n >= settings.agent_max_positions:
        return BreakerCheck("position_count", True, f"open={n}>={settings.agent_max_positions}")
    return BreakerCheck("position_count", False)


def check_api_failures() -> BreakerCheck:
    return _check_persisted("api_failures")


def record_api_failure() -> None:
    """Increment API failure count; trip the breaker if past threshold."""
    with db.connect() as conn:
        state = db.breaker_status(conn, "api_failures")
        count = int((state or {}).get("reason", "0").split(":")[-1] or 0) + 1 if state else 1
        if count >= API_FAILURE_THRESHOLD:
            expires = (datetime.now(UTC) + API_FAILURE_COOLDOWN).isoformat()
            db.set_breaker(
                conn, "api_failures", tripped=True,
                reason=f"consecutive_failures:{count}",
                expires_at=expires,
            )
            log.error("breaker.api_failures.tripped", count=count)
        else:
            db.set_breaker(
                conn, "api_failures", tripped=False,
                reason=f"consecutive_failures:{count}",
            )


def record_api_success() -> None:
    with db.connect() as conn:
        db.set_breaker(conn, "api_failures", tripped=False, reason="consecutive_failures:0")


def check_manual() -> BreakerCheck:
    return _check_persisted("manual")


def breaker_snapshot() -> list[dict[str, Any]]:
    """Read persisted breaker state WITHOUT evaluating or mutating anything.

    `all_clear()` is the enforcement path: its checks persist trips and clear
    expired ones as a side effect. Read-only consumers (the public dashboard)
    must never call it — a GET must not be able to trip the kill-switch.
    """
    with db.connect() as conn:
        rows = db.all_breakers(conn)
    return [
        {
            "name": r.get("name"),
            "tripped": bool(r.get("tripped")),
            "reason": r.get("reason"),
            "expires_at": r.get("expires_at"),
        }
        for r in rows
    ]


def all_clear() -> tuple[bool, list[BreakerCheck]]:
    """Return (ok, list_of_checks). ok=True iff none are tripped."""
    checks = [
        check_daily_loss(),
        check_drawdown(),
        check_position_count(),
        check_api_failures(),
        check_manual(),
    ]
    return all(not c.tripped for c in checks), checks


def slippage_ok(quoted: float, executed: float, *, max_pct: float = 0.02) -> bool:
    if quoted <= 0:
        return False
    return abs(executed - quoted) / quoted <= max_pct


def trip_manual(reason: str) -> None:
    with db.connect() as conn:
        db.set_breaker(conn, "manual", tripped=True, reason=reason)


def reset_manual() -> None:
    with db.connect() as conn:
        db.set_breaker(conn, "manual", tripped=False, reason="cleared")
