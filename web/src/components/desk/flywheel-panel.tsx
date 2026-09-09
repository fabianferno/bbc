"use client";

/**
 * The flywheel — SIMULATED. The notice from `/api/flywheel` is rendered
 * verbatim, in the open, on page load. Never behind a tooltip, accordion or
 * hover — that's the one honesty requirement this panel exists to satisfy.
 */

import { Pill, SectionLabel } from "@/components/ui";
import type { FlywheelResp } from "@/lib/api";
import { fmtUsd } from "@/lib/utils";

export function FlywheelPanel({ flywheel }: { flywheel: FlywheelResp }) {
  return (
    <section>
      <SectionLabel className="mb-4">Flywheel — simulated distribution</SectionLabel>

      <div className="monitor border-hold/45 px-5 py-4">
        <div className="chyron mb-1.5 flex items-center gap-2 text-hold">
          <Pill tone="hold">Simulated</Pill>
          Not executed
        </div>
        {/* the honesty notice — rendered verbatim, always visible */}
        <p className="text-[14px] leading-relaxed text-ink">{flywheel.notice}</p>
      </div>

      <div className="monitor mt-4 grid grid-cols-1 divide-y divide-rule sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4">
        <div className="px-5 py-4">
          <div className="chyron text-faint">Realized profit (notional)</div>
          <div className="headline numeric mt-2 text-2xl leading-none text-white">
            {fmtUsd(flywheel.realized_profit_usd)}
          </div>
          <div className="mt-1.5 text-[12px] text-faint">across {flywheel.events.length} profitable settlements</div>
        </div>
        <div className="px-5 py-4">
          <div className="chyron text-faint">Would-be treasury share</div>
          <div className="headline numeric mt-2 text-2xl leading-none text-white">
            {fmtUsd(flywheel.treasury_usd)}
          </div>
          <div className="mt-1.5 text-[12px] text-faint">50% split, simulated</div>
        </div>
        <div className="px-5 py-4">
          <div className="chyron text-faint">Would-be $ANSEM buy</div>
          <div className="headline numeric mt-2 text-2xl leading-none text-white">
            {fmtUsd(flywheel.ansem_usd)}
          </div>
          <div className="mt-1.5 text-[12px] text-faint">
            {flywheel.ansem_qty.toFixed(4)} $ANSEM at simulated spot · 35% split
          </div>
        </div>
        <div className="px-5 py-4">
          <div className="chyron text-faint">Would-be reserve</div>
          <div className="headline numeric mt-2 text-2xl leading-none text-white">
            {fmtUsd(flywheel.reserve_usd)}
          </div>
          <div className="mt-1.5 text-[12px] text-faint">15% split, simulated</div>
        </div>
      </div>

      <div className="monitor mt-4 overflow-hidden">
        {flywheel.events.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="headline text-lg text-white">No flywheel events yet</p>
            <p className="mx-auto mt-2 max-w-[48ch] text-[13px] text-dim">
              The flywheel only fires on a profitable settlement — nothing has
              settled with a positive notional P&L yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-rule">
                  <th className="chyron px-4 py-2.5 font-bold text-faint">Position</th>
                  <th className="chyron px-3 py-2.5 text-right font-bold text-faint">
                    Realized P&L
                  </th>
                  <th className="chyron px-3 py-2.5 text-right font-bold text-faint">
                    Treasury share
                  </th>
                  <th className="chyron px-3 py-2.5 text-right font-bold text-faint">
                    $ANSEM share
                  </th>
                  <th className="chyron px-4 py-2.5 text-right font-bold text-faint">
                    Reserve share
                  </th>
                </tr>
              </thead>
              <tbody>
                {flywheel.events.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-rule/70 transition-colors last:border-0 hover:bg-desk"
                  >
                    <td className="numeric px-4 py-2.5 text-[14px] text-dim">
                      #{e.position_id}
                    </td>
                    <td className="numeric px-3 py-2.5 text-right text-[14px] text-up">
                      +{e.realized_pnl.toFixed(2)}
                    </td>
                    <td className="numeric px-3 py-2.5 text-right text-[14px] text-dim">
                      {e.treasury_share.toFixed(2)}
                    </td>
                    <td className="numeric px-3 py-2.5 text-right text-[14px] text-dim">
                      {e.ansem_share.toFixed(2)}
                      {e.ansem_price_usd == null && (
                        <span className="chyron ml-1.5 text-faint">no spot price</span>
                      )}
                    </td>
                    <td className="numeric px-4 py-2.5 text-right text-[14px] text-dim">
                      {e.reserve_share.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
