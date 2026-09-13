"use client";

/**
 * The bottom of the screen, on every page: the lower third and the rolling
 * tape, fixed as one block of on-air furniture. Pages do not draw the red bar
 * themselves — they publish what it should say through `useOnAir`, and this
 * frame keeps it in the same place on every route, as a broadcast does.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { LowerThird, Ticker, type TickerItem } from "@/components/broadcast";
import { api, type MetricsResp } from "@/lib/api";
import type { Market } from "@/lib/types";

/* ── what the bar is saying ─────────────────────────────────────────────── */

export type Bulletin = {
  headline: ReactNode;
  strap?: ReactNode;
  /** the strand name under the channel mark, e.g. "Markets", "Night desk" */
  brandSuffix?: string;
  /** bump to re-key the bar so the wipe replays on a genuine cut */
  cut?: string | number;
};

const FALLBACK: Bulletin = {
  headline: "The agent that reports its own trades",
  strap:
    "BBC runs a calibrated prediction-market book and broadcasts every decision it makes, on the record",
  brandSuffix: "Markets",
};

const BroadcastCtx = createContext<{
  set: (b: Bulletin | null) => void;
} | null>(null);

/**
 * Publish this page's bulletin to the fixed lower third. Clears itself on
 * unmount so a route change never leaves the previous page's headline on air.
 */
export function useOnAir(bulletin: Bulletin | null) {
  const ctx = useContext(BroadcastCtx);
  const { headline, strap, brandSuffix, cut } = bulletin ?? {};

  useEffect(() => {
    if (!ctx) return;
    ctx.set(bulletin ? { headline, strap, brandSuffix, cut } : null);
    return () => ctx.set(null);
    // the bulletin object is rebuilt every render; its fields are the real deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, headline, strap, brandSuffix, cut]);
}

/* ── the tape ───────────────────────────────────────────────────────────── */

const STANDBY: TickerItem[] = [
  { tag: "Standby", text: "Newsroom feed offline — start the agent API to resume the tape" },
  { tag: "Phase", text: "Testnet alpha runs in paper mode: trades are simulated on Manifold" },
  { tag: "$BBC", text: "Bull Pool draws will distribute agent proceeds to random $BBC holders" },
];

function pct(n: number | null | undefined) {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

function buildTape(markets: Market[], metrics: MetricsResp | null): TickerItem[] {
  const lines: TickerItem[] = [];

  if (metrics) {
    lines.push({
      tag: "On chain",
      text: `${metrics.anchor_count} reasoning traces anchored · ${metrics.settle_count} settlements`,
    });
    lines.push({
      tag: "Desk cost",
      text: `$${metrics.llm_cost_today.toFixed(3)} of inference spent today`,
      tone: "hold",
    });
    for (const m of metrics.metrics.slice(0, 4)) {
      if (m.n_resolved === 0) continue;
      lines.push({
        tag: m.category || "Uncategorised",
        text: `${m.n_resolved} resolved · Brier ${m.brier?.toFixed(3) ?? "—"} · paper P&L ${
          m.realized_pnl >= 0 ? "+" : ""
        }${m.realized_pnl.toFixed(2)}`,
        tone: m.realized_pnl >= 0 ? "up" : "down",
      });
    }
  }

  for (const m of markets.slice(0, 10)) {
    lines.push({
      tag: m.category || m.venue,
      text: `${m.question} — market ${pct(m.last_price_yes)}`,
    });
  }

  return lines.length ? lines : STANDBY;
}

/* ── the frame ──────────────────────────────────────────────────────────── */

export function ChannelFrame({ children }: { children: ReactNode }) {
  const [bulletin, setBulletin] = useState<Bulletin | null>(null);
  const [items, setItems] = useState<TickerItem[]>(STANDBY);

  const ctx = useMemo(() => ({ set: setBulletin }), []);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([api.markets(12), api.metrics()]).then(([mk, mt]) => {
      if (!alive) return;
      setItems(
        buildTape(
          mk.status === "fulfilled" ? mk.value.markets : [],
          mt.status === "fulfilled" ? mt.value : null,
        ),
      );
    });
    return () => {
      alive = false;
    };
  }, []);

  const on = bulletin ?? FALLBACK;

  return (
    <BroadcastCtx.Provider value={ctx}>
      {/* clears the fixed furniture: lower third (~124px) plus tape (~36px) */}
      <main className="relative z-10 pb-[10.5rem]">{children}</main>

      <div id="tour-lowerthird" className="fixed inset-x-0 bottom-0 z-40">
        <LowerThird
          key={String(on.cut ?? "") + String(on.brandSuffix ?? "")}
          brandSuffix={on.brandSuffix ?? "Markets"}
          headline={on.headline}
          strap={on.strap}
        />
        <Ticker items={items} speed={Math.max(48, items.length * 7)} />
      </div>
    </BroadcastCtx.Provider>
  );
}
