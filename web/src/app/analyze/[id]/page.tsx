"use client";

/**
 * One market, put on air. The question is the headline; the agent's pipeline is
 * the rundown down the left, lighting up segment by segment as it clears; the
 * graph is the studio wall; the call is the payoff.
 */

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight, Radio, RotateCw } from "lucide-react";
import { DecisionCard } from "@/components/decision-card";
import { EvidenceFeed } from "@/components/evidence-feed";
import { GraphCanvas } from "@/components/graph-canvas";
import { OnchainPanel } from "@/components/onchain-panel";
import { OntologyPanel } from "@/components/ontology-panel";
import { LiveLamp, Slug, StudioClock } from "@/components/broadcast";
import { Button, Pill, SectionLabel } from "@/components/ui";
import { api } from "@/lib/api";
import { useOnAir } from "@/components/channel-frame";
import { useRequireAuth } from "@/lib/auth";
import type { Market } from "@/lib/types";
import { cn } from "@/lib/utils";
import { type Phase, useAnalyzeStream } from "@/lib/useAnalyzeStream";

/** The running order of the segment: what the desk does, in order. */
const SEGMENTS: { key: string; label: string; note: string; phases: Phase[] }[] = [
  {
    key: "search",
    label: "Read the wire",
    note: "Date-bounded search, filtered by the temporal guard",
    phases: ["filtering", "searching"],
  },
  {
    key: "onto",
    label: "Draw the schema",
    note: "The entity and relation types this question needs",
    phases: ["ontology"],
  },
  {
    key: "graph",
    label: "Build the board",
    note: "Entities and relations extracted from the sources",
    phases: ["extracting"],
  },
  {
    key: "reason",
    label: "Price the question",
    note: "Its own probability, against what the market charges",
    phases: ["reasoning"],
  },
  {
    key: "settle",
    label: "Settle the position",
    note: "Paper trade recorded, transfer signed on Solana",
    phases: ["settling"],
  },
  {
    key: "anchor",
    label: "Anchor the trace",
    note: "The reasoning hash written on chain, checkable later",
    phases: ["anchoring"],
  },
];

const ORDER: Phase[] = [
  "idle", "connecting", "filtering", "searching", "ontology",
  "extracting", "reasoning", "settling", "anchoring", "done",
];

function phaseRank(p: Phase): number {
  return ORDER.indexOf(p);
}

const PHASE_COPY: Record<Phase, string> = {
  idle: "Off air",
  connecting: "Cueing the feed",
  filtering: "Checking the market is workable",
  searching: "Reading the wire",
  ontology: "Drawing the schema",
  extracting: "Building the board",
  reasoning: "Pricing the question",
  settling: "Settling the position",
  anchoring: "Anchoring the trace",
  done: "Off air — segment complete",
  error: "Feed dropped",
};

export default function AnalyzePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const marketId = decodeURIComponent(id);
  const { state, start, running } = useAnalyzeStream(marketId);
  const gate = useRequireAuth();
  const [seedAvailable, setSeedAvailable] = useState(false);
  const [premarket, setPremarket] = useState<Market | null>(null);

  useEffect(() => {
    api.markets(60).then((r) => {
      setSeedAvailable(r.seeds.some((s) => s.startsWith(marketId.replace(/:/g, "_"))));
      setPremarket(r.markets.find((m) => m.id === marketId) ?? null);
    }).catch(() => {});
  }, [marketId]);

  const market = state.market ?? premarket;
  const rank = phaseRank(state.phase);
  const started = state.phase !== "idle";

  const statusTone = useMemo(() => {
    if (state.phase === "error") return "down" as const;
    if (state.phase === "done") return "up" as const;
    return running ? "monitor" as const : "neutral" as const;
  }, [state.phase, running]);

  const strap = state.error
    ? `Feed dropped — ${state.error}`
    : started
      ? PHASE_COPY[state.phase]
      : `${market?.venue ?? "Market"} · ${market?.category ?? "uncategorised"} — put it on air to see the desk work it`;

  useOnAir({
    headline: market?.question ?? marketId,
    strap,
    brandSuffix: "On air",
    cut: started ? "live" : "standby",
  });

  return (
    <div>
      {/* ── the headline ────────────────────────────────────────────── */}
      <section className="studio relative isolate overflow-hidden border-b border-rule">
        <div className="mx-auto max-w-[1500px] px-4 pb-8 pt-8 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="chyron inline-flex items-center gap-1.5 text-faint transition-colors hover:text-red-bright"
            >
              <ArrowLeft className="size-3.5" strokeWidth={2.5} aria-hidden />
              Running order
            </Link>
            <span className="h-3 w-px bg-rule" aria-hidden />
            {running ? (
              <LiveLamp label="On air" />
            ) : (
              <Slug tone="dim">{PHASE_COPY[state.phase]}</Slug>
            )}
            <span className="h-3 w-px bg-rule" aria-hidden />
            <StudioClock className="chyron text-dim" />
          </div>

          <h1 className="headline mt-6 max-w-[24ch] text-[clamp(2rem,5vw,3.4rem)] text-white">
            {market?.question ?? marketId}
          </h1>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0 flex-1">
              <div className="chyron flex flex-wrap items-center gap-2.5 text-faint">
                <span className="text-dim">{market?.venue ?? "—"}</span>
                <span aria-hidden>·</span>
                <span>{market?.category ?? "uncategorised"}</span>
                {market?.last_price_yes != null && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="numeric text-white">
                      market {Math.round(market.last_price_yes * 100)}% on yes
                    </span>
                  </>
                )}
                {market?.market_url && (
                  <>
                    <span aria-hidden>·</span>
                    <a
                      href={market.market_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 transition-colors hover:text-red-bright"
                    >
                      view on {market.venue}
                      <ArrowUpRight className="size-3" strokeWidth={2.5} aria-hidden />
                    </a>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Pill tone={statusTone}>{state.phase}</Pill>
              {seedAvailable && (
                <Button variant="ghost" onClick={() => start(true)} disabled={running}>
                  Replay from tape
                </Button>
              )}
              <Button
                variant="primary"
                onClick={() => gate(() => start(false))}
                disabled={running}
              >
                {running ? (
                  <RotateCw className="size-3.5 animate-spin" strokeWidth={2.5} aria-hidden />
                ) : (
                  <Radio className="size-3.5" strokeWidth={2.5} aria-hidden />
                )}
                {running ? "On air" : started ? "Run it again" : "Put this market on air"}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_1fr_390px]">
          {/* ── the rundown ─────────────────────────────────────────── */}
          <div className="flex flex-col gap-5">
            <section className="monitor overflow-hidden">
              <div className="border-b border-rule px-4 py-3">
                <SectionLabel>Segment rundown</SectionLabel>
              </div>
              <ol className="divide-y divide-rule">
                {SEGMENTS.map((seg, i) => {
                  const minRank = Math.min(...seg.phases.map(phaseRank));
                  const done = rank > Math.max(...seg.phases.map(phaseRank));
                  const active = seg.phases.includes(state.phase);
                  const pending = !active && !done;
                  return (
                    <li
                      key={seg.key}
                      className={cn(
                        "grid grid-cols-[auto_1fr_auto] items-start gap-x-3 px-4 py-3 transition-colors",
                        active && "bg-desk",
                      )}
                    >
                      <span
                        className={cn(
                          "chyron numeric mt-0.5 w-5",
                          active ? "text-red-bright" : done ? "text-dim" : "text-faint",
                        )}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={cn(
                            "block text-[14px] leading-snug",
                            active ? "text-white" : done ? "text-ink" : "text-faint",
                          )}
                        >
                          {seg.label}
                        </span>
                        <span
                          className={cn(
                            "mt-1 block text-[12.5px] leading-snug",
                            pending ? "text-faint/70" : "text-dim",
                          )}
                        >
                          {seg.note}
                        </span>
                      </span>
                      <span className="chyron mt-0.5 shrink-0">
                        {active ? (
                          <span className="inline-flex items-center gap-1.5 text-red-bright">
                            <span className="lamp" aria-hidden />
                            Live
                          </span>
                        ) : done ? (
                          <span className="text-up">Clear</span>
                        ) : rank >= minRank ? (
                          <span className="text-faint">Queued</span>
                        ) : (
                          <span className="text-faint/60">—</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {state.searchCount != null && (
                <p className="chyron border-t border-rule px-4 py-2.5 text-faint">
                  <span className="numeric text-dim">{state.searchCount}</span> sources
                  cleared the guard
                </p>
              )}
            </section>

            <OntologyPanel
              ontology={state.ontology}
              nodeCount={state.nodes.length}
              edgeCount={state.edges.length}
            />

            <EvidenceFeed citations={state.evidence} />
          </div>

          {/* ── the studio wall ─────────────────────────────────────── */}
          <div className="monitor relative min-h-[560px] overflow-hidden">
            <div className="chyron absolute left-4 top-3 z-10 flex items-center gap-2 text-faint">
              <span>Knowledge graph</span>
              <span aria-hidden>·</span>
              <span className="numeric text-dim">
                {state.nodes.length} entities / {state.edges.length} relations
              </span>
            </div>
            <GraphCanvas nodes={state.nodes} edges={state.edges} />
          </div>

          {/* ── the payoff ──────────────────────────────────────────── */}
          <div className="flex flex-col gap-5">
            <DecisionCard decision={state.decision} />

            {state.executed && (
              <section className="monitor px-4 py-3.5">
                <SectionLabel>Paper ticket</SectionLabel>
                <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
                  <span className="headline text-xl text-white">
                    {String(state.executed.side ?? "—")}{" "}
                    <span className="numeric text-dim">
                      ${String(state.executed.usd_size ?? "—")}
                    </span>
                  </span>
                  <Pill tone={state.executed.status === "filled" ? "up" : "hold"}>
                    {String(state.executed.status)}
                  </Pill>
                </div>
                <p className="chyron mt-2 text-faint">Simulated stake · no cash at risk</p>
                {typeof state.executed.market_url === "string" && (
                  <a
                    href={state.executed.market_url}
                    target="_blank"
                    rel="noreferrer"
                    className="chyron mt-3 inline-flex items-center gap-1 text-faint transition-colors hover:text-red-bright"
                  >
                    view on {String(state.executed.venue ?? "venue")}
                    <ArrowUpRight className="size-3" strokeWidth={2.5} aria-hidden />
                  </a>
                )}
              </section>
            )}

            <OnchainPanel
              settled={state.settled}
              anchored={state.anchored}
              decisionId={state.decision?.decision_id}
              active={state.phase === "anchoring" || state.phase === "settling"}
            />
          </div>
        </div>

        {state.error && (
          <section className="monitor mt-5 border-down/45 px-4 py-4">
            <SectionLabel>Off air</SectionLabel>
            <p className="headline mt-2 text-xl text-white">The feed dropped</p>
            <p className="mt-1.5 max-w-[70ch] text-[14px] leading-relaxed text-dim">
              {state.error}. Nothing above this point is lost — put the market back on
              air to run the segment again, or replay from tape if a recording exists.
            </p>
          </section>
        )}

        {!started && (
          <section className="monitor mt-5 px-6 py-10 text-center">
            <p className="headline text-2xl text-white">This market is not on air yet</p>
            <p className="mx-auto mt-2.5 max-w-[58ch] text-[15px] leading-relaxed text-dim">
              Nothing has been searched, graphed or priced. Put it on air and the desk
              will work the six segments above in order, on camera, and anchor the
              reasoning trace on Solana when it is done.
            </p>
            <Button
              variant="primary"
              className="mt-6"
              onClick={() => gate(() => start(false))}
            >
              <Radio className="size-3.5" strokeWidth={2.5} aria-hidden />
              Put this market on air
            </Button>
          </section>
        )}
      </div>
    </div>
  );
}
