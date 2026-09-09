"use client";

/**
 * Open positions, each tagged FAST or SLOW — the barbell sleeve it was sized
 * under — with a link to the reasoning trace that is the closest available
 * record of the thesis behind the trade.
 */

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Pill, SectionLabel } from "@/components/ui";
import type { Position } from "@/lib/api";
import { cn } from "@/lib/utils";

const fmtPnl = (v: number | null | undefined) => {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;
};

const cents = (p: number | null | undefined) =>
  p == null ? "—" : `${(p * 100).toFixed(0)}¢`;

export function PositionsPanel({ positions }: { positions: Position[] }) {
  const open = positions.filter((p) => p.status === "open");

  return (
    <section>
      <SectionLabel className="mb-4">
        Open positions — notional, tagged by barbell leg
      </SectionLabel>

      <div className="monitor overflow-hidden">
        {open.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="headline text-xl text-white">Nothing open right now</p>
            <p className="mx-auto mt-2 max-w-[48ch] text-[14px] text-dim">
              The desk isn&rsquo;t carrying any positions at the moment.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left">
              <thead>
                <tr className="border-b border-rule">
                  <th className="chyron px-4 py-2.5 font-bold text-faint">Market</th>
                  <th className="chyron px-3 py-2.5 font-bold text-faint">Leg</th>
                  <th className="chyron px-3 py-2.5 font-bold text-faint">Side</th>
                  <th className="chyron px-3 py-2.5 text-right font-bold text-faint">Entry</th>
                  <th className="chyron px-3 py-2.5 text-right font-bold text-faint">
                    Paper P&L
                  </th>
                  <th className="chyron px-4 py-2.5 font-bold text-faint">Thesis</th>
                </tr>
              </thead>
              <tbody>
                {open.map((p) => (
                  <tr
                    key={p.id}
                    className="group border-b border-rule/70 transition-colors last:border-0 hover:bg-desk"
                  >
                    <td className="max-w-[24rem] px-4 py-3 text-[14px] text-ink">
                      <span className="truncate block">{p.question || p.market_id}</span>
                    </td>
                    <td className="px-3 py-3">
                      <Pill tone={p.leg === "fast" ? "red" : "monitor"}>
                        {(p.leg ?? "slow").toUpperCase()}
                      </Pill>
                    </td>
                    <td className="chyron px-3 py-3 text-dim">{p.side}</td>
                    <td className="numeric px-3 py-3 text-right text-[14px] text-dim">
                      {cents(p.entry_price)}
                    </td>
                    <td
                      className={cn(
                        "numeric px-3 py-3 text-right text-[14px]",
                        p.pnl == null ? "text-faint" : p.pnl >= 0 ? "text-up" : "text-down",
                      )}
                    >
                      {fmtPnl(p.pnl)}
                    </td>
                    <td className="px-4 py-3">
                      {p.entry_decision_id != null ? (
                        <Link
                          href={`/verify/${p.entry_decision_id}`}
                          className="chyron inline-flex items-center gap-1.5 text-monitor transition-colors hover:text-white"
                        >
                          Read the desk&rsquo;s thesis
                          <ArrowUpRight className="size-3" strokeWidth={2} aria-hidden />
                        </Link>
                      ) : (
                        <span className="chyron text-faint">no trace recorded</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="mt-2.5 text-[13px] text-faint">
        Paper P&L is simulated on Manifold — nothing here has settled in cash.
      </p>
    </section>
  );
}
