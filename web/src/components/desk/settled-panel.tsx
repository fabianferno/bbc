"use client";

/**
 * Settled history and leg performance — from `/api/positions/settled`. Fast
 * and slow are always two separate rows; a blended win rate is never
 * computed. A leg with no settled trades reads "no settled trades", never 0%.
 */

import Link from "next/link";
import { Pill, SectionLabel } from "@/components/ui";
import type { LegPerformance, SettledPosition } from "@/lib/api";
import { fmtPct } from "@/lib/utils";
import { cn } from "@/lib/utils";

const fmtPnl = (v: number | null | undefined) => {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;
};

function LegRow({ leg, perf }: { leg: "fast" | "slow"; perf: LegPerformance }) {
  return (
    <tr className="border-b border-rule/70 transition-colors last:border-0 hover:bg-desk">
      <td className="px-4 py-3">
        <Pill tone={leg === "fast" ? "red" : "monitor"}>{leg.toUpperCase()}</Pill>
      </td>
      <td className="numeric px-3 py-3 text-right text-[14px] text-dim">{perf.settled}</td>
      <td className="numeric px-3 py-3 text-right text-[14px] text-white">
        {perf.win_rate == null ? "no settled trades" : fmtPct(perf.win_rate)}
      </td>
      <td
        className={cn(
          "numeric px-4 py-3 text-right text-[14px]",
          perf.realized_pnl_notional >= 0 ? "text-up" : "text-down",
        )}
      >
        {fmtPnl(perf.realized_pnl_notional)} notional
      </td>
    </tr>
  );
}

export function LegPerformancePanel({
  legPerformance,
}: {
  legPerformance: { fast: LegPerformance; slow: LegPerformance };
}) {
  return (
    <section>
      <SectionLabel className="mb-1">
        Leg performance — fast and slow, never blended
      </SectionLabel>
      <p className="mb-4 mt-2 text-[13px] text-faint">
        Each barbell sleeve is reported on its own line. A trade is scored under
        the leg it was opened under, even if it later ran long — a drifted fast
        trade is reported as a failed fast trade, not folded into the slow leg.
      </p>
      <div className="monitor overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-left">
          <thead>
            <tr className="border-b border-rule">
              <th className="chyron px-4 py-2.5 font-bold text-faint">Leg</th>
              <th className="chyron px-3 py-2.5 text-right font-bold text-faint">Settled</th>
              <th className="chyron px-3 py-2.5 text-right font-bold text-faint">Win rate</th>
              <th className="chyron px-4 py-2.5 text-right font-bold text-faint">
                Realized P&L (notional)
              </th>
            </tr>
          </thead>
          <tbody>
            <LegRow leg="fast" perf={legPerformance.fast} />
            <LegRow leg="slow" perf={legPerformance.slow} />
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function SettledHistoryPanel({ positions }: { positions: SettledPosition[] }) {
  return (
    <section>
      <SectionLabel className="mb-4">Settled history — notional P&L</SectionLabel>

      <div className="monitor overflow-hidden">
        {positions.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="headline text-xl text-white">Nothing has settled yet</p>
            <p className="mx-auto mt-2 max-w-[48ch] text-[14px] text-dim">
              No positions have closed. This table populates as the book settles.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-rule">
                  <th className="chyron px-4 py-2.5 font-bold text-faint">Market</th>
                  <th className="chyron px-3 py-2.5 font-bold text-faint">Leg</th>
                  <th className="chyron px-3 py-2.5 font-bold text-faint">Result</th>
                  <th className="chyron px-3 py-2.5 text-right font-bold text-faint">
                    Size (notional)
                  </th>
                  <th className="chyron px-4 py-2.5 text-right font-bold text-faint">
                    Realized P&L (notional)
                  </th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => {
                  const win = (p.pnl ?? 0) > 0;
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-rule/70 transition-colors last:border-0 hover:bg-desk"
                    >
                      <td className="max-w-[22rem] px-4 py-3 text-[14px] text-ink">
                        <Link
                          href={`/analyze/${encodeURIComponent(p.market_id)}`}
                          className="truncate block hover:text-white"
                        >
                          {p.question || p.market_id}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <Pill tone={p.leg === "fast" ? "red" : "monitor"}>
                          {(p.leg ?? "slow").toUpperCase()}
                        </Pill>
                      </td>
                      <td className="px-3 py-3">
                        <Pill tone={win ? "up" : "down"}>{win ? "Win" : "Loss"}</Pill>
                      </td>
                      <td className="numeric px-3 py-3 text-right text-[14px] text-dim">
                        {p.notional_in.toFixed(2)}
                      </td>
                      <td
                        className={cn(
                          "numeric px-4 py-3 text-right text-[14px]",
                          win ? "text-up" : "text-down",
                        )}
                      >
                        {fmtPnl(p.pnl)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="mt-2.5 text-[13px] text-faint">
        Every P&L figure here is notional — simulated on Manifold, never realized
        cash.
      </p>
    </section>
  );
}
