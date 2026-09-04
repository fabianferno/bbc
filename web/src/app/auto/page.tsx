"use client";

/**
 * The night desk. The agent works markets unattended; this page is the gallery
 * log of that broadcast — an on-air header, a lower third that re-keys on every
 * cut to a new market, and the stream itself as a running transcript.
 */

import Link from "next/link";
import { useMemo } from "react";
import { Radio, RotateCw, ArrowUpRight } from "lucide-react";
import {
  BreakingCutIn,
  LiveLamp,
  Slug,
  StudioClock,
} from "@/components/broadcast";
import { Button, Pill, SectionLabel, ReadoutStrip } from "@/components/ui";
import { useOnAir } from "@/components/channel-frame";
import { useRequireAuth } from "@/lib/auth";
import { cn, fmtPct, truncHash } from "@/lib/utils";
import { explorerTxUrl } from "@/lib/solana";
import { type AutoItem, useAutoStream } from "@/lib/useAutoStream";

/* ── the transcript ────────────────────────────────────────────────────── */

type Tone = "neutral" | "red" | "up" | "down" | "hold";

type LogLine = {
  id: string;
  time: string;
  slot: number;
  tag: string;
  tone: Tone;
  text: string;
  href?: string;
  hrefLabel?: string;
};

const stamp = () =>
  new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

/** Phases the item has passed once the graph is closed. */
const AFTER_GRAPH = ["reasoning", "settling", "anchoring", "anchored", "done"];

function sideOf(action: string | undefined) {
  return action === "enter_yes" ? "YES" : action === "enter_no" ? "NO" : null;
}

/** Everything the desk has said about one market, in the order it said it. */
function milestones(it: AutoItem): Omit<LogLine, "id" | "time">[] {
  const out: Omit<LogLine, "id" | "time">[] = [];
  const slot = it.index + 1;

  out.push({
    slot,
    tag: "Cue",
    tone: "red",
    text: `Story ${slot} to air — ${it.market.question}`,
    ...(it.market.market_url
      ? { href: it.market.market_url, hrefLabel: "market" }
      : {}),
  });

  if (it.market.price_yes != null) {
    out.push({
      slot,
      tag: "Wire",
      tone: "neutral",
      text: `Market opens the question at ${Math.round(it.market.price_yes * 100)}% on YES`,
    });
  }
  if (it.entityTypes.length > 0) {
    out.push({
      slot,
      tag: "Ontology",
      tone: "neutral",
      text: `Schema drawn — ${it.entityTypes.slice(0, 5).join(", ")}`,
    });
  }
  if (it.nodeCount > 0 && AFTER_GRAPH.includes(it.phase)) {
    out.push({
      slot,
      tag: "Graph",
      tone: "neutral",
      text: `${it.nodeCount} entities and ${it.edgeCount} relations on the board`,
    });
  }
  if (it.decision) {
    const s = sideOf(it.decision.action);
    const enter = it.decision.action.startsWith("enter");
    out.push({
      slot,
      tag: "Decision",
      tone: enter ? (s === "YES" ? "up" : "down") : "hold",
      text: enter
        ? `Buy ${s} — agent prices YES at ${fmtPct(it.decision.p_yes)}, edge ${
            it.decision.edge >= 0 ? "+" : ""
          }${(it.decision.edge * 100).toFixed(1)}pp`
        : `Pass — no gap worth paying for at ${fmtPct(it.decision.p_yes)}`,
      href: `/verify/${it.decision.decision_id}`,
      hrefLabel: "verify",
    });
  }
  if (it.settled) {
    out.push({
      slot,
      tag: "Settled",
      tone: "neutral",
      text: `Transfer signed on Solana · ${truncHash(it.settled.tx_hash, 6)}`,
      href: it.settled.explorer_url || explorerTxUrl(it.settled.tx_hash),
      hrefLabel: "explorer",
    });
  }
  if (it.anchored) {
    out.push({
      slot,
      tag: "Anchored",
      tone: "up",
      text: `${
        it.anchored.mocked ? "Mock trace" : "Reasoning trace"
      } written to Solana · ${truncHash(it.anchored.tx_hash, 6)}`,
      href: it.anchored.explorer_url || explorerTxUrl(it.anchored.tx_hash),
      hrefLabel: "explorer",
    });
  }
  if (it.error) {
    out.push({ slot, tag: "Fault", tone: "down", text: it.error });
  }
  if (it.phase === "done") {
    out.push({ slot, tag: "Clear", tone: "neutral", text: `Story ${slot} off air` });
  }
  return out;
}

/** When each log line first came up on the gallery, keyed by line id. */
const TIMES = new Map<string, string>();

const toneText: Record<Tone, string> = {
  neutral: "text-dim",
  red: "text-red-bright",
  up: "text-up",
  down: "text-down",
  hold: "text-hold",
};

/* ── the page ──────────────────────────────────────────────────────────── */

export default function AutoPage() {
  const { items, status, start } = useAutoStream();
  const gate = useRequireAuth();
  const running = status === "running";

  // the gallery log: each line keeps the wall-clock time it first appeared
  const log = useMemo(() => {
    if (items.length === 0) {
      TIMES.clear();
      return [] as LogLine[];
    }
    const out: LogLine[] = [];
    for (const it of items) {
      milestones(it).forEach((m, i) => {
        const id = `${it.index}:${m.tag}:${i}:${m.text}`;
        let time = TIMES.get(id);
        if (!time) {
          time = stamp();
          TIMES.set(id, time);
        }
        out.push({ ...m, id, time });
      });
    }
    return out.reverse();
  }, [items]);

  // the last call the desk made — cut in over the log when it lands
  const lastDecision = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].decision) return items[i];
    }
    return null;
  }, [items]);

  const current = items[items.length - 1];
  const traded = items.filter((i) => i.decision?.action.startsWith("enter")).length;
  const anchored = items.filter((i) => i.anchored).length;

  const statusLine =
    status === "running"
      ? `Working story ${items.length || 1} — the desk cuts to the next market on its own`
      : status === "done"
        ? `Run complete · ${items.length} markets worked, ${traded} traded, ${anchored} anchored`
        : status === "error"
          ? "The feed dropped mid-broadcast"
          : "Standing by — the desk is unattended and takes no instruction once it starts";

  useOnAir({
    headline: current ? current.market.question : "The desk is standing by",
    strap: statusLine,
    brandSuffix: "Night desk",
    cut: current ? current.index : "standby",
  });

  return (
    <div>
      {/* ── on-air header ───────────────────────────────────────────── */}
      <section className="studio relative isolate overflow-hidden border-b border-rule">
        <div className="mx-auto grid max-w-[1440px] grid-cols-1 items-end gap-6 px-4 pb-0 pt-10 sm:px-6">
          <div className="min-w-0 lg:pb-8">
            <div className="flex flex-wrap items-center gap-3">
              <LiveLamp label={running ? "On air" : "Off air"} />
              <span className="h-3 w-px bg-rule" aria-hidden />
              <Slug tone="red" className="flex items-center gap-2">
                <Radio className="size-3.5" strokeWidth={2.5} aria-hidden />
                The night desk
              </Slug>
              <span className="h-3 w-px bg-rule" aria-hidden />
              <StudioClock className="chyron text-dim" />
            </div>

            <h1 className="headline mt-5 max-w-[18ch] text-[clamp(2.2rem,6vw,4rem)] text-white">
              Nobody is driving. It files anyway.
            </h1>
            <p className="mt-5 max-w-[64ch] text-[16px] leading-relaxed text-dim">
              The agent picks its own markets, reads the wire, builds a graph, prices
              the question and takes a side — one story after another, unattended.
              Everything it does is read into the log below as it happens.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button variant="primary" onClick={() => gate(() => start(4))} disabled={running}>
                <RotateCw
                  className={cn("size-3.5", running && "animate-spin")}
                  strokeWidth={2.5}
                  aria-hidden
                />
                {running ? "Desk is running" : "Put the desk on air"}
              </Button>
              <Pill tone="hold">Paper mode · testnet alpha</Pill>
            </div>

            <ReadoutStrip
              className="mt-9 max-w-xl"
              items={[
                { label: "Markets worked", value: items.length },
                { label: "Positions taken", value: traded },
                { label: "Traces anchored", value: anchored, tone: "red" },
              ]}
            />
          </div>

        </div>

      </section>

      {lastDecision?.decision && (
        <BreakingCutIn
          key={lastDecision.decision.decision_id}
          headline={
            lastDecision.decision.action.startsWith("enter")
              ? `The desk buys ${sideOf(lastDecision.decision.action)}`
              : "The desk passes"
          }
          detail={lastDecision.market.question}
        />
      )}

      {/* ── the gallery log ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6">
        <SectionLabel className="mb-4">
          Gallery log — most recent at the top
        </SectionLabel>

        {log.length === 0 ? (
          <div className="monitor px-6 py-16 text-center">
            <p className="headline text-3xl text-white">
              {status === "error" ? "The feed dropped" : "The desk is off air"}
            </p>
            <p className="mx-auto mt-3 max-w-[54ch] text-[15px] leading-relaxed text-dim">
              {status === "error"
                ? "The stream from the agent API closed before the run finished. Check the sidecar is up, then put the desk back on air."
                : "Nothing is being worked right now. Put the desk on air and the agent will start picking markets on its own — you will see every line it files here, timestamped."}
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Button variant="primary" onClick={() => gate(() => start(4))} disabled={running}>
                <Radio className="size-3.5" strokeWidth={2.5} aria-hidden />
                {status === "error" ? "Try the feed again" : "Put the desk on air"}
              </Button>
              <Link href="/">
                <Button variant="ghost">Back to the running order</Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="monitor overflow-hidden">
            <ol className="divide-y divide-rule">
              {log.map((l, i) => (
                <li
                  key={l.id}
                  className={cn(
                    "grid grid-cols-[auto_1fr] items-baseline gap-x-3 px-3 py-2.5 sm:grid-cols-[auto_auto_1fr_auto] sm:gap-x-5 sm:px-4",
                    i === 0 && "cut-up bg-desk",
                  )}
                >
                  <time className="chyron numeric shrink-0 text-faint">{l.time}</time>
                  <span className={cn("chyron shrink-0", toneText[l.tone])}>{l.tag}</span>
                  <span
                    className={cn(
                      "col-span-2 min-w-0 text-[14px] leading-snug sm:col-span-1",
                      i === 0 ? "text-white" : "text-ink",
                    )}
                  >
                    <span className="chyron mr-2 text-faint">
                      {String(l.slot).padStart(2, "0")}
                    </span>
                    {l.text}
                  </span>
                  {l.href ? (
                    l.href.startsWith("/") ? (
                      <Link
                        href={l.href}
                        className="chyron col-span-2 mt-1 inline-flex items-center gap-1 text-faint transition-colors hover:text-red-bright sm:col-span-1 sm:mt-0 sm:justify-self-end"
                      >
                        {l.hrefLabel}
                        <ArrowUpRight className="size-3" strokeWidth={2.5} aria-hidden />
                      </Link>
                    ) : (
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noreferrer"
                        className="chyron col-span-2 mt-1 inline-flex items-center gap-1 text-faint transition-colors hover:text-red-bright sm:col-span-1 sm:mt-0 sm:justify-self-end"
                      >
                        {l.hrefLabel}
                        <ArrowUpRight className="size-3" strokeWidth={2.5} aria-hidden />
                      </a>
                    )
                  ) : (
                    <span className="hidden sm:block" aria-hidden />
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        {status === "error" && log.length > 0 && (
          <p className="chyron mt-4 flex items-center gap-2 text-down">
            Feed dropped — the log above is everything the desk filed before it went.
          </p>
        )}
      </section>
    </div>
  );
}
