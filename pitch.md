# BBC — Pitch Kit

**The Bull Broadcasting Corporation. The autonomous trader that reports its own trades.**

- **Ticker:** $BBC on Solana, launched via ClawPump
- **Repo:** https://github.com/fabianferno/bbc
- **Hackathon:** The AnsemHack / The Clawrena (ClawPump × pump.fun, Solana, 19 Aug – 1 Oct 2026)
- **Tracks:** **ClawPump × pump.fun** (builder *and* trader) — primary; **Inference Markets
  (UsePod)** — secondary. Both judge the same tokenized project, so they stack.
- **Hard deadline:** 19 September 2026 — registered and tokenized, or out.

---

## 1. The one-liner

> Every trading agent gives you a number. BBC gives you the **broadcast** — a bull in a suit
> running a published 80/20 barbell strategy against code-enforced risk breakers, reading out
> the knowledge graph it built, the probability it computed, the position it took and what
> happened to it — with every reasoning trace anchored on Solana so anyone can check the call
> was earned, not hallucinated.

## 2. The problem (15 seconds)

AI trading agents are black boxes, and the ones that aren't are unwatchable. You get a number
and a JSON dump. On prediction markets that's fatal: edge comes from **synthesis of messy public
information**, so reasoning you can't inspect is reasoning you can't trust or improve. And the
agents that do publish their thinking publish it in a format nobody reads.

## 3. The solution (30 seconds)

BBC makes the reasoning the product *and* makes it watchable:

1. **Builds a knowledge graph.** For each market it designs a bespoke ontology, then extracts an
   entity graph from *date-bounded* news (leakage-guarded). The graph **feeds the forecast** — it
   drives the decision, it isn't decoration.
2. **Decides like a calibrated trader, on a barbell.** Estimates P(YES), computes edge vs. market
   price, sizes with fractional Kelly, and trades on an 80/20 barbell split by *intended hold
   duration* — fast (≤48h) vs. slow — not by market category, so the same filtered candidate set
   and exclusions (no sub-hour crypto, no sports) apply to both legs. Every published risk
   parameter — position cap, per-leg deployment caps, category concentration cap, a 20%-drawdown
   kill-switch with no auto-expiry — is a constant enforced by circuit breakers the LLM cannot
   bypass, and renders live on the public dashboard, **The Desk** (`/desk`), from that same code.
3. **Broadcasts it.** Every stage — discovery, evidence, probability, entry, exit, settlement —
   is emitted as a news segment with a headline, a lower third and a ticker line. The reasoning
   trace *is* the script. Auditability becomes a viewing experience instead of a log file.
4. **Proves it on Solana.** The full trace is canonicalised, hashed (sha256) and the hash is
   anchored in a Solana memo transaction. Anyone re-hashes the trace in-browser and matches it
   to the chain. A glass box, on air.

Runs on **Amazon Nova Lite** (Bedrock) — a full analysis costs ~**$0.015** (~$0.008 / decision).

## 4. What is actually live (say this plainly)

The testnet alpha runs in **`paper` mode**: the agent places **paper trades on Manifold**. Every
figure on screen carries the mode that produced it. Paper P&L is not realized cash and we never
present it as such. The path to real orders is pre-committed and metric-gated in `prd.md` §3
(Brier, ECE, ROI, minimum sample size, leakage check) — `backtest → paper → dryrun → live`. We
would rather show a judge a gate we haven't passed yet than a number we can't defend.

---

## 5. $BBC token utility

**1 · Access.** Holding $BBC unlocks the agent's live reasoning feed and open position book in
real time — the raw wire, ahead of the delayed public broadcast. Everyone can watch BBC; holders
watch it live.

**2 · The profit flywheel.** Every profitable settlement splits its realized notional P&L 50%
back into the treasury, 35% into an $ANSEM buy, 15% into an operational reserve — priced at real,
live $ANSEM spot at settlement so the quantities are checkable by anyone. **This runs today as
simulated accounting over paper-mode trades**: no $ANSEM has been purchased or distributed yet,
and every event says so. Holder distribution — snapshots, a ~6-hour minimum hold, Streamflow
streaming of the $ANSEM share over 24–48 hours — is the planned post-launch mechanism, built once
the token exists.

**3 · The ClawPump fee flywheel.** $BBC launches on ClawPump, so trading fees accrue to the
project from day one, win or lose. ClawPump keeps 35%; 10% of *their* share buys $CLAW and $ANSEM
on the open market, funding further builder rewards. Attention drives volume, volume drives fees,
fees feed the profit flywheel above, which gives holders a reason to keep watching. The broadcast
is the top of that funnel — and a trading agent that narrates itself is natively clippable.

---

## 6. The 3-minute video script (shot-by-shot)

> Record against the live app or localhost. Use a **seeded** market for the main take (the ▶ replay
> button is deterministic), then show one truly live run. Keep cuts tight.

**[0:00–0:20] — Hook.**
*Screen: the broadcast home page, the bull anchor at the desk, ticker running.*
> "This is BBC — the Bull Broadcasting Corporation. It's an autonomous prediction-market trader,
> and it reports its own trades, live, on Solana. Let's watch it work a market."

**[0:20–0:35] — Pick a market.**
*Screen: scroll the live markets grid, click a geopolitical market.*
> "A real prediction market. The agent is going to research it from scratch, on air."

**[0:35–1:30] — The Reasoning Room (THE moment). Hit ▶ run / replay.**
*Screen: left panel — ontology types appear as chips; center — the knowledge graph builds node by
node; right — evidence streams in under the lower third.*
> "First it designs an ontology — the entity and relationship types that matter for *this* market.
> Then it reads date-bounded news and extracts a knowledge graph, live. Every node is cited.
> Nothing published after the cutoff gets in — that's the temporal guard that stops it cheating."

**[1:30–2:05] — The decision goes to air.**
*Screen: the segment card fills — P(YES) vs market price bar, edge, Kelly size, rationale.*
> "It reasons *over the graph* to a calibrated probability — [X]% versus the market's [Y]%, an
> edge of [Z] points — and sizes with fractional Kelly. Then it places the trade. This run is in
> paper mode on Manifold, and the screen says so; we don't dress paper P&L up as cash."

**[2:05–2:40] — Anchor on Solana (the proof).**
*Screen: the on-chain panel — trace anchored; click through to the explorer.*
> "Now the part nobody else does. It hashes the entire reasoning trace and anchors that hash on
> Solana. Here's the transaction. The reasoning is now tamper-evident."

**[2:40–3:00] — Verify, autonomy, token, close.**
*Screen: Verify page → "✓ Verified". Cut to the autonomous loop running, then the $BBC page.*
> "Anyone can re-hash the reasoning in their browser and confirm it matches the chain. And it does
> all of this on its own — picking markets, reasoning, trading, reporting on a published barbell
> strategy with enforced risk breakers. $BBC holders get the live feed, and profitable settlements
> feed a flywheel back toward $ANSEM. BBC: the autonomous trader that reports its own trades."

**Fallbacks:** use ▶ replay (deterministic, no API latency); if the live API is down the seeded
markets still play the full sequence.

---

## 7. How it maps to what the panel scores

| What they score | Us |
|---|---|
| **On-chain volume** | $BBC trading on ClawPump from launch, plus one anchor transaction per decision — the agent generates Solana activity every cycle it runs, not only at demo time. |
| **Attention** | "A spectator sport." An agent that broadcasts itself is built to be clipped: each decision ships as a segment with a headline and a lower third. The mascot does work — a bull anchor is a format, not a logo. |
| **Token design** | The profit flywheel ties $ANSEM buy pressure to the agent's realised edge — earned on profitable settlements, not recycled — and the ClawPump fee split funds it. Currently simulated accounting over paper-mode trades; holder distribution is post-launch. |
| **Builders onboarded** | A Python/LLM/AWS-Bedrock stack crossing onto Solana for the first time — exactly the traditional-tech agentic developer the track is trying to pull in. |
| **Deploy early** | The paper-mode alpha runs continuously, so the agent accumulates a public, time-stamped track record across the six weeks rather than in deadline week. |
| **"We score what you added, not what you wrapped."** | GraphRAG ontology design, temporal-leakage guards, per-category calibration, non-bypassable circuit breakers and the broadcast layer are all ours. The LLM is one bounded component inside a multi-stage system. |

**Inference Markets (secondary):** the agent's dominant variable cost *is* inference — ontology
extraction, graph construction and forecast reasoning, every cycle, forever. Routing that through
UsePod makes inference load-bearing rather than a line item, and gives the winner's compute credit
a direct job: keeping the broadcast on air after the Clawrena closes.

## 8. Is the product practical?

- **Real engine underneath.** A phased autonomous trading agent with leakage-guarded backtesting,
  calibration tracking and hard circuit breakers — not a demo shell.
- **The broadcast is the distribution.** Most agent projects have to buy attention. This one
  produces it as a by-product of operating: every cycle is content.
- **Honest about edge.** The PRD is explicit that this is skill-validation, gated on Brier/ECE/ROI
  before real money. Judges who read repos like operators will respect that more than a chart.
- **Clear path to revenue:** ClawPump fees from day one, builder-code fees on recommended fills,
  and holder access to the live feed.

**Caveats we own:** the alpha trades paper on Manifold, so there is no realized cash P&L yet; the
flywheel is simulated accounting over those paper-mode settlements and has not purchased or
distributed any $ANSEM; holder distribution mechanics are post-launch; the Solana migration from
the earlier EVM implementation is in flight.

---

## 9. Anticipated judge questions

- **"Is the graph real or decoration?"** Real — its summary is injected into the reasoning prompt;
  remove it and the decision changes. See `agent/strategy/entry.py` + `agent/graphrag/`.
- **"What stops data leakage / hindsight?"** A temporal guard drops any source published after the
  market's reasoning cutoff (`agent/reasoning/temporal_guard.py`); `agent leakage-check` is a
  hard Phase-1 gate that exits non-zero on failure.
- **"Is this profitable?"** Not proven, and we won't claim it. It's in paper mode; the gates that
  let it graduate to real orders are written down in advance in `prd.md` §3 so we can't move them.
- **"How is this not just an LLM wrapper?"** Ontology design + graph extraction + calibrated Kelly
  sizing + circuit breakers + on-chain anchoring is a multi-stage autonomous system; the LLM is one
  component, bounded by limits it cannot bypass.
- **"Is the flywheel real yet?"** The accounting is real and reproducible — every profitable
  settlement writes a 50/35/15 split priced at live $ANSEM spot — but no $ANSEM has been bought
  or distributed. That happens post-launch, once holder snapshots and streaming are built.
- **"What's the business model?"** ClawPump trading fees from day one, plus builder-code fees on
  fills the agent recommends (on-chain attribution, no custody).
- **"Why Solana?"** Cheap, fast anchoring makes proving *every* decision economical rather than a
  ceremonial once-per-demo transaction — and ClawPump, the token, the pool draws and the audience
  are all already here.

## 10. Numbers + links to cite

- Model: **Amazon Nova Lite** (Bedrock) · ≈ **$0.015 / full analysis** (~$0.008 / decision).
- Mode: **`paper`** (Manifold play-money) for the alpha — labeled everywhere it appears.
- On-chain: one **Solana memo anchor per decision**; verify flow re-hashes the canonical trace
  client-side at `/verify/<decisionId>` and matches it to the chain.
- Token: **$BBC**, ClawPump (Solana). Fee split per ClawPump's published structure.
- Repo: https://github.com/fabianferno/bbc

## 11. Submission checklist (AnsemHack)

- [ ] Registered at https://clawpump.tech/ansemhack#register (by 19 Sept)
- [ ] Entry posted on X + following [@clawpumptech](https://x.com/clawpumptech) — *the post is the receipt, there is no confirmation email*
- [ ] **$BBC live on ClawPump by 19 Sept**, verified against the same X handle
- [ ] Tracks selected: ClawPump × pump.fun + Inference Markets
- [x] Public repo
- [ ] Live deployed app
- [ ] ≤3-min video (script above)
- [ ] Weekly livestream slot booked (15 min, 4 questions: team · product & demo · market/GTM/traction · token utility & vision)
