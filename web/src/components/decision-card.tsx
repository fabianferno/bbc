"use client";

/**
 * The verdict, read out. A lower third — the call, at headline scale, in the
 * tone colour — sitting above a scorecard: the agent's number against the
 * market's, the gap between them, how sure it is, and the script it read from.
 */

import type { Decision } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Pill, SectionLabel } from "./ui";

const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;

export function DecisionCard({ decision }: { decision: Decision | null }) {
  if (!decision) {
    return (
      <section className="monitor overflow-hidden">
        <div className="border-b border-rule px-4 py-3">
          <SectionLabel>The call</SectionLabel>
        </div>
        <div className="px-4 py-8">
          <p className="headline text-2xl text-white">Nothing to report yet</p>
          <p className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-dim">
            The desk reads the graph, prices the question itself, and compares that
            number with what the market is charging. If the gap is big enough to
            pay for the risk, it takes a side — otherwise it passes and says so.
          </p>
        </div>
      </section>
    );
  }

  const { p_yes, market_price, edge, confidence, action, rationale } = decision;
  const enter = action.startsWith("enter");
  const side = action === "enter_yes" ? "YES" : action === "enter_no" ? "NO" : null;
  const call = enter ? `Buy ${side}` : "Pass";
  const tone = !enter ? "hold" : side === "YES" ? "up" : "down";

  const bar = {
    up: "bg-up",
    down: "bg-down",
    hold: "bg-hold",
  }[tone];
  const text = {
    up: "text-up",
    down: "text-down",
    hold: "text-hold",
  }[tone];

  const agentPos = Math.min(100, Math.max(0, p_yes * 100));
  const marketPos = Math.min(100, Math.max(0, market_price * 100));

  return (
    <section className="monitor monitor-lit overflow-hidden">
      {/* the lower third: the call itself */}
      <div className="cut-in flex items-end justify-between gap-4 bg-red px-4 py-3">
        <span>
          <span className="chyron block text-white/80">The desk calls it</span>
          <span className="headline mt-1 block text-[clamp(1.9rem,5vw,2.6rem)] leading-none text-white">
            {call.toUpperCase()}
          </span>
        </span>
        <Pill className="shrink-0 border-white/40 bg-white/10 text-white">
          Paper mode
        </Pill>
      </div>

      {/* the central comparison: the agent's number against the market's */}
      <div className="border-b border-rule px-4 py-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="chyron text-faint">Agent prices YES at</div>
            <div className={cn("headline numeric mt-1.5 text-4xl leading-none", text)}>
              {pct1(p_yes)}
            </div>
          </div>
          <div className="text-right">
            <div className="chyron text-faint">Market is charging</div>
            <div className="headline numeric mt-1.5 text-4xl leading-none text-dim">
              {pct1(market_price)}
            </div>
          </div>
        </div>

        {/* the scale both numbers sit on */}
        <div className="relative mt-5 h-1.5 w-full bg-desk">
          <div
            className={cn("absolute inset-y-0 left-0", bar)}
            style={{ width: `${agentPos}%` }}
            aria-hidden
          />
          <span
            className="absolute -top-1 h-[calc(100%+0.5rem)] w-0.5 bg-white"
            style={{ left: `${marketPos}%` }}
            aria-hidden
          />
        </div>
        <div className="chyron mt-2 flex justify-between text-faint">
          <span>0%</span>
          <span className="text-dim">white line · market price</span>
          <span>100%</span>
        </div>
      </div>

      {/* the scorecard */}
      <dl className="grid grid-cols-3 divide-x divide-rule border-b border-rule">
        <div className="px-4 py-3.5">
          <dt className="chyron text-faint">Edge</dt>
          <dd
            className={cn(
              "headline numeric mt-1.5 text-2xl leading-none",
              edge >= 0 ? "text-up" : "text-down",
            )}
          >
            {edge >= 0 ? "+" : ""}
            {(edge * 100).toFixed(1)}pp
          </dd>
        </div>
        <div className="px-4 py-3.5">
          <dt className="chyron text-faint">Confidence</dt>
          <dd className="headline numeric mt-1.5 text-2xl leading-none text-white">
            {pct1(confidence)}
          </dd>
        </div>
        <div className="px-4 py-3.5">
          <dt className="chyron text-faint">Decision</dt>
          <dd className="headline numeric mt-1.5 text-2xl leading-none text-dim">
            #{decision.decision_id}
          </dd>
        </div>
      </dl>

      {rationale && (
        <div className="cut-up px-4 py-4">
          <SectionLabel>Why it called it that way</SectionLabel>
          <p className="mt-3 max-w-[68ch] text-[14px] leading-[1.65] text-ink">
            {rationale}
          </p>
        </div>
      )}

      <p className="chyron border-t border-rule px-4 py-2.5 text-faint">
        Simulated on Manifold · no cash at risk
      </p>
    </section>
  );
}
