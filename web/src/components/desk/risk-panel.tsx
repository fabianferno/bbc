"use client";

/**
 * Risk parameters, rendered straight from `/api/treasury`'s `risk_params`
 * object — never a number typed into this component. That is the entire
 * point of the panel: a pinned dashboard figure can't drift from the limit
 * the code enforces.
 */

import { Pill, SectionLabel } from "@/components/ui";
import type { BreakerState, TreasuryResp } from "@/lib/api";
import { fmtPct } from "@/lib/utils";

const LABELS: Record<string, string> = {
  max_position_fraction: "Max position size",
  fast_leg_deployment_cap: "Fast-leg deployment cap",
  slow_leg_cap: "Slow-leg deployment cap",
  category_concentration_cap: "Category concentration cap",
  drawdown_kill_switch: "Drawdown kill switch",
  fast_sleeve: "Fast sleeve allocation",
  slow_sleeve: "Slow sleeve allocation",
  fast_leg_max_hours: "Fast-leg max hold",
};

/** Which breaker (by name) most directly reports on this risk parameter, if any. */
const BREAKER_FOR_PARAM: Record<string, string> = {
  drawdown_kill_switch: "drawdown",
};

function humanize(key: string) {
  return LABELS[key] ?? key.replace(/_/g, " ");
}

function formatValue(key: string, value: number) {
  if (key === "fast_leg_max_hours") return `${value}h`;
  return fmtPct(value);
}

/** Live utilisation of a cap, derived from what the treasury endpoint reports —
 * never a second hardcoded number. Returns null when nothing is derivable. */
function utilisation(key: string, treasury: TreasuryResp): string | null {
  const { balance, drawdown, deployed, risk_params } = treasury;
  if (key === "drawdown_kill_switch") {
    const cap = risk_params.drawdown_kill_switch;
    if (!cap) return null;
    return `${fmtPct(drawdown)} of ${fmtPct(cap)} used`;
  }
  if (key === "fast_leg_deployment_cap" && balance > 0) {
    const cap = balance * risk_params.fast_leg_deployment_cap;
    return cap > 0 ? `${fmtPct(deployed.fast / cap)} of cap deployed` : null;
  }
  if (key === "slow_leg_cap" && balance > 0) {
    const cap = balance * risk_params.slow_leg_cap;
    return cap > 0 ? `${fmtPct(deployed.slow / cap)} of cap deployed` : null;
  }
  if (key === "fast_sleeve" && balance > 0) {
    const budget = balance * risk_params.fast_sleeve;
    return budget > 0 ? `${fmtPct(deployed.fast / budget)} of sleeve deployed` : null;
  }
  if (key === "slow_sleeve" && balance > 0) {
    const budget = balance * risk_params.slow_sleeve;
    return budget > 0 ? `${fmtPct(deployed.slow / budget)} of sleeve deployed` : null;
  }
  return null;
}

function breakerFor(key: string, breakers: BreakerState[]): BreakerState | null {
  const name = BREAKER_FOR_PARAM[key];
  if (!name) return null;
  return breakers.find((b) => b.name === name) ?? null;
}

export function RiskPanel({ treasury }: { treasury: TreasuryResp }) {
  const rows = Object.entries(treasury.risk_params);

  return (
    <section>
      <SectionLabel className="mb-1">Risk parameters</SectionLabel>
      <p className="mb-4 mt-2 max-w-[70ch] text-[13px] text-faint">
        Every limit below is read live from the agent&rsquo;s risk engine — this
        panel cannot hardcode a number the code doesn&rsquo;t enforce. Breaker
        state reflects the agent loop&rsquo;s last evaluation, not real-time risk
        — the read-only API can lag by up to one agent cycle.
      </p>

      <div className="monitor overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b border-rule">
              <th className="chyron px-4 py-2.5 font-bold text-faint">Parameter</th>
              <th className="chyron px-3 py-2.5 text-right font-bold text-faint">Limit</th>
              <th className="chyron px-3 py-2.5 font-bold text-faint">Live utilisation</th>
              <th className="chyron px-4 py-2.5 text-right font-bold text-faint">Breaker</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([key, value]) => {
              const breaker = breakerFor(key, treasury.breakers);
              const util = utilisation(key, treasury);
              return (
                <tr
                  key={key}
                  className="border-b border-rule/70 transition-colors last:border-0 hover:bg-desk"
                >
                  <td className="px-4 py-2.5 text-[14px] text-ink">{humanize(key)}</td>
                  <td className="numeric px-3 py-2.5 text-right text-[14px] text-white">
                    {formatValue(key, value)}
                  </td>
                  <td className="numeric px-3 py-2.5 text-[13px] text-dim">
                    {util ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {breaker ? (
                      <Pill tone={breaker.tripped ? "down" : "up"}>
                        {breaker.tripped ? "Tripped" : "Clear"} · as of last cycle
                      </Pill>
                    ) : (
                      <span className="chyron text-faint">no direct breaker</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {treasury.breakers.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {treasury.breakers.map((b) => (
            <Pill key={b.name} tone={b.tripped ? "down" : "neutral"}>
              {b.name}: {b.tripped ? b.reason ?? "tripped" : "clear"}
            </Pill>
          ))}
        </div>
      )}
    </section>
  );
}
