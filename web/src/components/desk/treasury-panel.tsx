"use client";

/**
 * The treasury readout — a notional USD book, never realized cash. The
 * drawdown figure is shown against the kill-switch line pulled live from
 * `risk_params.drawdown_kill_switch`, not hardcoded here.
 */

import { Pill, SectionLabel } from "@/components/ui";
import type { TreasuryResp } from "@/lib/api";
import { fmtPct, fmtUsd } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function TreasuryPanel({ treasury }: { treasury: TreasuryResp }) {
  const killSwitch = treasury.risk_params?.drawdown_kill_switch ?? null;
  const overKill = killSwitch != null && treasury.drawdown >= killSwitch;

  return (
    <section>
      <SectionLabel className="mb-4">Treasury (notional USD)</SectionLabel>
      <p className="mb-4 max-w-[70ch] text-[13.5px] leading-relaxed text-dim">
        This is a notional accounting book, not a wallet balance. The agent
        trades Manifold play-money in paper mode — no figure below is realized
        cash.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Pill tone="hold">Paper mode · notional book</Pill>
        <Pill tone={treasury.halted ? "down" : "neutral"}>
          {treasury.halted ? "Halted" : "Trading clear"} · as of last agent cycle
        </Pill>
      </div>

      <div className="monitor grid grid-cols-1 divide-y divide-rule sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
        <div className="px-5 py-4">
          <div className="chyron text-faint">Balance · notional</div>
          <div className="headline numeric mt-2 text-3xl leading-none text-white">
            {fmtUsd(treasury.balance)}
          </div>
          <div className="mt-1.5 text-[12px] text-faint">
            seeded at {fmtUsd(treasury.seed)}, notional
          </div>
        </div>
        <div className="px-5 py-4">
          <div className="chyron text-faint">High-water mark · notional</div>
          <div className="headline numeric mt-2 text-3xl leading-none text-white">
            {fmtUsd(treasury.high_water_mark)}
          </div>
          <div className="mt-1.5 text-[12px] text-faint">peak notional balance</div>
        </div>
        <div className="px-5 py-4">
          <div className="chyron text-faint">Drawdown vs kill switch</div>
          <div
            className={cn(
              "headline numeric mt-2 text-3xl leading-none",
              overKill ? "text-down" : "text-white",
            )}
          >
            {fmtPct(treasury.drawdown)}
          </div>
          <div className="mt-1.5 text-[12px] text-faint">
            kill switch at{" "}
            {killSwitch != null ? fmtPct(killSwitch) : "—"} drawdown (from
            risk_params)
          </div>
        </div>
      </div>
    </section>
  );
}
