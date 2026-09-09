# PRODUCT.md — BBC

> Impeccable product context. Owns product truth. Visual decisions live in DESIGN.md.

## What it is

**BBC — the Bull Broadcasting Corporation.** An autonomous prediction-market
trading agent that reports its own reasoning, positions and P&L as a live 24/7
news broadcast. The anchor is a bull in a suit. The newsroom is the dashboard.

Ticker: **$BBC**, launched on ClawPump (Solana) for The AnsemHack / The Clawrena.

## Unique mechanism

The agent does not present a dashboard of numbers; it *reports*. Every stage of
its loop — market discovery, evidence search, calibrated probability, entry,
exit, settlement — is emitted as a broadcast segment with a headline, a lower
third, and a ticker line. The reasoning trace is the script. Auditability
becomes a viewing experience rather than a JSON dump.

## Audience & scene

- **Hackathon judges and the ClawPump/X audience**, watching on a stream or a
  phone, mid-scroll, giving it fifteen seconds. They must grasp "autonomous
  trader, live, on Solana" from one viewport.
- **$BBC holders**, checking in daily on what the agent did and whether a payout
  round is coming.
- Used on a bright desk and on a projected stream. The surface is dark: a
  broadcast studio is a dark room with lit screens, and the red bar only reads
  as broadcast red against near-black.

## Phases (product truth — do not overstate)

| Phase | What is real |
|---|---|
| backtest | replay of cached resolved markets |
| paper | Manifold play-money trades — **this is the testnet alpha** |
| dryrun | Polymarket orders signed, not submitted |
| live | real orders |

**The testnet alpha ships in `paper` mode: the agent places paper trades.** Any
performance figure shown in the UI must be labeled with the mode that produced
it. Do not present paper P&L as realized cash.

## Unique mechanism, part two: the barbell

Underneath the broadcast, the agent runs a publicly named strategy against a
**notional USD treasury** (seeded, not real capital — see Phases below): an 80/20
barbell split by **intended hold duration**, not market category. Fast-leg
positions are meant to close within 48 hours; everything else is the slow leg.
This is consistent with the market-selection filters in `prd.md` §5.2 — no
sub-hour crypto, no sports — because the fast leg draws from the same filtered
candidate set and is a hold-time and sizing discipline, not a new kind of bet.
Every published risk parameter (position cap, leg deployment caps, category
concentration cap, the drawdown kill-switch) is a constant in
`agent/execution/safety.py` and enforced by code the LLM cannot bypass; the same
constants render on the transparency dashboard (`/desk`) so a pinned number can
never drift from the limit actually enforced.

## Token utility — $BBC

1. **Access** — holding $BBC unlocks the agent's live reasoning feed and its
   position book before the delayed public broadcast.
2. **The profit flywheel** — every profitable settlement splits its realized
   notional P&L 50% back into the treasury, 35% into an $ANSEM buy, and 15% into
   an operational reserve. The $ANSEM share is priced at real, live spot so the
   quantities are reproducible by anyone. **Currently this runs as accounting
   over paper-mode trades** (`agent/treasury/flywheel.py`) — no tokens have been
   purchased or distributed yet; every event and API response is labeled
   `mode: "paper"` / `simulated: true`.
3. **Fee flywheel** — $BBC trading fees accrue to the team from day one per the
   ClawPump structure.

### Post-launch

Holder distribution mechanics ship after the $BBC token launch, not before:
holder snapshots, a ~6-hour minimum hold before a distribution counts, and
Streamflow streaming of the $ANSEM share to holders over 24–48 hours. These are
documented here as the roadmap; none of it is built. Until the token exists,
the flywheel is accounting, not a payout mechanism.

## Chain

**Solana.** Full migration from the previous EVM/Arc implementation. Wallets,
the $BBC mint, and Bull Pool draws are Solana-native.

## Constraints

- Safety breakers in `agent/execution/safety.py` are not bypassable by the LLM.
- All decisions persist to the DB so calibration can recompute.
- `temporal_guard` must gate any new evidence path.

## What success looks like

A judge lands on the page, sees a bull anchor delivering an actual trade the
agent just made, and understands the product before reading a single label.
