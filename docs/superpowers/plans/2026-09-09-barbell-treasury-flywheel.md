# Barbell Strategy, Notional Treasury & Profit Flywheel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the BBC agent a notional USD treasury, a hold-duration barbell allocation, code-enforced risk breakers, reproducible flywheel accounting, and a public transparency dashboard.

**Architecture:** A new `agent/treasury/` package owns an append-only event ledger whose balance is always derived by replay, never assigned. Position sizing draws against a per-leg sleeve of that balance; risk parameters become real circuit breakers in `agent/execution/safety.py` (a global drawdown kill-switch plus three per-candidate entry checks). Treasury and flywheel events are written from inside `agent/store/db.py`'s `open_position` / `close_position`, so every executor is covered without touching executor code. FastAPI exposes three read endpoints that the Next.js app renders.

**Tech Stack:** Python 3.11+, pydantic-settings, pymongo (MongoDB; mongomock in tests), pytest, FastAPI, Next.js 15 / React / TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-09-barbell-treasury-flywheel-design.md`

## Global Constraints

- **Mode honesty.** The shipped alpha runs in `paper` mode. Never describe paper P&L as realized cash in code, logs, UI copy, or docs. Every performance figure carries the mode that produced it.
- **Notional labeling.** The treasury is notional. The word "notional" must appear within one glance of any treasury or P&L figure on any surface.
- **Simulation labeling is structural.** Every flywheel event document carries `mode: "paper"`; every API response carries `simulated: true`. The label lives in the data model, not only in CSS.
- **Fixed flywheel notice copy**, used verbatim: `Simulated — this is what the flywheel would have distributed from paper-mode trades. No tokens have been purchased or distributed.`
- **Published parameters are enforced parameters.** The dashboard renders risk numbers from the same exported constants the breakers use. A pinned number the code does not enforce is a defect.
- **Balances and totals are derived.** Treasury balance and flywheel totals are computed from their event logs. No stored counters (the `treasury` document's `balance` is an explicitly-recomputed cache, verified against replay by test).
- **The store is MongoDB**, accessed only through `agent/store/db.py::connect()`. `CLAUDE.md`'s reference to `agent/store/schema.sql` is stale; Task 9 fixes it.
- **Backtests must not pollute the treasury.** Positions with `venue == "simulated"` write no treasury or flywheel events.
- **Style:** `ruff check . && ruff format .` and `mypy agent` must pass. Modules use `from __future__ import annotations`. Import `settings` from `agent.config`, never `os.environ`.
- **Risk constants (exact values):** fast-leg sleeve 80%, slow-leg sleeve 20%, fast-leg simultaneous deployment cap 25% of treasury, slow-leg total cap 20% of treasury, single-position cap 5% of treasury, category concentration cap 40% of open exposure, drawdown kill-switch 20% below high-water mark, fast/slow leg boundary 48 hours, treasury seed $10,000 notional.
- **Flywheel split (exact):** 50% treasury / 35% $ANSEM buy / 15% operational reserve.

---

## File Structure

**Create:**
- `agent/treasury/__init__.py` — package exports
- `agent/treasury/ledger.py` — treasury event log, derived balance, HWM, drawdown, deployment queries
- `agent/treasury/flywheel.py` — profit split accounting and $ANSEM price lookup
- `agent/treasury/legs.py` — leg classification and sleeve fractions (tiny, dependency-free, imported by both sizing and safety without cycles)
- `tests/test_treasury_ledger.py`
- `tests/test_legs_and_sizing.py`
- `tests/test_flywheel.py`
- `tests/test_risk_breakers.py`
- `web/src/app/desk/page.tsx` — transparency dashboard route
- `web/src/components/desk/*.tsx` — dashboard panels

**Modify:**
- `agent/config.py` — `agent_treasury_seed`, `ansem_price_url`
- `agent/store/db.py` — treasury/flywheel collection indexes; `leg` on positions; ledger hooks in `open_position` / `close_position`
- `agent/strategy/sizing.py` — sleeve-aware bankroll base
- `agent/strategy/entry.py` — leg classification into `EntryPlan`
- `agent/reasoning/prompts.py` — `intended_hold_hours` in the entry schema and validator
- `agent/execution/safety.py` — drawdown breaker + `entry_allowed`
- `agent/agent.py` — call `entry_allowed` before placing an entry
- `agent/api/server.py` — `/api/treasury`, `/api/flywheel`, `/api/positions/settled`
- `agent/__main__.py` — seed treasury on `init-db`
- `CLAUDE.md`, `PRODUCT.md`, `prd.md`, `submission.md`, `pitch.md`, `README.md`

**Dependency order:** Task 1 (ledger) → Task 2 (legs+sizing) → Task 3 (prompt/entry leg) → Task 4 (breakers) → Task 5 (db hooks) → Task 6 (flywheel) → Task 7 (API) → Task 8 (UI) → Task 9 (docs).

---

### Task 1: Treasury ledger

**Files:**
- Create: `agent/treasury/__init__.py`, `agent/treasury/ledger.py`
- Modify: `agent/config.py:27` (settings block), `agent/store/db.py:44-59` (`init_db`)
- Test: `tests/test_treasury_ledger.py`

**Interfaces:**
- Consumes: `agent.store.db.connect`, `agent.store.db.next_id`, `agent.config.settings`
- Produces:
  - `ledger.seed_if_empty() -> None`
  - `ledger.record(kind: str, amount: float, *, position_id: int | None = None, leg: str | None = None) -> float` (returns new balance)
  - `ledger.balance() -> float`
  - `ledger.replay_balance() -> float`
  - `ledger.high_water_mark() -> float`
  - `ledger.drawdown() -> float`
  - `ledger.snapshot() -> dict[str, Any]` with keys `currency, seed, balance, high_water_mark, drawdown, updated_at`
  - Constants: `CURRENCY = "USD_NOTIONAL"`, `TREASURY_DOC_ID = "main"`

- [ ] **Step 1: Write the failing test**

Create `tests/test_treasury_ledger.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_treasury_ledger.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'agent.treasury'`

- [ ] **Step 3: Add the config setting**

In `agent/config.py`, in the `# ---- runtime ----` block immediately after `agent_daily_loss_cap`:

```python
    agent_treasury_seed: float = 10000.0   # notional USD book (paper mode); see PRODUCT.md
```

- [ ] **Step 4: Add the collection indexes**

In `agent/store/db.py::init_db`, after the `d["onchain_anchors"]` line:

```python
    d["treasury_events"].create_index([("created_at", 1)])
    d["treasury_events"].create_index([("position_id", 1)])
    d["flywheel_events"].create_index([("created_at", 1)])
    d["flywheel_events"].create_index([("position_id", 1)], unique=True)
```

- [ ] **Step 5: Write the ledger**

Create `agent/treasury/__init__.py`:

```python
"""Notional treasury: append-only ledger, barbell legs, and flywheel accounting."""

from agent.treasury import flywheel, ledger, legs

__all__ = ["flywheel", "ledger", "legs"]
```

Note: `flywheel` does not exist until Task 6. Until then, write `__init__.py` as:

```python
"""Notional treasury: append-only ledger, barbell legs, and flywheel accounting."""

from agent.treasury import ledger

__all__ = ["ledger"]
```

and extend it in Tasks 2 and 6.

Create `agent/treasury/ledger.py`:

```python
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
        conn["treasury"].insert_one({
            "_id": TREASURY_DOC_ID,
            "currency": CURRENCY,
            "seed": amount,
            "balance": 0.0,
            "high_water_mark": 0.0,
            "updated_at": _now(),
        })
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
        conn["treasury_events"].insert_one({
            "_id": eid,
            "kind": kind,
            "amount": float(amount),
            "balance_after": new_balance,
            "position_id": position_id,
            "leg": leg,
            "mode": settings.agent_mode,
            "created_at": _now(),
        })
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
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pytest tests/test_treasury_ledger.py -v`
Expected: 5 passed

- [ ] **Step 7: Seed on init-db**

In `agent/__main__.py`, find the `init-db` command handler (it calls `db.init_db()`) and add immediately after that call:

```python
    from agent.treasury import ledger as _ledger
    _ledger.seed_if_empty()
    print(f"treasury seeded: {_ledger.balance():.2f} notional USD")
```

- [ ] **Step 8: Lint and commit**

```bash
ruff check . && ruff format . && mypy agent
git add agent/treasury agent/config.py agent/store/db.py agent/__main__.py tests/test_treasury_ledger.py
git commit -m "feat(treasury): add append-only notional treasury ledger"
```

---

### Task 2: Barbell legs and sleeve-aware sizing

**Files:**
- Create: `agent/treasury/legs.py`
- Modify: `agent/strategy/sizing.py:44-90`, `agent/treasury/__init__.py`
- Test: `tests/test_legs_and_sizing.py`

**Interfaces:**
- Consumes: `ledger.balance()`, `ledger.deployed(leg)`
- Produces:
  - `legs.FAST_LEG_MAX_HOURS = 48`
  - `legs.FAST_SLEEVE = 0.80`, `legs.SLOW_SLEEVE = 0.20`
  - `legs.classify(intended_hold_hours: float | None) -> str` returning `"fast"` or `"slow"`
  - `legs.sleeve_fraction(leg: str) -> float`
  - `sizing.size_position(..., leg: str = "slow")` — same `SizeDecision` return, new reason `"leg_sleeve_full"`

- [ ] **Step 1: Write the failing test**

Create `tests/test_legs_and_sizing.py`:

```python
from agent.strategy import sizing
from agent.treasury import ledger, legs


def test_classify_by_intended_hold():
    assert legs.classify(6) == "fast"
    assert legs.classify(48) == "fast"
    assert legs.classify(49) == "slow"
    assert legs.classify(None) == "slow"   # unknown hold is conservative


def test_sleeve_fractions():
    assert legs.sleeve_fraction("fast") == 0.80
    assert legs.sleeve_fraction("slow") == 0.20


def test_size_draws_against_leg_sleeve():
    ledger.seed_if_empty()   # 10_000 notional
    fast = sizing.size_position(p_agent=0.70, p_market=0.50, leg="fast",
                                calibration_mul=1.0, per_market_cap=1e9)
    slow = sizing.size_position(p_agent=0.70, p_market=0.50, leg="slow",
                                calibration_mul=1.0, per_market_cap=1e9)
    # both hit the 5% cap of their own sleeve: 0.05 * 8000 vs 0.05 * 2000
    assert abs(fast.usd - 400.0) < 1e-6
    assert abs(slow.usd - 100.0) < 1e-6


def test_exhausted_sleeve_returns_zero_and_never_borrows(monkeypatch):
    ledger.seed_if_empty()
    # pretend the whole slow sleeve is already deployed
    monkeypatch.setattr(ledger, "deployed", lambda leg=None: 2000.0 if leg == "slow" else 0.0)
    sd = sizing.size_position(p_agent=0.70, p_market=0.50, leg="slow",
                              calibration_mul=1.0, per_market_cap=1e9)
    assert sd.usd == 0.0
    assert sd.reason == "leg_sleeve_full"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_legs_and_sizing.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'agent.treasury.legs'`

- [ ] **Step 3: Write the legs module**

Create `agent/treasury/legs.py`:

```python
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
```

Extend `agent/treasury/__init__.py`:

```python
"""Notional treasury: append-only ledger, barbell legs, and flywheel accounting."""

from agent.treasury import ledger, legs

__all__ = ["ledger", "legs"]
```

- [ ] **Step 4: Make sizing sleeve-aware**

In `agent/strategy/sizing.py`, add to the imports:

```python
from agent.treasury import ledger, legs
```

Replace the `size_position` signature and its bankroll resolution. The new signature adds `leg` and defaults `bankroll` to `None`:

```python
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
    if bankroll is None:
        treasury = ledger.balance() or settings.agent_bankroll
        sleeve = treasury * legs.sleeve_fraction(leg)
        headroom = sleeve - ledger.deployed(leg)
        if headroom <= 0:
            return SizeDecision(0.0, "YES", 0.0, 0.0, calibration_mul, "leg_sleeve_full")
        bankroll = sleeve
    per_market_cap = per_market_cap if per_market_cap is not None else settings.agent_per_market_cap
```

Leave the rest of the function body unchanged, then cap the final size by the remaining sleeve headroom. Replace the closing block:

```python
    raw_usd = bankroll * min(f_frac, max_bankroll_fraction)
    capped_usd = min(raw_usd, per_market_cap)
    final_usd = capped_usd * calibration_mul
```

with:

```python
    raw_usd = bankroll * min(f_frac, max_bankroll_fraction)
    capped_usd = min(raw_usd, per_market_cap)
    final_usd = capped_usd * calibration_mul
    if headroom is not None:
        final_usd = min(final_usd, headroom)
```

and initialise `headroom: float | None = None` before the `if bankroll is None:` block, assigning it inside that branch.

Add `leg` to the `SizeDecision` dataclass:

```python
@dataclass(slots=True)
class SizeDecision:
    usd: float
    side: str               # 'YES' or 'NO'
    kelly_full: float
    kelly_fractional: float
    calibration_mul: float
    reason: str
    leg: str = legs.SLOW
```

and pass `leg=leg` in the successful `return SizeDecision(...)` at the end.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_legs_and_sizing.py tests/test_sizing.py -v`
Expected: all pass. `tests/test_sizing.py` passes an explicit `bankroll=`, so it is unaffected; if any case there relies on the settings default, pass `bankroll=settings.agent_bankroll` explicitly in that test rather than changing sizing.

- [ ] **Step 6: Lint and commit**

```bash
ruff check . && ruff format . && mypy agent
git add agent/treasury tests/test_legs_and_sizing.py agent/strategy/sizing.py tests/test_sizing.py
git commit -m "feat(strategy): barbell legs with sleeve-aware position sizing"
```

---

### Task 3: `intended_hold_hours` through the entry pipeline

**Files:**
- Modify: `agent/reasoning/prompts.py:99-142` (prompt), `agent/reasoning/prompts.py:206-227` (`validate_entry`), `agent/strategy/entry.py:31-46` (`EntryPlan`), `agent/strategy/entry.py:236-282` (sizing call and return)
- Test: `tests/test_prompts.py`

**Interfaces:**
- Consumes: `legs.classify`
- Produces: `EntryPlan.leg: str | None`, `EntryPlan.intended_hold_hours: float | None`; `validate_entry` result gains key `intended_hold_hours: float | None`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_prompts.py`:

```python
def test_validate_entry_accepts_intended_hold_hours():
    from agent.reasoning import prompts

    out = prompts.validate_entry({
        "p_yes": 0.7, "confidence": 0.6, "edge_vs_market": 0.2,
        "recommended_action": "enter_yes", "rationale": "x",
        "intended_hold_hours": 12,
    })
    assert out is not None
    assert out["intended_hold_hours"] == 12.0


def test_validate_entry_tolerates_missing_intended_hold_hours():
    from agent.reasoning import prompts

    out = prompts.validate_entry({
        "p_yes": 0.7, "confidence": 0.6, "edge_vs_market": 0.2,
        "recommended_action": "enter_yes", "rationale": "x",
    })
    assert out is not None
    assert out["intended_hold_hours"] is None


def test_entry_prompt_requests_intended_hold_hours():
    from datetime import UTC, datetime

    from agent.reasoning import prompts

    p = prompts.build_entry_prompt(
        {"question": "q", "category": "politics", "end_date": None, "resolution_rules": None},
        as_of=datetime(2026, 1, 1, tzinfo=UTC), market_price_yes=0.5, search_results=[],
    )
    assert "intended_hold_hours" in p
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_prompts.py -k intended_hold -v`
Expected: FAIL — `KeyError`/`AssertionError` because the field does not exist

- [ ] **Step 3: Extend the prompt**

In `agent/reasoning/prompts.py::build_entry_prompt`, replace task item 5 and the JSON shape block with:

```
5. Recommend one of: 'enter_yes', 'enter_no', 'skip'.
   - Recommend a side only if |edge| >= 0.05 AND your confidence >= 0.5.
6. State how long you intend to HOLD this position before closing it, in hours.
   This is your trading intent, not the market's resolution date — you may close
   early on price movement. Positions intended to close within 48 hours are the
   fast leg of the barbell; longer holds are the slow, high-conviction leg.

Respond in this exact JSON shape:
{{
  "p_yes": <float 0..1>,
  "confidence": <float 0..1>,
  "rationale": "<3-6 sentences>",
  "key_signals": ["<short bullet>", ...],
  "edge_vs_market": <float>,
  "intended_hold_hours": <float, hours you intend to hold before closing>,
  "recommended_action": "enter_yes" | "enter_no" | "skip"
}}"""
```

- [ ] **Step 4: Extend the validator**

In `validate_entry`, before the return, add:

```python
    raw_hold = parsed.get("intended_hold_hours")
    try:
        hold = float(raw_hold) if raw_hold is not None else None
    except (TypeError, ValueError):
        hold = None
    if hold is not None and hold <= 0:
        hold = None
```

and add to the returned dict:

```python
        "intended_hold_hours": hold,
```

A missing or unparseable value must NOT reject the decision — `legs.classify(None)` already resolves conservatively to the slow leg.

- [ ] **Step 5: Thread the leg through EntryPlan**

In `agent/strategy/entry.py`, add to the imports:

```python
from agent.treasury import legs
```

Add two fields to the `EntryPlan` dataclass, after `edge`:

```python
    leg: str | None = None
    intended_hold_hours: float | None = None
```

At the sizing call, classify first and pass the leg:

```python
    cat = (market.get("category") or "uncategorised").lower()
    mul = calibration.multiplier_for(cat)
    leg = legs.classify(entry_parsed["intended_hold_hours"])
    sd = sizing.size_position(
        p_agent=entry_parsed["p_yes"],
        p_market=market_price,
        leg=leg,
        calibration_mul=mul,
    )
```

In the final `return EntryPlan(action="enter", ...)`, add:

```python
        leg=leg,
        intended_hold_hours=entry_parsed["intended_hold_hours"],
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pytest tests/test_prompts.py -v`
Expected: all pass

- [ ] **Step 7: Lint and commit**

```bash
ruff check . && ruff format . && mypy agent
git add agent/reasoning/prompts.py agent/strategy/entry.py tests/test_prompts.py
git commit -m "feat(reasoning): capture intended hold duration and classify barbell leg"
```

---

### Task 4: Risk parameters as enforced breakers

**Files:**
- Modify: `agent/execution/safety.py` (constants, `check_drawdown`, `entry_allowed`, `all_clear`), `agent/agent.py:200-220`
- Test: `tests/test_risk_breakers.py`

**Interfaces:**
- Consumes: `ledger.balance/high_water_mark/drawdown/deployed`, `legs`
- Produces:
  - `safety.RISK_PARAMS: dict[str, float]` — the exported constants the dashboard renders
  - `safety.check_drawdown() -> BreakerCheck`
  - `safety.entry_allowed(*, usd_size: float, leg: str, category: str) -> BreakerCheck`
  - `all_clear()` now includes `check_drawdown`

- [ ] **Step 1: Write the failing test**

Create `tests/test_risk_breakers.py`:

```python
from agent.execution import safety
from agent.treasury import ledger


def test_drawdown_breaker_trips_at_twenty_percent():
    ledger.seed_if_empty()
    assert not safety.check_drawdown().tripped
    ledger.record("settlement", -2000.0)          # exactly 20% below HWM
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
        safety, "_open_exposure_by_category",
        lambda: ({"politics": 900.0, "world": 100.0}, 1000.0),
    )
    # politics would become 1000/1100 = 91% of exposure, over the 40% cap
    assert safety.entry_allowed(usd_size=100.0, leg="slow", category="politics").tripped


def test_no_leverage_size_never_exceeds_sleeve_headroom():
    """No leverage: sizing draws only against a positive sleeve, with no borrowing path."""
    from agent.strategy import sizing
    from agent.treasury import legs

    ledger.seed_if_empty()
    for leg in (legs.FAST, legs.SLOW):
        sleeve = ledger.balance() * legs.sleeve_fraction(leg)
        sd = sizing.size_position(p_agent=0.99, p_market=0.01, leg=leg,
                                  calibration_mul=1.0, per_market_cap=1e9)
        assert 0.0 <= sd.usd <= sleeve


def test_no_leverage_empty_treasury_sizes_to_zero(monkeypatch):
    from agent.strategy import sizing

    monkeypatch.setattr(ledger, "balance", lambda: 0.0)
    monkeypatch.setattr("agent.config.settings.agent_bankroll", 0.0)
    sd = sizing.size_position(p_agent=0.99, p_market=0.01, leg="fast",
                              calibration_mul=1.0, per_market_cap=1e9)
    assert sd.usd == 0.0


def test_risk_params_exported_for_dashboard():
    for key in (
        "max_position_fraction", "fast_leg_deployment_cap",
        "slow_leg_cap", "category_concentration_cap", "drawdown_kill_switch",
    ):
        assert key in safety.RISK_PARAMS
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_risk_breakers.py -v`
Expected: FAIL with `AttributeError: module 'agent.execution.safety' has no attribute 'check_drawdown'`

- [ ] **Step 3: Implement the breakers**

In `agent/execution/safety.py`, add to the imports:

```python
from typing import Any

from agent.treasury import ledger, legs
```

After the existing module constants, add:

```python
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
```

Add the global kill-switch:

```python
def check_drawdown() -> BreakerCheck:
    """Kill-switch: halt all new positions at DRAWDOWN_KILL_SWITCH below the HWM.

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
```

Add the per-candidate checks:

```python
def _open_exposure_by_category() -> tuple[dict[str, float], float]:
    """(exposure per category, total exposure) across open non-backtest positions."""
    by_cat: dict[str, float] = {}
    total = 0.0
    with db.connect() as conn:
        open_rows = list(conn["positions"].find({"status": "open", "venue": {"$ne": "simulated"}}))
        ids = list({r["market_id"] for r in open_rows})
        markets = {m["_id"]: m for m in conn["markets"].find({"_id": {"$in": ids}})}
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
    treasury = ledger.balance()
    if treasury <= 0:
        return BreakerCheck("entry_allowed", False)

    if usd_size > treasury * MAX_POSITION_FRACTION:
        return BreakerCheck(
            "entry.position_cap", True,
            f"size={usd_size:.2f} > {MAX_POSITION_FRACTION:.0%} of treasury {treasury:.2f}",
        )

    cap = FAST_LEG_DEPLOYMENT_CAP if leg == legs.FAST else SLOW_LEG_CAP
    if ledger.deployed(leg) + usd_size > treasury * cap:
        return BreakerCheck(
            "entry.leg_allocation", True,
            f"leg={leg} deployed+new > {cap:.0%} of treasury",
        )

    by_cat, total = _open_exposure_by_category()
    cat = (category or "uncategorised").lower()
    new_total = total + usd_size
    if new_total > 0 and (by_cat.get(cat, 0.0) + usd_size) / new_total > CATEGORY_CONCENTRATION_CAP:
        return BreakerCheck(
            "entry.category_concentration", True,
            f"category={cat} > {CATEGORY_CONCENTRATION_CAP:.0%} of open exposure",
        )

    return BreakerCheck("entry_allowed", False)
```

Add `check_drawdown()` to the `checks` list in `all_clear()`:

```python
    checks = [
        check_daily_loss(),
        check_drawdown(),
        check_position_count(),
        check_api_failures(),
        check_manual(),
    ]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_risk_breakers.py tests/test_safety.py -v`
Expected: all pass

- [ ] **Step 5: Wire the entry check into the cycle**

In `agent/agent.py`, inside the entry loop, replace the block from `# position-count breaker recheck` through the `exe.place_entry(...)` try block with:

```python
        # position-count / drawdown breaker recheck (entries this cycle can trip them)
        ok2, _ = safety.all_clear()
        if not ok2:
            log.warning("cycle.aborting_entries_breaker_tripped")
            break
        # per-candidate risk limits — reject this candidate, keep the cycle going
        risk = safety.entry_allowed(
            usd_size=plan.usd_size,
            leg=plan.leg or "slow",
            category=(m.get("category") or "uncategorised"),
        )
        if risk.tripped:
            log.info("cycle.entry_rejected", market_id=m["id"], breaker=risk.name, reason=risk.reason)
            n_skipped += 1
            continue
        try:
            exe.place_entry(
                market=m, side=plan.side, usd_size=plan.usd_size,
                target_price=plan.target_price, decision_id=plan.decision_id,
                leg=plan.leg or "slow",
            )
            n_entered += 1
        except Exception as e:
            log.warning("cycle.entry_failed", market_id=m["id"], error=str(e))
```

The `leg=` kwarg on `place_entry` is added in Task 5; until then this call fails. Implement Task 5 before running the agent end-to-end. (Unit tests in this task do not exercise `place_entry`.)

- [ ] **Step 6: Lint and commit**

```bash
ruff check . && ruff format . && mypy agent
git add agent/execution/safety.py agent/agent.py tests/test_risk_breakers.py
git commit -m "feat(safety): enforce published risk parameters as circuit breakers"
```

---

### Task 5: Persist the leg and write treasury events

**Files:**
- Modify: `agent/store/db.py:217-273` (`open_position`, `close_position`), `agent/execution/paper.py:40-92` and `:125-150` (`place_entry` signatures), `agent/execution/live.py` (`place_entry` signature)
- Test: `tests/test_treasury_ledger.py` (extend)

**Interfaces:**
- Consumes: `ledger.record`
- Produces: positions carry `leg`; `db.open_position` writes an `entry` treasury event, `db.close_position` writes a `settlement` event. Both skip `venue == "simulated"`.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_treasury_ledger.py`:

```python
from agent.store import db


def test_open_and_close_position_move_the_treasury():
    ledger.seed_if_empty()
    with db.connect() as conn:
        pid = db.open_position(conn, {
            "market_id": "manifold:m1", "venue": "manifold", "side": "YES",
            "shares": 10.0, "entry_price": 0.5, "notional_in": 500.0, "leg": "fast",
        })
        assert ledger.balance() == 9500.0
        db.close_position(
            conn, pid, exit_price=0.7, notional_out=700.0,
            exit_decision_id=None, venue_exit_order=None, p_yes_at_exit=0.7,
        )
    assert ledger.balance() == 10200.0


def test_backtest_positions_do_not_touch_the_treasury():
    ledger.seed_if_empty()
    with db.connect() as conn:
        pid = db.open_position(conn, {
            "market_id": "sim:m1", "venue": "simulated", "side": "YES",
            "shares": 10.0, "entry_price": 0.5, "notional_in": 500.0, "leg": "fast",
        })
        db.close_position(
            conn, pid, exit_price=0.7, notional_out=700.0,
            exit_decision_id=None, venue_exit_order=None, p_yes_at_exit=0.7,
        )
    assert ledger.balance() == 10000.0


def test_leg_is_persisted_and_defaults_to_slow():
    with db.connect() as conn:
        pid = db.open_position(conn, {
            "market_id": "manifold:m2", "venue": "manifold", "side": "NO",
            "shares": 1.0, "entry_price": 0.5, "notional_in": 1.0,
        })
        pos = conn["positions"].find_one({"_id": pid})
    assert pos["leg"] == "slow"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_treasury_ledger.py -k "treasury_move or backtest_positions or leg_is_persisted" -v`
Expected: FAIL — `KeyError: 'leg'` / balance unchanged

- [ ] **Step 3: Hook the ledger into the DAO**

In `agent/store/db.py::open_position`, add `"leg": p.get("leg") or "slow",` to the inserted document (next to `"venue"`), and after the `insert_one` call, before `return pid`:

```python
    if p["venue"] != "simulated":
        from agent.treasury import ledger  # local import: ledger imports db
        ledger.record("entry", -float(p["notional_in"]), position_id=pid, leg=p.get("leg") or "slow")
    return pid
```

In `close_position`, after the `update_one` call:

```python
    if pos.get("venue") != "simulated":
        from agent.treasury import ledger
        ledger.record(
            "settlement", float(notional_out), position_id=pos_id, leg=pos.get("leg") or "slow",
        )
```

The local imports are deliberate: `agent.treasury.ledger` imports `db` at module level, so a top-level import here would be circular.

- [ ] **Step 4: Accept `leg` in the executors**

In `agent/execution/paper.py`, add `leg: str = "slow",` as a keyword parameter to `ManifoldExecutor.place_entry` and `SimulatedExecutor.place_entry`, and pass `"leg": leg,` in each `db.open_position({...})` call. Do the same for `LiveExecutor.place_entry` in `agent/execution/live.py`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_treasury_ledger.py tests/test_db_roundtrips.py tests/test_safety.py -v`
Expected: all pass

- [ ] **Step 6: Lint and commit**

```bash
ruff check . && ruff format . && mypy agent
git add agent/store/db.py agent/execution tests/test_treasury_ledger.py
git commit -m "feat(treasury): record entries and settlements against the notional book"
```

---

### Task 6: Flywheel accounting

**Files:**
- Create: `agent/treasury/flywheel.py`
- Modify: `agent/config.py` (`ansem_price_url`), `agent/store/db.py::close_position`, `agent/treasury/__init__.py`
- Test: `tests/test_flywheel.py`

**Interfaces:**
- Consumes: `ledger.record`, `db.connect`, `db.next_id`
- Produces:
  - `flywheel.TREASURY_SHARE = 0.50`, `ANSEM_SHARE = 0.35`, `RESERVE_SHARE = 0.15`
  - `flywheel.SIMULATION_NOTICE: str` (the fixed copy)
  - `flywheel.ansem_price_usd() -> tuple[float | None, str]` returning `(price, source)`
  - `flywheel.on_settlement(position_id: int, realized_pnl: float) -> dict | None`
  - `flywheel.totals() -> dict[str, Any]`
  - `flywheel.events(limit: int = 50) -> list[dict[str, Any]]`

- [ ] **Step 1: Write the failing test**

Create `tests/test_flywheel.py`:

```python
from agent.treasury import flywheel, ledger


def _fixed_price(monkeypatch, price):
    monkeypatch.setattr(flywheel, "ansem_price_usd", lambda: (price, "test"))


def test_profitable_settlement_splits_fifty_thirtyfive_fifteen(monkeypatch):
    ledger.seed_if_empty()
    _fixed_price(monkeypatch, 0.02)
    ev = flywheel.on_settlement(position_id=1, realized_pnl=100.0)
    assert ev["treasury_share"] == 50.0
    assert ev["ansem_share"] == 35.0
    assert ev["reserve_share"] == 15.0
    assert ev["ansem_qty"] == 1750.0        # 35 / 0.02
    assert ev["mode"] == "paper"


def test_losing_settlement_writes_nothing(monkeypatch):
    ledger.seed_if_empty()
    _fixed_price(monkeypatch, 0.02)
    assert flywheel.on_settlement(position_id=2, realized_pnl=-40.0) is None
    assert flywheel.events() == []


def test_price_failure_still_records_the_split(monkeypatch):
    ledger.seed_if_empty()
    monkeypatch.setattr(flywheel, "ansem_price_usd", lambda: (None, "unavailable"))
    ev = flywheel.on_settlement(position_id=3, realized_pnl=100.0)
    assert ev["ansem_share"] == 35.0
    assert ev["ansem_price_usd"] is None
    assert ev["ansem_qty"] is None


def test_totals_are_aggregated_from_the_event_log(monkeypatch):
    ledger.seed_if_empty()
    _fixed_price(monkeypatch, 0.02)
    flywheel.on_settlement(position_id=4, realized_pnl=100.0)
    flywheel.on_settlement(position_id=5, realized_pnl=200.0)
    t = flywheel.totals()
    assert t["ansem_usd"] == 105.0          # 35 + 70
    assert t["ansem_qty"] == 5250.0
    assert t["reserve_usd"] == 45.0
    assert t["simulated"] is True


def test_settlement_is_idempotent_per_position(monkeypatch):
    ledger.seed_if_empty()
    _fixed_price(monkeypatch, 0.02)
    flywheel.on_settlement(position_id=6, realized_pnl=100.0)
    flywheel.on_settlement(position_id=6, realized_pnl=100.0)
    assert len(flywheel.events()) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_flywheel.py -v`
Expected: FAIL with `ImportError: cannot import name 'flywheel'`

- [ ] **Step 3: Add the price setting**

In `agent/config.py`, in the runtime block after `agent_treasury_seed`:

```python
    ansem_price_url: str = (
        "https://api.dexscreener.com/latest/dex/tokens/"  # + $ANSEM mint, set via env
    )
    ansem_token_mint: str | None = None
```

- [ ] **Step 4: Write the flywheel module**

Create `agent/treasury/flywheel.py`:

```python
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
from agent.treasury import ledger

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
        if conn["flywheel_events"].find_one({"position_id": position_id}):
            return None

    price, source = ansem_price_usd()
    ansem_usd = round(realized_pnl * ANSEM_SHARE, 6)
    event = {
        "position_id": position_id,
        "realized_pnl": round(realized_pnl, 6),
        "treasury_share": round(realized_pnl * TREASURY_SHARE, 6),
        "ansem_share": ansem_usd,
        "reserve_share": round(realized_pnl * RESERVE_SHARE, 6),
        "ansem_price_usd": price,
        "ansem_qty": round(ansem_usd / price, 6) if price else None,
        "price_source": source,
        "mode": "paper",
        "created_at": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    with db.connect() as conn:
        eid = db.next_id(conn, "flywheel_events")
        conn["flywheel_events"].insert_one({"_id": eid, **event})
    log.info("flywheel.split", position_id=position_id, ansem_usd=ansem_usd, price=price)
    return {"id": eid, **event}


def events(limit: int = 50) -> list[dict[str, Any]]:
    with db.connect() as conn:
        cur = conn["flywheel_events"].find().sort("_id", -1).limit(limit)
        return [db._row(e) for e in cur]


def totals() -> dict[str, Any]:
    """Aggregates over the event log. No stored counters — everything is replayable."""
    treasury_usd = ansem_usd = ansem_qty = reserve_usd = profit = 0.0
    n = 0
    with db.connect() as conn:
        for e in conn["flywheel_events"].find():
            n += 1
            profit += float(e.get("realized_pnl") or 0.0)
            treasury_usd += float(e.get("treasury_share") or 0.0)
            ansem_usd += float(e.get("ansem_share") or 0.0)
            ansem_qty += float(e.get("ansem_qty") or 0.0)
            reserve_usd += float(e.get("reserve_share") or 0.0)
    return {
        "events": n,
        "realized_profit_usd": round(profit, 6),
        "treasury_usd": round(treasury_usd, 6),
        "ansem_usd": round(ansem_usd, 6),
        "ansem_qty": round(ansem_qty, 6),
        "reserve_usd": round(reserve_usd, 6),
        "mode": "paper",
        "simulated": True,
        "notice": SIMULATION_NOTICE,
    }
```

Extend `agent/treasury/__init__.py`:

```python
"""Notional treasury: append-only ledger, barbell legs, and flywheel accounting."""

from agent.treasury import flywheel, ledger, legs

__all__ = ["flywheel", "ledger", "legs"]
```

- [ ] **Step 5: Fire the flywheel on settlement**

In `agent/store/db.py::close_position`, extend the non-simulated block added in Task 5:

```python
    if pos.get("venue") != "simulated":
        from agent.treasury import flywheel, ledger
        ledger.record(
            "settlement", float(notional_out), position_id=pos_id, leg=pos.get("leg") or "slow",
        )
        if pnl > 0:
            flywheel.on_settlement(pos_id, pnl)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pytest tests/test_flywheel.py tests/test_treasury_ledger.py -v`
Expected: all pass

- [ ] **Step 7: Lint and commit**

```bash
ruff check . && ruff format . && mypy agent
git add agent/treasury tests/test_flywheel.py agent/config.py agent/store/db.py
git commit -m "feat(treasury): simulated profit flywheel accounting at live ANSEM spot"
```

---

### Task 7: Dashboard endpoints

**Files:**
- Modify: `agent/api/server.py` (after the existing `/api/metrics` handler)
- Test: `tests/test_api_desk.py` (create)

**Interfaces:**
- Consumes: `ledger.snapshot/deployed`, `flywheel.totals/events`, `safety.RISK_PARAMS`, `safety.all_clear`, `db.positions_with_market`
- Produces: `GET /api/treasury`, `GET /api/flywheel`, `GET /api/positions/settled`

- [ ] **Step 1: Write the failing test**

Create `tests/test_api_desk.py`:

```python
from fastapi.testclient import TestClient

from agent.api.server import app
from agent.treasury import ledger

client = TestClient(app)


def test_treasury_endpoint_reports_notional_and_risk_params():
    ledger.seed_if_empty()
    body = client.get("/api/treasury").json()
    assert body["currency"] == "USD_NOTIONAL"
    assert body["simulated"] is True
    assert body["mode"] == "paper"
    assert body["risk_params"]["drawdown_kill_switch"] == 0.20
    assert "fast" in body["deployed"] and "slow" in body["deployed"]
    assert isinstance(body["breakers"], list)


def test_flywheel_endpoint_carries_the_simulation_notice():
    body = client.get("/api/flywheel").json()
    assert body["simulated"] is True
    assert "No tokens have been purchased or distributed" in body["notice"]


def test_settled_positions_endpoint_shape():
    body = client.get("/api/positions/settled").json()
    assert body["mode"] == "paper"
    assert isinstance(body["positions"], list)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_api_desk.py -v`
Expected: FAIL with 404 responses

- [ ] **Step 3: Implement the endpoints**

In `agent/api/server.py`, add to the imports:

```python
from agent.execution import safety
from agent.treasury import flywheel, ledger, legs
```

Append after the `/api/metrics` handler:

```python
@app.get("/api/treasury")
def treasury() -> dict[str, Any]:
    """Notional treasury state. NOT realized cash — paper mode, notional USD book."""
    snap = ledger.snapshot()
    ok, checks = safety.all_clear()
    return {
        **snap,
        "mode": "paper",
        "simulated": True,
        "notional": True,
        "deployed": {
            "fast": ledger.deployed(legs.FAST),
            "slow": ledger.deployed(legs.SLOW),
            "total": ledger.deployed(),
        },
        "risk_params": safety.RISK_PARAMS,
        "breakers": [
            {"name": c.name, "tripped": c.tripped, "reason": c.reason} for c in checks
        ],
        "halted": not ok,
        "events": ledger.events(limit=50),
    }


@app.get("/api/flywheel")
def flywheel_state() -> dict[str, Any]:
    return {**flywheel.totals(), "events": flywheel.events(limit=50)}


@app.get("/api/positions/settled")
def settled_positions(limit: int = 100) -> dict[str, Any]:
    with db.connect() as conn:
        rows = [
            r for r in db.positions_with_market(conn, limit=limit)
            if r.get("status") == "closed" and r.get("venue") != "simulated"
        ]
    wins = {"fast": 0, "slow": 0}
    counts = {"fast": 0, "slow": 0}
    pnl = {"fast": 0.0, "slow": 0.0}
    for r in rows:
        leg = r.get("leg") or "slow"
        counts[leg] += 1
        pnl[leg] += float(r.get("pnl") or 0.0)
        if float(r.get("pnl") or 0.0) > 0:
            wins[leg] += 1
    return {
        "mode": "paper",
        "simulated": True,
        "notional": True,
        "positions": rows,
        "leg_performance": {
            leg: {
                "settled": counts[leg],
                "wins": wins[leg],
                "win_rate": (wins[leg] / counts[leg]) if counts[leg] else None,
                "realized_pnl_notional": round(pnl[leg], 4),
            }
            for leg in ("fast", "slow")
        },
    }
```

Leg performance is returned per leg and never blended — a single combined hit rate would misrepresent both the fast leg's frequency and the slow leg's asymmetry.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_api_desk.py -v`
Expected: 3 passed

- [ ] **Step 5: Lint and commit**

```bash
ruff check . && ruff format . && mypy agent
git add agent/api/server.py tests/test_api_desk.py
git commit -m "feat(api): treasury, flywheel and settled-position endpoints"
```

---

### Task 8: Transparency dashboard

**Files:**
- Create: `web/src/app/desk/page.tsx`, `web/src/components/desk/treasury-panel.tsx`, `web/src/components/desk/flywheel-panel.tsx`, `web/src/components/desk/positions-panel.tsx`, `web/src/components/desk/risk-panel.tsx`
- Modify: `web/src/lib/api.ts` (fetchers), and the newsroom page to link `/desk`

**Interfaces:**
- Consumes: `GET /api/treasury`, `GET /api/flywheel`, `GET /api/positions/settled`, existing `/api/portfolio` for open positions
- Produces: the `/desk` route

- [ ] **Step 1: Add typed fetchers**

In `web/src/lib/api.ts`, following the existing fetcher pattern in that file, add `getTreasury()`, `getFlywheel()`, and `getSettledPositions()` with TypeScript interfaces mirroring the payloads in Task 7. Each interface includes `mode: string`, `simulated: boolean`, and (for treasury and settled) `notional: boolean`.

- [ ] **Step 2: Build the panels**

Follow `DESIGN.md` for visual language (dark broadcast surface, BBC red accent) and match the component conventions already used in `web/src/components/`. Six panels:

1. **Treasury** — balance, high-water mark, and current drawdown drawn against the 20% kill-switch line. The heading reads `Treasury (notional USD)` and a subline states the book is notional and the mode is paper.
2. **Risk parameters** — one row per entry in `risk_params`, each with its live utilisation and current breaker state. Rendered from the API payload, never hardcoded in the component.
3. **Open positions** — from `/api/portfolio`, each row tagged `FAST` or `SLOW` and showing its thesis.
4. **Settled history** — win/loss, market, leg, size, realized notional P&L.
5. **Leg performance** — fast and slow as two separate rows from `leg_performance`. Do not compute a blended win rate.
6. **Flywheel** — totals from `/api/flywheel`, with `notice` rendered verbatim and visible without interaction (not behind a tooltip or an expander).

- [ ] **Step 3: Link from the newsroom**

Add a `/desk` link in the main navigation, labelled `The Desk`.

- [ ] **Step 4: Verify against the running app**

```bash
cd web && pnpm dev
```

Open `http://localhost:3000/desk` and confirm: every treasury figure is within one glance of the word "notional"; the flywheel notice is visible without interaction; fast and slow win rates appear as separate lines; risk rows show live utilisation.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/desk web/src/components/desk web/src/lib/api.ts
git commit -m "feat(web): transparency dashboard at /desk"
```

---

### Task 9: Documentation and positioning pass

**Files:**
- Modify: `CLAUDE.md`, `PRODUCT.md`, `prd.md`, `submission.md`, `pitch.md`, `README.md`

**Interfaces:**
- Consumes: everything above
- Produces: no code

- [ ] **Step 1: Fix the stale store reference in CLAUDE.md**

In the `agent/store/` bullet under "Layered packages", replace the claim that `schema.sql` is the source of truth for the SQLite schema with: the store is MongoDB; `db.py` is the DAO and owns collection indexes in `init_db()`; all persistence goes through `db.connect()`.

- [ ] **Step 2: Add the new invariants to CLAUDE.md**

Under "Safety invariants", add:

```markdown
- The treasury is a **notional USD book** (`agent/treasury/ledger.py`). Its balance is
  derived by replaying `treasury_events`, never assigned. Backtest positions
  (`venue == "simulated"`) never touch it.
- The barbell leg is set from the LLM's `intended_hold_hours` at entry and is
  **immutable** — a fast trade held long is a failed fast trade, not a slow one.
- Published risk parameters live in `safety.RISK_PARAMS` and are enforced by
  breakers. The dashboard renders them from that dict; a pinned number the code
  does not enforce is a defect.
- The flywheel is **simulated**. Every event carries `mode: "paper"`; every API
  response carries `simulated: true`. No tokens have been purchased or distributed.
```

- [ ] **Step 3: Rewrite the PRODUCT.md token-utility section**

Replace the Bull Pool item with the profit flywheel (50/35/15, fired by profitable settlements, $ANSEM bought on the open market and distributed to holders). Add the barbell as a unique mechanism alongside the broadcast. Add a "Post-launch" subsection stating that holder distribution mechanics — snapshots, the ~6-hour minimum hold, Streamflow streaming over 24–48h — ship after the token launch, and that the flywheel currently runs as accounting over paper-mode trades.

- [ ] **Step 4: Add the barbell to prd.md §5**

Add §5.7, "The barbell", stating: allocation is 80% fast / 20% slow by **intended hold duration**, not market category; the fast leg is a hold-time and sizing discipline drawn from the same filtered candidate set as §5.3, so §5.2's exclusions (no sub-hour crypto, no sports) stand unchanged; it is enabled by the continuous buy/sell model of §5.4, with the daily cadence coming from exits rather than settlements. Add §6.4, "Published risk parameters", listing every value from `safety.RISK_PARAMS` and noting the drawdown kill-switch has no auto-expiry by design.

- [ ] **Step 5: Update submission.md and pitch.md**

Lead with the barbell as the memorable strategic hook. Present the flywheel as the $ANSEM utility, explicitly labeled as accounting over paper-mode trades with real spot pricing. State the post-launch roadmap plainly. Keep every performance figure labeled with its mode. Do not describe paper P&L as realized cash anywhere.

- [ ] **Step 6: Update README.md**

Add `The Desk` dashboard to the feature list, document `AGENT_TREASURY_SEED` and `ANSEM_TOKEN_MINT` in the environment section, and note that `python -m agent init-db` seeds the treasury.

- [ ] **Step 7: Verify no honesty regressions**

```bash
grep -rniE "realized (cash|profit)|real money|actual profit" --include=*.md --include=*.tsx --include=*.py . | grep -v docs/superpowers
```

Every hit must either be about the future `live` phase or explicitly labeled notional/simulated. Fix any that are not.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md PRODUCT.md prd.md submission.md pitch.md README.md
git commit -m "docs: barbell strategy, notional treasury and flywheel positioning"
```

---

## Verification

Full suite plus lint, after Task 9:

```bash
pytest && ruff check . && ruff format --check . && mypy agent
```

Then a live smoke test:

```bash
python -m agent init-db          # seeds the treasury
python -m agent cycle            # one cycle; entries respect sleeves and breakers
python -m agent report           # metrics unchanged by this work
curl -s localhost:8000/api/treasury | head -40
```
