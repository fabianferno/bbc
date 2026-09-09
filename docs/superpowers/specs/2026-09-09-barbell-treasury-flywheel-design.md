# BBC — Barbell Strategy, Notional Treasury, and Profit Flywheel

**Date:** 2026-09-09
**Status:** Approved design, pending implementation plan
**Context:** Positioning and build-out for The AnsemHack (tokenization deadline Sat 19 September 2026; judging closes 30 September 2026)

---

## 1. Purpose

BBC already has a narrative half — a broadcast interface, GraphRAG reasoning, and
Solana-anchored reasoning traces. It lacks the trading-discipline half that the
ClawPump x pump.fun track actually scores: *"high-performing trading agent with
risk controls"*, plus *"novel $ANSEM utility"*.

This design adds that half as a **layer**, not a rebrand. The newsroom stays the
front door. Underneath it, the agent runs a publicly named strategy against a
notional treasury, enforces its published risk parameters as code-level circuit
breakers, and accounts for a profit flywheel whose arithmetic is reproducible.

### Decisions already taken

| Decision | Choice | Rationale |
|---|---|---|
| Rebrand vs. layer | **Layer.** BBC / $BBC and the broadcast identity are retained. | The broadcast is the differentiator on the "audience engagement" criterion and is already built. Black Bull Corporation reads as the trading desk inside the broadcast. |
| Fast-leg definition | **Hold duration, not market category.** | `prd.md` §5.2 excludes sub-hour crypto and sports as zero-edge. Defining the fast leg by *intended hold time* requires contradicting nothing already published, reuses the existing continuous-exit machinery (§5.4, `strategy/exit.py`), and is closer to Taleb's actual point — barbell as risk duration. |
| Token launch posture | **Testnet-quality product plus a stated post-launch roadmap.** No real capital, no live trading before judging. | Operator's call. The cost is acknowledged: a flywheel that has never executed is a diagram, not utility, and the panel is metrics-biased. Mitigated by making the simulation legible and its arithmetic reproducible (§5). |
| Treasury denomination | **Notional USD book**, seeded at a stated amount; execution remains Manifold play-money. | The published risk parameters are percentages of a treasury; without a fixed notional book they are unenforceable and the kill-switch has nothing to trigger against. |
| Holder distribution mechanics | **Documented, not built.** | Genuinely blocked on the token existing, not on effort. Credible as post-launch. |

### Non-goals

- No real capital, no `dryrun`/`live` transition, no on-chain token purchases or
  distributions within this scope.
- No Streamflow integration, holder snapshots, or 6-hour-hold enforcement.
- No new market categories. The barbell is a hold-duration and allocation
  discipline over the existing filtered candidate set.
- No change to GraphRAG, `temporal_guard`, the reasoning pipeline, or the
  Solana anchoring path.

---

## 2. Honesty constraints (binding)

These are inherited from `CLAUDE.md` and `PRODUCT.md` and tightened by this design.

1. The shipped alpha runs in `paper` mode. Paper P&L is never described as
   realized cash — in code, logs, UI copy, or docs.
2. Any performance figure carries the mode that produced it.
3. **The treasury is notional.** The word "notional" appears within one glance of
   any treasury or P&L figure on any surface.
4. **The flywheel is simulated.** No tokens have been purchased or distributed.
   This is carried in the data model (`mode`, `simulated`), not only in styling,
   so the label cannot be lost between the database and the page.
5. Published risk parameters render from the same constants the breakers
   enforce. A pinned number that the code does not enforce is a defect.

---

## 3. Treasury ledger

### Model

Two new MongoDB collections. (Note: the store migrated from SQLite to MongoDB;
`CLAUDE.md`'s reference to `agent/store/schema.sql` is stale and is corrected in
the documentation pass, §7.)

**`treasury`** — a single document:

| Field | Type | Notes |
|---|---|---|
| `_id` | str | Constant `"main"` |
| `currency` | str | `"USD_NOTIONAL"` |
| `seed` | float | Initial notional, from `settings.agent_treasury_seed` |
| `balance` | float | Cached derived value (see below) |
| `high_water_mark` | float | Max balance ever observed |
| `updated_at` | str | ISO-8601 UTC |

**`treasury_events`** — append-only ledger:

| Field | Type | Notes |
|---|---|---|
| `_id` | int | From `db.next_id` |
| `kind` | str | `seed` \| `entry` \| `settlement` \| `flywheel_split` |
| `amount` | float | Signed; negative reduces balance |
| `balance_after` | float | Running balance at write time |
| `position_id` | int \| None | Set for `entry` and `settlement` |
| `leg` | str \| None | `fast` \| `slow` |
| `mode` | str | Always `"paper"` in this scope |
| `created_at` | str | ISO-8601 UTC |

### Invariant: balance is derived, never assigned

The authoritative balance is `sum(amount)` over `treasury_events`. The value on
the `treasury` document is a cache, recomputed on every write and verifiable by
replay. A judge auditing the ledger can reconstruct every number on the
dashboard from the trade history alone.

`recompute_treasury()` replays the log and rewrites the cache; a test asserts
cache equals replay after an arbitrary sequence of events.

### Derived quantities

- `drawdown = (high_water_mark - balance) / high_water_mark` (0.0 when HWM is 0)
- `deployed(leg)` = sum of entry cost of open positions on that leg
- HWM updates whenever `balance` exceeds it. It never decreases.

### Integration seam

`settings.agent_bankroll` (currently 50.0) is today both the sizing base and the
daily-loss denominator. It becomes a deprecated alias resolving to the live
treasury balance, so `strategy/sizing.py` and `safety.check_daily_loss` pick up
the treasury without call-site changes. New setting `agent_treasury_seed`
(default 10000.0) seeds the ledger on `init-db` if no `seed` event exists.

---

## 4. Barbell allocation

### Leg classification

`strategy/entry.py::plan_entry` gains a required `intended_hold_hours` field in
the LLM's structured entry plan, supplied alongside the thesis. Classification:

- `fast` if `intended_hold_hours <= 48`
- `slow` otherwise

Threshold lives in one constant, `FAST_LEG_MAX_HOURS = 48`.

**The leg is immutable once the position is opened.** A fast trade that drifts
into a week-long hold is reported as a *failed fast trade*, never silently
reclassified into the slow book. This is what keeps the separately-reported leg
win rates meaningful.

Stored as `leg` on the position document.

### Allocation

Target split, enforced in sizing:

- Fast leg draws against **80%** of treasury
- Slow leg draws against **20%** of treasury

If a leg's sleeve is exhausted, `size_position` returns 0 with reason
`leg_sleeve_full`. **A leg never borrows from the other sleeve.**

### Sleeve ceiling vs. deployment cap

These are two distinct limits and both bind:

- The **sleeve** (80% fast / 20% slow) is the share of treasury a leg is
  *entitled to*. It governs how capital is divided between the legs.
- The **deployment cap** (§5: fast-leg deployed <= 25% of treasury) is how much
  may be *at risk simultaneously*. It governs how much of the entitlement is
  actually in the market at any moment, keeping at least 75% of treasury in
  reserve as published.

So the fast leg is entitled to 80% of the book but may never have more than 25%
of it deployed at once. The binding constraint at entry time is whichever is
lower, which in practice is always the deployment cap.

`size_position` gains a `leg` parameter and computes its bankroll base as
`treasury_balance * sleeve_fraction(leg)`. The existing fractional-Kelly maths,
the 5% cap, and the per-category calibration multiplier are unchanged and apply
within the sleeve.

---

## 5. Risk parameters as enforced breakers

All published parameters become code in `agent/execution/safety.py`. Constants
are exported so the dashboard renders from them directly (§2.5).

### Global halt breakers

Joins the existing set returned by `all_clear()`:

**`check_drawdown`** — trips when drawdown from HWM reaches **20%**.
Persisted with **no auto-expiry**, unlike `daily_loss`'s 24-hour cooldown.
Clearing requires an explicit `reset-breaker` invocation plus a published
reassessment note. The absence of auto-expiry is what makes this a kill-switch
rather than a pause, and is the point of the whole control.

### Per-candidate entry breakers

These reject a specific candidate rather than halting the agent, so they do
**not** belong in `all_clear()`. A new function
`entry_allowed(candidate) -> BreakerCheck` runs them inside the entry path:

- **`check_position_cap`** — no single position exceeds **5%** of treasury
- **`check_leg_allocation`** — fast-leg deployed ≤ **25%** of treasury; slow-leg
  total ≤ **20%** of treasury
- **`check_category_concentration`** — no category exceeds **40%** of total open
  exposure

### No leverage

Structurally guaranteed: sizing draws only against a sleeve of a positive
notional balance and there is no borrowing path. Asserted by test.

### Tests

Extend `tests/test_safety.py`: each breaker trips at its threshold and not below
it; the drawdown breaker does not auto-expire; `entry_allowed` rejects the
candidate without tripping `all_clear`; sleeve exhaustion returns
`leg_sleeve_full` rather than borrowing.

---

## 6. Flywheel accounting

### Trigger

Hooks `db.close_position`. On any close with `pnl > 0`, write one
`flywheel_events` document. **Losing settlements write nothing** — the flywheel
fires only on profit, which is the substance of the "buy pressure is earned, not
recycled" claim.

### Split

| Share | Fraction | Purpose |
|---|---|---|
| Treasury | 50% | Compounds capital; written back as a `flywheel_split` treasury event |
| $ANSEM buy | 35% | Simulated open-market purchase, distributed to holders |
| Operational reserve | 15% | Gas and infrastructure; sustains distributions through losing streaks |

### Model

**`flywheel_events`**:

| Field | Type | Notes |
|---|---|---|
| `_id` | int | From `db.next_id` |
| `position_id` | int | Settled position |
| `realized_pnl` | float | Notional USD profit |
| `treasury_share` / `ansem_share` / `reserve_share` | float | 50 / 35 / 15 |
| `ansem_price_usd` | float | Real spot at settlement time |
| `ansem_qty` | float | `ansem_share / ansem_price_usd` |
| `price_source` | str | Provider identifier |
| `mode` | str | `"paper"` |
| `created_at` | str | ISO-8601 UTC |

### The one real input

`ansem_price_usd` is fetched from a public price API and cached per settlement.
This is deliberate: the $ANSEM quantities are what the mechanism *would* have
bought at a real, checkable price, not a made-up constant. Each event stores the
price and source it used, so the arithmetic is reproducible by a third party.

If the price fetch fails, the event is still written with `ansem_price_usd:
null` and `ansem_qty: null`, and the dashboard shows the split without a
quantity. A failed fetch must never block a settlement or silently substitute a
stale price.

### Aggregates

Running totals — cumulative treasury share, $ANSEM notional purchased, $ANSEM
quantity, operational reserve — are computed as aggregates over the event log.
**No stored counters**, for the same auditability reason as the treasury balance.

### Out of scope

Holder snapshots, the 6-hour minimum hold, and Streamflow streaming are
documented in `PRODUCT.md` as post-launch, not built.

---

## 7. Transparency dashboard

A new route in the Next.js app, reachable from the newsroom. The broadcast stays
the front door; this is the desk behind it.

### Endpoints

Alongside the existing `/api/portfolio` and `/api/metrics` in `agent/api/server.py`:

- `GET /api/treasury` — balance, HWM, drawdown, deployed by leg, and every
  breaker state including which are tripped and why
- `GET /api/flywheel` — running totals plus the recent event log
- `GET /api/positions/settled` — closed history with thesis, leg, size, realized P&L

Every response carries `mode: "paper"` and `simulated: true`.

### Panels

1. **Open positions** — each with its thesis and leg tag
2. **Settled history** — win/loss, market, leg, size, realized notional P&L
3. **Treasury** — balance, HWM, current drawdown against the 20% kill-switch line
4. **Flywheel** — running totals, carrying the fixed simulation notice:
   *"Simulated — this is what the flywheel would have distributed from
   paper-mode trades. No tokens have been purchased or distributed."*
5. **Risk parameters** — rendered from the exported breaker constants, with each
   parameter's live utilisation and current breaker state
6. **Leg performance** — **fast and slow leg win rates as separate lines.** The
   slow leg's asymmetric returns are never averaged into the fast leg's hit
   rate; a single blended number would misrepresent both.

---

## 8. Documentation and positioning pass

| File | Change |
|---|---|
| `PRODUCT.md` | Token utility: the Bull Pool gives way to the profit flywheel. Barbell added as the unique mechanism alongside the broadcast. Post-launch roadmap stated explicitly. |
| `prd.md` | §5 gains the barbell as a named strategy, with the hold-duration framing written out so it reads as consistent with §5.2 rather than contradicting it. Risk parameters and the kill-switch documented alongside the existing §6.3 breakers. |
| `submission.md`, `pitch.md` | Barbell as the memorable hook; flywheel as token utility; honest paper-mode framing plus the post-launch roadmap. |
| `CLAUDE.md` | Correct the stale SQLite/`schema.sql` reference to MongoDB. Add the treasury, barbell, and simulation-labeling invariants. |
| `README.md`, web copy | Positioning alignment. |

Positioning remains layered: **BBC, the Bull Broadcasting Corporation ($BBC)** — a
newsroom that reports an autonomous trader running a published barbell strategy
with enforced risk controls. The one-liner and barbell language from the brief
carry over intact.

---

## 9. Build order and risk

Load-bearing, in dependency order:

1. Treasury ledger (§3) — everything reads from it
2. Barbell allocation (§4)
3. Enforced breakers (§5)
4. Flywheel accounting (§6)
5. Dashboard endpoints, then panels (§7)
6. Documentation pass (§8)

Items 1–3 are backend with clear test surfaces and carry the track's core claim.
Item 7's UI is the most likely to slip against the 19 September tokenization
deadline; if it does, **the endpoints without a polished page beat a polished
page with no engine behind it.** The documentation pass (§8) must not slip — the
positioning is what the submission is judged on.
