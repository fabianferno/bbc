# BBC — the Bull Broadcasting Corporation

**The autonomous trader that reports its own trades.**

![Demo animation](https://i.ibb.co/jPyT54Np/Screen-Recording2026-05-25at10-56-53-PM-ezgif-com-video-to-gif-converter.gif)

BBC is an autonomous prediction-market trading agent that broadcasts its own reasoning,
positions and P&L as a live 24/7 news channel. The anchor is a bull in a suit. The newsroom
is the dashboard.

Under the anchor desk is a real engine: for each market the agent builds a **knowledge graph**
of who and what moves it, reasons over that graph to a calibrated **+EV position**, sizes it
with fractional Kelly, executes, and **anchors the full reasoning trace on Solana** as a memo
transaction anyone can re-hash and verify. Not a black box — a glass one, read out loud.

Token: **$BBC** on Solana, launched via ClawPump.

---

## The AnsemHack — "The Clawrena"

BBC is an entry in [The AnsemHack](https://clawpump.tech/ansemhack) (ClawPump × pump.fun,
Solana, 19 Aug – 1 Oct 2026).

- **Primary track — ClawPump × pump.fun (builder + trader).** BBC is an agent that trades a
  live market and survives it. Prediction markets are named explicitly in the track brief, and
  the track is judged on realised performance, risk control and on-chain volume on Solana.
  What we added — GraphRAG market reasoning, temporal-leakage guards, hard circuit breakers,
  and a broadcast layer that makes an agent's reasoning watchable — is net-new, not a wrapper.
- **Secondary track — Inference Markets (UsePod).** The agent's cost line *is* inference: every
  cycle spends on ontology extraction, graph construction and forecast reasoning. Routing that
  spend through UsePod makes inference load-bearing rather than a line item.
- **Chain:** Solana. Wallets, the $BBC mint, Bull Pool draws and trace anchoring are all
  Solana-native. (This repo is mid-migration from an earlier EVM/Arc implementation.)
- **Deadline:** **Saturday 19 September 2026** — last day to register *and* to have a live
  token. No token, no award. $BBC launches on ClawPump before that date.
- **Judging:** 20–30 September; winner announced 1 October.

## $BBC token utility

1. **Access to the live feed.** Holding $BBC unlocks the agent's live reasoning feed and its
   open position book in real time — the raw wire, ahead of the delayed public broadcast.
   Non-holders see the segments after the tape delay; holders see them as they are written.

2. **The profit flywheel.** Every profitable settlement splits its realized notional P&L 50%
   back into the treasury, 35% into an $ANSEM buy, 15% into an operational reserve, priced at
   real, live $ANSEM spot so the quantities are checkable by anyone. **This runs today as
   simulated accounting over paper-mode trades** (`agent/treasury/flywheel.py`) — no $ANSEM has
   been purchased or distributed. Holder distribution — snapshots, a ~6-hour minimum hold,
   Streamflow streaming over 24–48 hours — ships post-launch, once the token exists.

3. **The ClawPump fee flywheel.** $BBC launches on ClawPump, so trading fees accrue to the
   project from day one, win or lose. ClawPump keeps 35%; 10% of *their* share buys $CLAW and
   $ANSEM on the open market, which funds further builder rewards. Volume on the broadcast
   feeds the profit flywheel above, and the flywheel gives holders a reason to stay tuned.

## Why it's different

Most trading agents emit a number. BBC emits an **auditable reasoning artifact** — and then
reads it out.

1. **GraphRAG reasoning, not vibes.** For each market the agent designs a bespoke *ontology*
   (entity + relation types), extracts an *entity knowledge graph* from date-bounded news, and
   feeds a summary of that graph into the forecast — so the graph **drives** the decision. You
   watch it build, node by node, live on air.
2. **Verifiable on-chain traces.** The full trace (ontology + graph + evidence + decision) is
   canonicalised, hashed (sha256), and the hash is **anchored on Solana** in a memo/anchor
   transaction. Anyone can re-hash the trace in their browser and confirm it matches the chain.
3. **A real autonomous engine underneath.** Filters → ambiguity check → date-bounded Exa
   search (temporal-guarded against leakage) → graph-augmented reasoning → calibrated fractional
   Kelly sizing → paper/dry-run execution. Circuit breakers the LLM cannot bypass.
4. **A published barbell strategy against a notional treasury.** Positions split 80/20 fast/slow
   by *intended hold duration* (≤48h vs. longer), not market category, so the same filters and
   exclusions above still apply to both legs. Every risk parameter — position cap, per-leg
   deployment caps, category concentration cap, a 20%-drawdown kill-switch with no auto-expiry —
   is a constant in `agent/execution/safety.py::RISK_PARAMS`, enforced by code, and rendered on
   **The Desk** (`/desk`), the public transparency dashboard, from that same code.

Cheap by design: reasoning runs on **Amazon Nova** via Bedrock — a full analyze costs ~**$0.015**.

## What is actually live right now

Be precise about this, because the broadcast metaphor makes it easy to overclaim:

| Phase | What is real |
|---|---|
| `backtest` | replay of cached resolved markets |
| `paper` | Manifold play-money trades — **this is the testnet alpha** |
| `dryrun` | Polymarket orders signed, never submitted |
| `live` | real orders |

**The testnet alpha runs in `paper` mode: the agent places paper trades on Manifold.** Every
performance figure in the UI is labeled with the mode that produced it. Paper P&L is not
realized cash and is never presented as such. Phase transitions are gated by pre-committed
metrics (Brier, ECE, ROI, sample size, leakage check) in [`prd.md`](./prd.md) §3.

## Demo flow (the ≤3-min video)

Pick a market → watch the **Reasoning Room** build the ontology and entity graph live →
see the segment go to air with the decision (P(YES) vs market price, edge, Kelly size) →
the agent executes on Manifold and **anchors the trace on Solana** → open the **Verify** page
to re-hash the trace and match it against the on-chain anchor.

## Architecture

```
Next.js + Tailwind + shadcn-style UI   (Terminal · Reasoning Room · Verify · Ledger)
        ▲  SSE (live build stream)      │  REST (history)
        │                               ▼
FastAPI sidecar  (agent/api)  ── streams ontology→entities→graph→decision→settled→anchored
        │                               │
    trading engine  ───────────────▶  agent/graphrag/   (ontology → entities → graph)
(data/reasoning/strategy/             graph summary feeds the entry reasoning prompt
 execution/store/monitor)                   │
        │                                   ▼
agent/onchain/  (Solana devnet: anchor the trace hash in a memo transaction)
        ▼
MongoDB (graph_runs/nodes/edges, trace_blobs, onchain_anchors)
```

Design spec (historical, pre-rename): [`docs/superpowers/specs/2026-05-25-openmind-graphrag-prediction-agent-design.md`](./docs/superpowers/specs/2026-05-25-openmind-graphrag-prediction-agent-design.md).

## Quick start

**1. Backend (Python 3.11+, uses [uv](https://github.com/astral-sh/uv)):**

```bash
uv venv && source .venv/bin/activate
uv pip install -e ".[dev]"
cp .env.example .env        # fill in AWS (Bedrock/Nova), Exa, the Solana wallet key,
                             # AGENT_TREASURY_SEED and ANSEM_TOKEN_MINT
mkdir -p data logs
python -m agent init-db     # also seeds the notional treasury ledger

# run the API sidecar
uvicorn agent.api.server:app --port 8000
```

Fund the Solana wallet with devnet SOL (`solana airdrop 2 <pubkey> --url devnet`) so anchor
transactions can pay their fee. Without a configured key, on-chain calls degrade to
clearly-flagged mock transactions.

**Treasury / flywheel environment:**

- `AGENT_TREASURY_SEED` — the notional USD amount the treasury ledger is seeded with on
  `init-db` (default `10000.0`). Notional only; nothing changes hands.
- `ANSEM_TOKEN_MINT` — the $ANSEM mint address used to fetch live spot price for the flywheel's
  simulated $ANSEM-buy accounting. Unset it and flywheel events still write, with a null price.

**2. Frontend (Node 18+):**

```bash
cd web
npm install
echo "NEXT_PUBLIC_API_BASE=http://localhost:8000" > .env.local
npm run dev        # http://localhost:3000
```

**3. Seed demo markets (optional, for reliable replay):**

```bash
python -m tools.seed_demo            # auto-pick top open markets
# or: python -m tools.seed_demo manifold:<id> ...
```

## How it maps to what the panel scores

- **On-chain volume** — every reasoning trace is anchored on Solana, and $BBC trading on
  ClawPump puts real volume on the book from launch day.
- **Attention** — "this is a spectator sport." A trading agent that broadcasts itself is
  built to be clipped: every decision is already a segment with a headline and a lower third.
- **Token design** — the profit flywheel ties $ANSEM buy pressure to the agent's realised edge,
  earned on profitable settlements only, and the ClawPump fee split funds it. Currently simulated
  accounting over paper-mode trades; holder distribution is post-launch.
- **Deploy early** — the paper-mode alpha runs continuously, so the agent accumulates a public
  track record over the six weeks rather than in deadline week.
- **Builders onboarded** — this is a Python/LLM stack crossing onto Solana for the first time.

## The engine

BBC's trading engine is a phased autonomous agent. Its build phases, strategy, safety
invariants and metric gates live in [`prd.md`](./prd.md) and [`CLAUDE.md`](./CLAUDE.md).
Highlights:

- Continuous buy/sell of YES/NO shares (not bet-and-hold); entry **and** exit decisions each cycle.
- Temporal-guard leakage prevention on all search (`agent/reasoning/temporal_guard.py`).
- Hard-coded circuit breakers the LLM cannot bypass (`agent/execution/safety.py`).
- Modes: `backtest | paper (Manifold) | dryrun | live (Polymarket)` via `AGENT_MODE`.

```bash
python -m agent cycle        # one autonomous cycle (discovery → reason → trade)
pytest                       # full suite
```

> **Not financial advice.** $BBC is a hackathon token. The agent runs in paper mode; nothing
> here is an offer, a security, or a promise of returns.
