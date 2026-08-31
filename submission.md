# BBC — AnsemHack Submission

**The Bull Broadcasting Corporation. The autonomous trader that reports its own trades.**

- **Project:** BBC — the Bull Broadcasting Corporation
- **Ticker:** **$BBC** (Solana, launched on ClawPump)
- **Repo:** https://github.com/fabianferno/bbc
- **Hackathon:** The AnsemHack / The Clawrena — ClawPump × pump.fun, Solana, 19 Aug – 1 Oct 2026
- **Tracks:** **ClawPump × pump.fun** (builder + trader, primary) · **Inference Markets / UsePod**
  (secondary). Both judge the same tokenized project, so they stack.
- **Deadline discipline:** registered and **tokenized by Sat 19 September 2026**.

---

## One line (280 chars, for the registration form)

> BBC is an autonomous prediction-market trading agent that broadcasts its own reasoning,
> positions and P&L as a live news channel — a bull in a suit reading out every trade, with each
> reasoning trace anchored on Solana so anyone can verify the call.

---

## Problem

AI trading agents are black boxes, and the few that publish their thinking publish it in a format
nobody reads. You get a number — "bet YES at 62%" — and an implicit ask to trust it. On prediction
markets that is fatal, because the edge does not come from price action; it comes from **synthesis
of messy public information**. Reasoning you cannot inspect is reasoning you cannot trust or
improve, and nothing ties an agent's *claimed* reasoning to the trade it actually placed. A
confident number is indistinguishable from a hallucinated one.

Prediction markets are the cleanest testbed for verifiable machine reasoning: every market resolves
to ground truth, so a reasoning trace is either calibrated or it isn't. There is nowhere to hide.
Make an agent's thinking a first-class, auditable, tamper-evident artifact and "trust me" becomes
"verify me" — a primitive that matters far beyond trading.

The second problem is attention. Agent projects have to buy an audience. An agent that narrates
itself produces one as a by-product of operating.

---

## What we built

BBC makes the reasoning the product and the broadcast the interface. For each prediction market it:

1. **Builds a knowledge graph (GraphRAG).** It designs a custom ontology — the entity and
   relationship types that matter for *this* market — then extracts an entity knowledge graph from
   date-bounded news. A `temporal_guard` drops any source published after the market's reasoning
   cutoff, so backtests and live runs cannot cheat with hindsight. The graph summary is injected
   into the forecast prompt and drives the decision; remove it and the decision changes.
2. **Decides like a calibrated trader.** It estimates P(YES), computes edge versus market price,
   sizes with fractional Kelly under per-category calibration, and executes — constrained by hard
   circuit breakers the language model cannot bypass (daily loss cap, max open positions,
   per-market cap, slippage guard, API-failure cooldown, manual trip).
3. **Reports it.** Every stage — discovery, evidence, probability, entry, exit, settlement — is
   emitted as a broadcast segment with a headline, a lower third and a ticker line. The reasoning
   trace is the script. The anchor is a bull in a suit; the newsroom is the dashboard.
4. **Proves it on Solana.** It canonicalises the full trace (ontology, graph, evidence, decision),
   hashes it (sha256), and anchors the hash in a Solana memo transaction. Anyone can re-hash the
   trace in their browser at `/verify/<id>` and confirm it matches the chain.

**Pipeline:** discovery → cheap filters → ambiguity check → date-bounded Tavily search (temporal
guard) → GraphRAG (ontology → entities → graph) → graph-augmented reasoning → calibrated Kelly
sizing → execution → Solana anchor. It runs fully autonomously (`agent cycle` / `agent loop`) — no
human picks the markets.

**Stack:** Python agent engine; **Amazon Nova Lite via AWS Bedrock** for reasoning (~$0.015 per
full analysis, ~$0.008 per decision); Tavily for date-bounded search; a FastAPI sidecar streaming
each live build over SSE; MongoDB for graph runs, trace blobs and on-chain anchors; Solana for
trace anchoring and the $BBC mint; Next.js + Tailwind for the broadcast front end (Terminal,
Reasoning Room, Verify, Ledger).

---

## Phase honesty — what is actually running

| Phase | What is real |
|---|---|
| `backtest` | replay of cached resolved markets |
| `paper` | Manifold play-money trades — **this is the testnet alpha** |
| `dryrun` | Polymarket orders signed, never submitted |
| `live` | real orders |

**The testnet alpha runs in `paper` mode: the agent places paper trades on Manifold.** Every
performance figure in the UI is labeled with the mode that produced it. **Paper P&L is not realized
cash and is never presented as such.** Graduation between phases is gated on pre-committed metrics
in `prd.md` §3 — Brier score, ECE, ROI, minimum sample size and a passing leakage check — written
down in advance precisely so they cannot be moved to fit a result.

---

## Token utility — $BBC

**1 · Access to the live feed.** Holding $BBC unlocks the agent's live reasoning feed and its open
position book in real time — the raw wire, ahead of the delayed public broadcast. Everyone can
watch BBC; holders watch it as it is written.

**2 · The Bull Pool.** A share of the agent's trading proceeds accumulates into a prize pool. On
each payout round the pool is distributed to **randomly drawn $BBC holders, weighted by holding**.
This is a pool-together structure, not a lottery you buy into: **nobody's principal is ever at
risk** — you keep every token you hold, the agent's edge is the yield, and holding more only
changes your odds of being drawn. Draws execute on-chain and are independently verifiable, on the
same principle as the reasoning anchors. (In paper mode the agent earns nothing, so there is
nothing to distribute yet; the pool is funded by realised proceeds only.)

**3 · The ClawPump fee flywheel.** $BBC launches on ClawPump, so trading fees accrue to the project
from day one, win or lose. ClawPump keeps 35%, and 10% of *their* share buys $CLAW and $ANSEM on
the open market, funding further builder rewards. Attention drives volume, volume drives fees, fees
fill the Bull Pool, and the pool gives holders a reason to keep watching. The broadcast sits at the
top of that funnel: a trading agent that narrates itself is natively clippable.

---

## Why this fits the tracks

**ClawPump × pump.fun (builder + trader).** The track asks for an agent that trades a live market
and survives it — prediction markets named explicitly — and for what you *added*, not what you
wrapped. What we added: bespoke per-market ontology design, GraphRAG entity extraction driving the
forecast, a temporal leakage guard with a dedicated CLI gate, per-category calibration feeding
position size, non-bypassable circuit breakers, and a broadcast layer that turns an audit log into
something people will actually watch. The LLM is one bounded component inside a multi-stage system.
On the builder side, the agent is a company: a product, a token, a revenue line and an audience.

**Inference Markets (UsePod).** The agent's dominant variable cost *is* inference — ontology
extraction, graph construction and forecast reasoning, every cycle, indefinitely. That makes UsePod
load-bearing rather than a line item: the compute *is* the product's cost of goods, and the
winner's credit has an obvious job — keeping the broadcast on air after the Clawrena closes.

**What the panel scores.**
- *On-chain volume* — $BBC trading on ClawPump plus one anchor transaction per decision; the agent
  puts activity on Solana every cycle it runs, not only at demo time.
- *Attention* — the format is the growth strategy. Every decision ships as a clip.
- *Token design* — access + a no-loss holder payout funded by the agent's own edge.
- *Builders onboarded* — a Python/LLM/Bedrock team crossing onto Solana for the first time.
- *Deploy early* — the paper alpha runs continuously, accumulating a time-stamped public record
  across the six weeks instead of in deadline week.

---

## Traction (honest)

We will not dress agent-generated activity up as organic growth. What is real:

- A **continuously running paper-mode alpha** on Manifold, producing time-stamped autonomous
  decisions with full reasoning traces — reproducible by anyone from the public repo.
- A **reasoning trace anchored on-chain per decision**, each independently re-hashable and
  verifiable against the chain in-browser.
- A **public repo** and a deployed app that run the pipeline end to end.
- **$BBC on ClawPump**, giving real trading volume and a fee line from launch day.

What we do not have yet: realized trading P&L (we are in paper mode by design and say so on every
screen) or a large external holder base. Live counters are on the app's Ledger tab and
`GET /api/metrics`; the current figures are in [`TRACTION.md`](./TRACTION.md).

---

## On-stream answers (15 minutes, 4 questions)

1. **Team.** A Python/agent-infrastructure builder crossing from traditional AI tooling onto
   Solana for the first time — precisely the onboarding the Clawrena is trying to cause.
2. **Product & demo.** Pick a market → watch the Reasoning Room build the ontology and graph live
   → the decision goes to air with P(YES), edge and Kelly size → the agent trades → the trace is
   anchored on Solana → Verify re-hashes it and matches the chain.
3. **Market, GTM, traction.** Prediction-market volume keeps compounding and every agent in the
   space is opaque. Our GTM is the broadcast itself: the product manufactures the clips. Traction
   today is a continuously running autonomous alpha with verifiable anchors, not a user count.
4. **Token utility, roadmap, vision.** Access, the Bull Pool, and the ClawPump fee flywheel today.
   Roadmap: clear the `prd.md` gates from paper into dryrun and then live, ship the first on-chain
   Bull Pool draw, route inference through UsePod, and open the broadcast to other agents — a
   newsroom where any autonomous trader has to show its work on air.

---

*Engine details, phase gates and safety invariants: [`prd.md`](./prd.md) and [`CLAUDE.md`](./CLAUDE.md).
Pitch kit and video script: [`pitch.md`](./pitch.md). Numbers: [`TRACTION.md`](./TRACTION.md).*

> **Not financial advice.** $BBC is a hackathon token. The agent runs in paper mode; nothing here
> is an offer, a security, or a promise of returns.
