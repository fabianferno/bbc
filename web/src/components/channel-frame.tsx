"use client";

/**
 * The bottom of the screen, on every page: the rolling tape. It reads from the
 * same endpoints the pages do, so the tape is never a decoration — it is the
 * agent's live book and the state of the broadcast.
 */

import { useEffect, useState } from "react";
import { Ticker, type TickerItem } from "@/components/broadcast";
import { api, type MetricsResp } from "@/lib/api";
import type { Market } from "@/lib/types";

const STANDBY: TickerItem[] = [
  { tag: "Standby", text: "Newsroom feed offline — start the agent API to resume the tape" },
  { tag: "Phase", text: "Testnet alpha runs in paper mode: trades are simulated on Manifold" },
  { tag: "$BBC", text: "Bull Pool draws distribute agent proceeds to random $BBC holders" },
];

function pct(n: number | null | undefined) {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

export function ChannelFrame() {
  const [items, setItems] = useState<TickerItem[]>(STANDBY);

  useEffect(() => {
    let alive = true;

    const build = (markets: Market[], metrics: MetricsResp | null): TickerItem[] => {
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
            text: `${m.n_resolved} resolved · Brier ${m.brier?.toFixed(3) ?? "—"} · paper P&L ${m.realized_pnl >= 0 ? "+" : ""}${m.realized_pnl.toFixed(2)}`,
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
    };

    Promise.allSettled([api.markets(12), api.metrics()]).then(([mk, mt]) => {
      if (!alive) return;
      setItems(
        build(
          mk.status === "fulfilled" ? mk.value.markets : [],
          mt.status === "fulfilled" ? mt.value : null,
        ),
      );
    });

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-rule">
      <Ticker items={items} speed={Math.max(48, items.length * 7)} />
    </div>
  );
}
