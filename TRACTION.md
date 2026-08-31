# BBC — Traction Report

*Live counters update on the app (Ledger tab) and `GET /api/metrics`.*

## Headline

BBC produces **real, verifiable autonomous activity**: every decision the agent makes is a full
reasoning trace, canonicalised, hashed and anchored on-chain, and every trace can be re-hashed in
a browser and matched against the anchor. Nothing below is a screenshot.

| Metric | Value |
|---|---|
| Trading mode | **`paper`** (Manifold play-money) — the testnet alpha |
| Distinct markets analyzed | **26** |
| Autonomous decisions recorded | **30** |
| Reasoning traces anchored on-chain | **30** |
| LLM cost for all of it (Amazon Nova) | **$0.25** (~$0.008 / decision) |

> **Migration note.** The 30 anchors above were produced by the project's earlier EVM
> implementation. The chain layer is being migrated to **Solana** (memo/anchor transactions on
> devnet, then mainnet alongside the $BBC launch); anchors are being re-produced on Solana as the
> migration lands, and this table will carry Solana signatures. The reasoning traces themselves
> are chain-independent — the canonical bytes and sha256 hashes are unchanged by the move.

The economics are the point: anchoring an entire reasoning trace costs a fraction of a cent on
Solana. That is what makes proving *every* decision viable rather than a ceremonial
once-per-demo transaction.

## What "traction" means here (honest framing)

- **What we have:** a continuously running autonomous pipeline anyone can reproduce from the
  public repo, a verifiable on-chain anchor per decision, a live deployed app, and — from launch —
  $BBC trading volume and a ClawPump fee line.
- **What we don't have (yet):** realized trading P&L or a large external holder base. The agent is
  in **`paper` mode**, so its P&L is play-money on Manifold. **We do not present paper P&L as
  realized cash**, and we won't dress agent-generated activity up as organic user growth.

## How it was produced (reproducible)

```bash
uvicorn agent.api.server:app --port 8000      # API
python -m tools.traction_run 25               # analyze 25 markets → real anchored traces
python -m tools.seed_demo                     # capture deterministic demo replays
```

Each market runs the full autonomous pipeline (ontology → graph → reasoning → sizing → execution →
anchor). No human picks the markets in `traction_run` / `/api/auto`.

## Path to organic traction

1. **The broadcast is the growth surface.** Every decision is already a segment with a headline and
   a lower third — the product manufactures its own clips. Attention is an explicit judging
   criterion in the Clawrena, and it is the one thing this format is built to generate.
2. **$BBC and the Bull Pool.** Trading fees accrue on ClawPump from day one; a share of the agent's
   realised proceeds funds a no-loss, on-chain, holding-weighted payout draw to holders. That gives
   holders a recurring reason to check in — and to bring others.
3. **Agent-as-builder fees.** Builder fees on fills the agent recommends, with on-chain attribution
   and no custody: the natural monetization and user-acquisition loop.

## Caveats we own

- The alpha trades **paper** on Manifold; there is no realized cash P&L, so the Bull Pool has
  nothing to distribute until the agent clears the `prd.md` §3 gates into real trading.
- Discovery-sourced markets carry a generic category label; the engine supports per-category
  calibration once real-money categories are enabled (see `prd.md` §5.6).
- The live link requires the API to be hosted or tunnelled; the seeded replays plus verify work
  self-contained.
- The Solana chain migration is in flight; anchor counts above predate it (see the migration note).
