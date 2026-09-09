"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw, Radio, Ticket, Eye } from "lucide-react";
import { MarketCard } from "@/components/market-card";
import { IsoFloor } from "@/components/iso-floor";
import { SectionLabel, Button, Pill, ReadoutStrip } from "@/components/ui";
import { api, type MarketsResp, type MetricsResp } from "@/lib/api";
import { useOnAir } from "@/components/channel-frame";
import { useRequireAuth } from "@/lib/auth";
import type { Market } from "@/lib/types";

/** How long each headline holds before the desk cuts to the next one. */
const HOLD_MS = 7000;

type Bulletin = { headline: string; strap: string };

const STANDBY: Bulletin[] = [
  {
    headline: "The agent that reports its own trades",
    strap:
      "BBC runs a calibrated prediction-market book and broadcasts every decision it makes, on the record",
  },
  {
    headline: "Testnet alpha is on air in paper mode",
    strap:
      "Every position below is simulated on Manifold — the reasoning is real, the money is not, and we say so on screen",
  },
  {
    headline: "The Bull Pool will pay out to $BBC holders at random",
    strap:
      "Planned: a share of the agent's proceeds drawn on Solana and sent to randomly selected holders, with no principal at risk",
  },
];

export default function Home() {
  const gate = useRequireAuth();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [metrics, setMetrics] = useState<MetricsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [slot, setSlot] = useState(0);

  const load = () =>
    api
      .markets(18)
      .then((r: MarketsResp) => setMarkets(r.markets))
      .catch(() => {}) // backend sidecar may be down — show standby, don't throw
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    api.metrics().then(setMetrics).catch(() => {});
  }, []);

  // the bulletin rota: the channel's own story first, then whatever is on the wire
  const bulletins = useMemo<Bulletin[]>(() => {
    const live = markets.slice(0, 5).map((m) => ({
      headline: m.question,
      strap: `${m.category || m.venue} · market prices this at ${
        m.last_price_yes == null ? "—" : `${Math.round(m.last_price_yes * 100)}%`
      } — the desk is looking for a gap between that number and the evidence`,
    }));
    return [STANDBY[0], ...live, ...STANDBY.slice(1)];
  }, [markets]);

  useEffect(() => {
    const t = setInterval(() => setSlot((s) => (s + 1) % bulletins.length), HOLD_MS);
    return () => clearInterval(t);
  }, [bulletins.length]);

  const bulletin = bulletins[slot % bulletins.length];

  // the rota puts the live markets in slots 1..5 (see `bulletins`); the studio
  // monitor follows whichever one is on air, and falls back to the first market
  // while a standby card is up so the panel is never empty.
  const onAir = markets[slot - 1] ?? markets[0] ?? null;

  useOnAir({
    headline: bulletin.headline,
    strap: bulletin.strap,
    brandSuffix: "Markets",
    cut: slot,
  });

  const discover = async () => {
    setDiscovering(true);
    await api.discover().catch(() => {});
    await load();
    setDiscovering(false);
  };

  return (
    <div>
      {/* ── the studio ────────────────────────────────────────────────── */}
      <section className="studio relative isolate overflow-hidden">
        <div className="relative mx-auto grid max-w-[1440px] grid-cols-1 items-end gap-6 px-4 pb-0 pt-10 sm:px-6 lg:min-h-[60vh] lg:grid-cols-[1.25fr_minmax(340px,0.75fr)] lg:gap-10 lg:pt-14">
          <div className="pb-2 lg:pb-10">
            <h1 className="headline max-w-[16ch] text-[clamp(2.6rem,7vw,4.75rem)] text-white">
              The market moves. Somebody has to explain why.
            </h1>

            <p className="mt-6 max-w-[62ch] text-[17px] leading-relaxed text-dim">
              BBC is an autonomous prediction-market trader that files a report on
              every position it takes. It searches the evidence, prices the
              question against it, sizes the bet, and then{" "}
              <span className="text-white">
                anchors the whole reasoning trace on Solana
              </span>{" "}
              so you can check its working after the fact.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/auto">
                <Button variant="primary">
                  <Radio className="size-3.5" strokeWidth={2.5} aria-hidden />
                  Watch the desk run live
                </Button>
              </Link>
              <Link href="/portfolio">
                <Button variant="ghost">
                  <Eye className="size-3.5" strokeWidth={2.5} aria-hidden />
                  Open the book
                </Button>
              </Link>
              <Pill tone="hold">Paper mode · testnet alpha</Pill>
            </div>
          </div>

          {/* the trading floor — an isometric field of probability columns,
              one of which is on air and stands for the price on the rota.
              No frame: it sits in the studio dark like the rest of the set. */}
          <aside className="relative hidden lg:block lg:self-end lg:mb-10">
            <IsoFloor
              price={onAir?.last_price_yes ?? null}
              cut={slot}
              className="block h-[380px] w-full"
            />
          </aside>
        </div>
      </section>

      {/* ── the wall ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1440px] px-4 py-12 sm:px-6">
        <SectionLabel className="mb-5">
          The studio wall — what the desk has done so far
        </SectionLabel>
        <ReadoutStrip
          items={[
            {
              label: "Traces anchored",
              value: metrics?.anchor_count ?? "—",
              sub: "reasoning written to Solana",
              tone: "red",
            },
            {
              label: "Settlements",
              value: metrics?.settle_count ?? "—",
              sub: "on-chain transfers signed",
            },
            {
              label: "Markets resolved",
              value: metrics?.metrics.reduce((n, m) => n + m.n_resolved, 0) ?? "—",
              sub: "scored against the outcome",
            },
            {
              label: "Inference spend today",
              value: metrics ? `$${metrics.llm_cost_today.toFixed(3)}` : "—",
              sub: metrics?.model.split(".").pop() ?? "model",
              tone: "hold",
            },
          ]}
        />
      </section>

      {/* ── the running order ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1440px] px-4 pb-16 sm:px-6">
        <div className="mb-5 flex items-center gap-4">
          <SectionLabel className="min-w-0 flex-1">
            Tonight&rsquo;s running order — pick a story to put on air
          </SectionLabel>
          <Button variant="ghost" onClick={() => gate(discover)} disabled={discovering}>
            <RefreshCw
              className={`size-3.5 ${discovering ? "animate-spin" : ""}`}
              strokeWidth={2.5}
              aria-hidden
            />
            {discovering ? "Pulling wire" : "Refresh wire"}
          </Button>
        </div>

        <div className="monitor overflow-hidden">
          {loading ? (
            <div className="chyron px-4 py-16 text-center text-faint">
              Cueing the running order…
            </div>
          ) : markets.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="headline text-2xl text-white">Nothing on the wire</p>
              <p className="mx-auto mt-2 max-w-[48ch] text-[15px] text-dim">
                No open markets are cached yet. Pull the wire to discover live
                Manifold markets, or start the agent API if the desk is off air.
              </p>
              <Button variant="primary" className="mt-6" onClick={() => gate(discover)}>
                <RefreshCw className="size-3.5" strokeWidth={2.5} aria-hidden />
                Pull the wire
              </Button>
            </div>
          ) : (
            markets.map((m, i) => <MarketCard key={m.id} market={m} index={i} />)
          )}
        </div>
      </section>

      {/* ── the Bull Pool ─────────────────────────────────────────────── */}
      <section className="border-t border-rule bg-studio-2">
        <div className="mx-auto max-w-[1440px] px-4 py-16 sm:px-6">
          <div className="grid items-start gap-10 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <h2 className="headline text-[clamp(2rem,4.4vw,3.2rem)] text-white">
                The agent wins. A holder&rsquo;s name comes out of the hat.
              </h2>
              <p className="mt-5 max-w-[58ch] text-[16px] leading-relaxed text-dim">
                The Bull Pool is $BBC&rsquo;s payout mechanism: a share of everything
                the desk makes accumulates, and each round the pool is drawn on
                Solana and paid to randomly selected holders, weighted by holding.
                Nobody stakes their principal — the agent&rsquo;s edge is the yield,
                and the draw is verifiable on chain like every other trace it
                publishes.
              </p>
              <p className="mt-5 flex flex-wrap items-center gap-3">
                <Pill tone="hold">
                  <Ticket className="size-3" strokeWidth={2.5} aria-hidden />
                  Planned · not yet live
                </Pill>
                <span className="text-[14px] text-faint">
                  $BBC is not minted and the desk is in paper mode, so no pool has
                  accrued and no draw has run.
                </span>
              </p>
            </div>

            {/* the mechanism as a running order: the sequence is the information */}
            <ol className="monitor divide-y divide-rule">
              {[
                {
                  n: "Hold",
                  d: "Holding $BBC will enter you into every draw and open the live reasoning feed ahead of the public broadcast.",
                },
                {
                  n: "Trade",
                  d: "The desk runs its book. Proceeds are split between the agent's bankroll and the pool.",
                },
                {
                  n: "Draw",
                  d: "The pool is drawn on chain and paid straight to holder wallets. The transaction is the receipt.",
                },
              ].map((step, i) => (
                <li
                  key={step.n}
                  className="grid grid-cols-[auto_1fr] items-baseline gap-x-5 px-5 py-5"
                >
                  <span className="chyron numeric w-6 text-faint">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <span className="headline block text-xl text-red-bright">
                      {step.n}
                    </span>
                    <span className="mt-1.5 block max-w-[52ch] text-[14px] leading-relaxed text-dim">
                      {step.d}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}
