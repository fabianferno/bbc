"""Append-only notional treasury ledger.

The authoritative balance is the sum of `amount` over `treasury_events`. The
`balance` field on the singleton `treasury` document is a cache, recomputed on
every write and verifiable by replay — so any figure on the dashboard can be
reconstructed from the trade history alone.

The book is NOTIONAL USD. Execution happens in Manifold play-money; nothing here
represents realized cash.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from agent.config import settings
from agent.store import db

CURRENCY = "USD_NOTIONAL"
TREASURY_DOC_ID = "main"

KINDS = ("seed", "entry", "settlement", "flywheel_split")


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def replay_balance() -> float:
    """Authoritative balance: sum of every event amount."""
    with db.connect() as conn:
        return round(sum(float(e.get("amount") or 0.0) for e in conn["treasury_events"].find()), 6)


def _doc() -> dict[str, Any] | None:
    with db.connect() as conn:
        return conn["treasury"].find_one({"_id": TREASURY_DOC_ID})


def seed_if_empty() -> None:
    """Create the treasury document and its seed event. Idempotent."""
    if _doc() is not None:
        return
    amount = float(settings.agent_treasury_seed)
    with db.connect() as conn:
        conn["treasury"].insert_one(
            {
                "_id": TREASURY_DOC_ID,
                "currency": CURRENCY,
                "seed": amount,
                "balance": 0.0,
                "high_water_mark": 0.0,
                "updated_at": _now(),
            }
        )
    record("seed", amount)


def record(
    kind: str,
    amount: float,
    *,
    position_id: int | None = None,
    leg: str | None = None,
) -> float:
    """Append one event, refresh the cached balance and HWM, return the new balance."""
    if kind not in KINDS:
        raise ValueError(f"unknown treasury event kind: {kind}")
    with db.connect() as conn:
        eid = db.next_id(conn, "treasury_events")
        new_balance = round(replay_balance() + float(amount), 6)
        conn["treasury_events"].insert_one(
            {
                "_id": eid,
                "kind": kind,
                "amount": float(amount),
                "balance_after": new_balance,
                "position_id": position_id,
                "leg": leg,
                "mode": settings.agent_mode,
                "created_at": _now(),
            }
        )
        doc = conn["treasury"].find_one({"_id": TREASURY_DOC_ID}) or {}
        hwm = max(float(doc.get("high_water_mark") or 0.0), new_balance)
        conn["treasury"].update_one(
            {"_id": TREASURY_DOC_ID},
            {"$set": {"balance": new_balance, "high_water_mark": hwm, "updated_at": _now()}},
            upsert=True,
        )
    return new_balance


def balance() -> float:
    doc = _doc()
    return float(doc.get("balance") or 0.0) if doc else 0.0


def high_water_mark() -> float:
    doc = _doc()
    return float(doc.get("high_water_mark") or 0.0) if doc else 0.0


def drawdown() -> float:
    """Fraction below the high-water mark. 0.0 when the HWM is 0."""
    hwm = high_water_mark()
    if hwm <= 0:
        return 0.0
    return max(0.0, (hwm - balance()) / hwm)


def events(limit: int = 100) -> list[dict[str, Any]]:
    with db.connect() as conn:
        cur = conn["treasury_events"].find().sort("_id", -1).limit(limit)
        return [db._row(e) for e in cur]


def deployed(leg: str | None = None) -> float:
    """Notional currently at risk in open positions, optionally for one leg."""
    with db.connect() as conn:
        q: dict[str, Any] = {"status": "open", "venue": {"$ne": "simulated"}}
        if leg:
            q["leg"] = leg
        return round(sum(float(p.get("notional_in") or 0.0) for p in conn["positions"].find(q)), 6)


def snapshot() -> dict[str, Any]:
    doc = _doc() or {}
    return {
        "currency": CURRENCY,
        "seed": float(doc.get("seed") or 0.0),
        "balance": balance(),
        "high_water_mark": high_water_mark(),
        "drawdown": drawdown(),
        "updated_at": doc.get("updated_at"),
    }
