"""Profit flywheel accounting — SIMULATED.

Every profitable settlement splits realized notional profit 50/35/15 across the
treasury, an $ANSEM open-market buy, and an operational reserve. Losing
settlements write nothing: the flywheel fires only on profit, which is the
substance of the "buy pressure is earned, not recycled" claim.

Nothing here executes a transaction. The one real input is the $ANSEM spot price,
fetched live and stored on each event alongside its source, so the quantities are
what the mechanism WOULD have bought at a real, checkable price — reproducible by
a third party rather than derived from a made-up constant.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx

from agent.config import settings
from agent.logging import get_logger
from agent.store import db

log = get_logger(__name__)

TREASURY_SHARE = 0.50
ANSEM_SHARE = 0.35
RESERVE_SHARE = 0.15

SIMULATION_NOTICE = (
    "Simulated — this is what the flywheel would have distributed from paper-mode "
    "trades. No tokens have been purchased or distributed."
)


def ansem_price_usd() -> tuple[float | None, str]:
    """Live $ANSEM spot price. Returns (price, source); (None, reason) on failure.

    A failed fetch must never block a settlement and must never substitute a stale
    price — the event is written with a null price instead.
    """
    mint = settings.ansem_token_mint
    if not mint:
        return None, "unconfigured"
    try:
        resp = httpx.get(f"{settings.ansem_price_url}{mint}", timeout=10.0)
        resp.raise_for_status()
        pairs = resp.json().get("pairs") or []
        if not pairs:
            return None, "no_pairs"
        return float(pairs[0]["priceUsd"]), "dexscreener"
    except Exception as e:  # noqa: BLE001 — price is best-effort by design
        log.warning("flywheel.price_fetch_failed", error=str(e))
        return None, "unavailable"


def on_settlement(position_id: int, realized_pnl: float) -> dict[str, Any] | None:
    """Record one flywheel event for a profitable settlement. Idempotent per position."""
    if realized_pnl <= 0:
        return None
    with db.connect() as conn:
        existing = db._first(
            conn.table("flywheel_events").select("id")
            .eq("position_id", position_id).limit(1).execute()
        )
        if existing:
            return None

    price, source = ansem_price_usd()
    ansem_usd = round(realized_pnl * ANSEM_SHARE, 6)
    reserve_usd = round(realized_pnl * RESERVE_SHARE, 6)
    event = {
        "position_id": position_id,
        "realized_pnl": round(realized_pnl, 6),
        "treasury_share": round(realized_pnl * TREASURY_SHARE, 6),
        "ansem_share": ansem_usd,
        "reserve_share": reserve_usd,
        "ansem_price_usd": price,
        # A negative price is truthy but would yield a negative quantity — guard it.
        "ansem_qty": round(ansem_usd / price, 6) if price and price > 0 else None,
        "price_source": source,
        "mode": "paper",
        "created_at": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    with db.connect() as conn:
        row = db._first(conn.table("flywheel_events").insert(dict(event)).execute())
        assert row is not None  # an insert always returns its representation
        eid = int(row["id"])
    # Debit the money that LEAVES the book: the $ANSEM buy plus the reserve. The
    # 50% treasury share is NOT credited here — `db.close_position` already credited
    # the full proceeds via the `settlement` event, so crediting it again would
    # double-count. Net effect: the treasury keeps 50% of the profit.
    outflow = ansem_usd + reserve_usd
    if outflow > 0:
        from agent.treasury import ledger
        ledger.record("flywheel_split", -outflow, position_id=position_id)
    log.info("flywheel.split", position_id=position_id, ansem_usd=ansem_usd, price=price)
    return {"id": eid, **event}


def events(limit: int = 50) -> list[dict[str, Any]]:
    with db.connect() as conn:
        res = (
            conn.table("flywheel_events").select("*")
            .order("id", desc=True).limit(limit).execute()
        )
        return [db._row(e) for e in db._rows(res)]


def totals() -> dict[str, Any]:
    """Aggregates over the event log. No stored counters — everything is replayable."""
    treasury_usd = ansem_usd = ansem_qty = reserve_usd = profit = 0.0
    n = 0
    with db.connect() as conn:
        # Paged: totals are a full replay of the event log, so a truncated
        # read would silently under-report every aggregate below.
        for e in db.fetch_all(lambda: conn.table("flywheel_events").select("*")):
            n += 1
            profit += float(e.get("realized_pnl") or 0.0)
            treasury_usd += float(e.get("treasury_share") or 0.0)
            ansem_usd += float(e.get("ansem_share") or 0.0)
            ansem_qty += float(e.get("ansem_qty") or 0.0)
            reserve_usd += float(e.get("reserve_share") or 0.0)
    return {
        "event_count": n,
        "realized_profit_usd": round(profit, 6),
        "treasury_usd": round(treasury_usd, 6),
        "ansem_usd": round(ansem_usd, 6),
        "ansem_qty": round(ansem_qty, 6),
        "reserve_usd": round(reserve_usd, 6),
        "mode": "paper",
        "simulated": True,
        "notice": SIMULATION_NOTICE,
    }
