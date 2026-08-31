"use client";

/**
 * The receipt for one decision.
 *
 * A sceptic landed here to check the desk's working, so this is a Read
 * surface: a document you walk straight down. What was claimed, what evidence
 * it rested on, what hash those exact bytes produce, which Solana transaction
 * carries that hash, and how to reproduce the hash yourself without trusting
 * this page at all.
 */

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { LowerThird, Slug } from "@/components/broadcast";
import { Button, Pill, SectionLabel } from "@/components/ui";
import { api, type TraceResp } from "@/lib/api";
import { explorerTxUrl } from "@/lib/solana";
import { cn, truncHash } from "@/lib/utils";

async function sha256hex(str: string): Promise<string> {
  const bytes = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return "0x" + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ── the canonical trace, read defensively ────────────────────────────── */

type TraceBody = {
  market?: {
    question?: string;
    venue?: string;
    category?: string;
    end_date?: string;
    market_price_yes?: number;
  };
  decision?: {
    as_of?: string;
    model_id?: string;
    p_yes?: number;
    confidence?: number;
    edge_vs_market?: number;
    action?: string;
    rationale?: string;
  };
  evidence?: { url?: string; title?: string; published_date?: string }[];
  graph?: { node_count?: number; edge_count?: number };
};

const pct = (v?: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

/** One line of the claim: a label on the left, the figure on the right. */
function Line({
  label,
  children,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  tone?: "white" | "dim";
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule/70 py-2.5 last:border-0">
      <dt className="chyron text-faint">{label}</dt>
      <dd
        className={cn(
          "numeric min-w-0 text-right text-[15px]",
          tone === "dim" ? "text-dim" : "text-white",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/* ── the page ─────────────────────────────────────────────────────────── */

export default function VerifyPage({
  params,
}: {
  params: Promise<{ decisionId: string }>;
}) {
  const { decisionId } = use(params);
  const id = Number(decisionId);
  const [trace, setTrace] = useState<TraceResp | null>(null);
  const [recomputed, setRecomputed] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState<"json" | "command" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.trace(id).then(setTrace).catch(() => setErr("No trace is filed under this decision."));
  }, [id]);

  // recompute the hash as soon as a trace arrives — one effect, no cascade
  useEffect(() => {
    if (!trace) return;
    let alive = true;
    setVerifying(true);
    sha256hex(trace.canonical_json)
      .then((h) => alive && setRecomputed(h))
      .finally(() => alive && setVerifying(false));
    return () => {
      alive = false;
    };
  }, [trace]);

  const match = Boolean(recomputed && trace && recomputed === trace.trace_hash);
  const anchorTx = trace?.anchors.find((a) => a.kind === "anchor") ?? trace?.anchors[0];

  const body = useMemo<TraceBody>(() => (trace?.trace as TraceBody) ?? {}, [trace]);
  const pretty = useMemo(() => {
    if (!trace) return "";
    try {
      return JSON.stringify(JSON.parse(trace.canonical_json), null, 2);
    } catch {
      return trace.canonical_json;
    }
  }, [trace]);

  const command = `curl -s ${"$"}{API}/api/trace/${id} | jq -j .canonical_json | shasum -a 256`;

  const copy = async (what: "json" | "command", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 2000);
    } catch {
      /* clipboard blocked — the region is selectable, so the reader can still copy */
    }
  };

  return (
    <div>
      <LowerThird
        brandSuffix="Verify"
        headline={
          err
            ? "No trace on file"
            : verifying || !recomputed
              ? `Checking the working on decision #${id}`
              : match
                ? `Decision #${id} checks out`
                : `Decision #${id} does not match its anchor`
        }
        strap="The reasoning trace is hashed in your browser and compared with the hash the desk wrote to Solana"
      />

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link
          href="/portfolio"
          className="chyron inline-flex items-center gap-2 text-faint transition-colors hover:text-white"
        >
          <ArrowLeft className="size-3.5" strokeWidth={2.5} aria-hidden />
          Back to the book
        </Link>

        {err && (
          <div className="monitor mt-6 border-down/45 px-4 py-4">
            <div className="chyron text-down">Nothing filed</div>
            <p className="mt-1.5 text-[14px] text-ink">{err}</p>
            <p className="mt-1 text-[14px] text-dim">
              Decision #{id} has no stored reasoning trace. It may not have been run
              on this desk.
            </p>
          </div>
        )}

        {!trace && !err && (
          <p className="chyron mt-10 text-faint">Pulling the trace…</p>
        )}

        {trace && (
          <>
            {/* ── the verdict ──────────────────────────────────────────── */}
            <section
              aria-live="polite"
              className={cn(
                "monitor cut-up mt-6 flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-6",
                !verifying && recomputed && (match ? "border-up/55" : "border-down/55"),
              )}
            >
              {match ? (
                <ShieldCheck className="size-10 shrink-0 text-up" strokeWidth={2} aria-hidden />
              ) : (
                <ShieldAlert
                  className={cn(
                    "size-10 shrink-0",
                    recomputed && !verifying ? "text-down" : "text-faint",
                  )}
                  strokeWidth={2}
                  aria-hidden
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="chyron text-faint">Verification</div>
                <p
                  className={cn(
                    "headline mt-1.5 text-[clamp(1.6rem,4.4vw,2.4rem)] leading-none",
                    verifying || !recomputed
                      ? "text-dim"
                      : match
                        ? "text-up"
                        : "text-down",
                  )}
                >
                  {verifying || !recomputed
                    ? "Re-hashing the trace…"
                    : match
                      ? "This matches the anchor"
                      : "This does not match the anchor"}
                </p>
                <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-dim">
                  {match
                    ? "The bytes below hash to exactly the value written on chain. The reasoning you are reading is the reasoning the desk anchored — unchanged."
                    : recomputed && !verifying
                      ? "The stored bytes hash to a different value than the one on chain. Treat this trace as unverified: something has been edited since it was anchored."
                      : "Your browser is hashing the stored bytes now."}
                </p>
              </div>
              <div className="text-right">
                <div className="chyron text-faint">Decision</div>
                <div className="headline numeric text-3xl leading-none text-white">
                  #{id}
                </div>
              </div>
            </section>

            {/* ── 1. the claim ─────────────────────────────────────────── */}
            <section className="mt-10">
              <SectionLabel className="mb-3">
                What the desk claimed
              </SectionLabel>
              {body.market?.question && (
                <h2 className="headline text-[clamp(1.3rem,3.2vw,1.85rem)] text-white">
                  {body.market.question}
                </h2>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {body.decision?.action && (
                  <Pill tone="red">{body.decision.action}</Pill>
                )}
                <Pill tone="hold">Paper mode · simulated on Manifold</Pill>
                {body.market?.venue && <Slug>{body.market.venue}</Slug>}
                {body.market?.category && <Slug>{body.market.category}</Slug>}
              </div>

              <dl className="monitor mt-4 px-4 py-2">
                <Line label="Agent probability">{pct(body.decision?.p_yes)}</Line>
                <Line label="Market price at the time" tone="dim">
                  {pct(body.market?.market_price_yes)}
                </Line>
                <Line label="Edge claimed">{pct(body.decision?.edge_vs_market)}</Line>
                <Line label="Confidence" tone="dim">
                  {pct(body.decision?.confidence)}
                </Line>
                <Line label="Reasoned at" tone="dim">
                  {body.decision?.as_of?.slice(0, 19).replace("T", " ") ?? "—"}
                </Line>
                <Line label="Model" tone="dim">
                  {body.decision?.model_id?.split(".").pop() ?? "—"}
                </Line>
              </dl>

              {body.decision?.rationale && (
                <blockquote className="mt-4 border-l-2 border-red pl-4 text-[15px] leading-relaxed text-ink">
                  {body.decision.rationale}
                </blockquote>
              )}
            </section>

            {/* ── 2. the evidence ──────────────────────────────────────── */}
            <section className="mt-10">
              <SectionLabel className="mb-3">
                What it read
              </SectionLabel>
              {body.evidence && body.evidence.length > 0 ? (
                <ol className="monitor overflow-hidden">
                  {body.evidence.map((e, i) => (
                    <li
                      key={`${e.url}-${i}`}
                      className="border-b border-rule/70 last:border-0"
                    >
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-desk"
                      >
                        <span className="chyron numeric mt-1 w-6 shrink-0 text-faint">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] leading-snug text-ink group-hover:text-white">
                            {e.title || e.url}
                          </span>
                          <span className="chyron mt-1 block truncate text-faint">
                            {e.published_date?.slice(0, 10) ?? "undated"} ·{" "}
                            {(() => {
                              try {
                                return new URL(e.url ?? "").hostname;
                              } catch {
                                return e.url ?? "";
                              }
                            })()}
                          </span>
                        </span>
                        <ArrowUpRight
                          className="mt-1 size-3.5 shrink-0 text-faint group-hover:text-red-bright"
                          strokeWidth={2}
                          aria-hidden
                        />
                      </a>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-[14px] text-dim">
                  No sources are recorded in this trace.
                </p>
              )}
              {(body.graph?.node_count != null || body.graph?.edge_count != null) && (
                <p className="mt-2.5 text-[13px] text-faint">
                  Distilled into a knowledge graph of{" "}
                  <span className="numeric text-dim">{body.graph?.node_count ?? 0}</span>{" "}
                  entities and{" "}
                  <span className="numeric text-dim">{body.graph?.edge_count ?? 0}</span>{" "}
                  relations, both included in the hashed bytes below.
                </p>
              )}
            </section>

            {/* ── 3. the hashes ────────────────────────────────────────── */}
            <section className="mt-10">
              <SectionLabel className="mb-3">
                The hash, both ways
              </SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="monitor px-4 py-3.5">
                  <div className="chyron mb-2 text-faint">Anchored on Solana</div>
                  <p className="numeric break-all text-[13px] leading-relaxed text-dim">
                    {trace.trace_hash}
                  </p>
                </div>
                <div
                  className={cn(
                    "monitor px-4 py-3.5",
                    recomputed && !verifying && (match ? "border-up/55" : "border-down/55"),
                  )}
                >
                  <div className="chyron mb-2 text-faint">Recomputed in your browser</div>
                  <p
                    className={cn(
                      "numeric break-all text-[13px] leading-relaxed",
                      recomputed && !verifying
                        ? match
                          ? "text-up"
                          : "text-down"
                        : "text-faint",
                    )}
                  >
                    {recomputed ?? "hashing…"}
                  </p>
                </div>
              </div>
            </section>

            {/* ── 4. the transaction ───────────────────────────────────── */}
            <section className="mt-10">
              <SectionLabel className="mb-3">
                Where that hash lives
              </SectionLabel>
              {trace.anchors.length > 0 ? (
                <ul className="monitor overflow-hidden">
                  {trace.anchors.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule/70 px-4 py-3 last:border-0"
                    >
                      <span className="chyron w-[7ch] shrink-0 text-dim">{a.kind}</span>
                      {a.mocked ? (
                        <Pill tone="hold">simulated</Pill>
                      ) : (
                        <Pill tone="up">on chain</Pill>
                      )}
                      {a.usdc_amount != null && (
                        <span className="numeric chyron text-faint">
                          {a.usdc_amount} USDC
                        </span>
                      )}
                      <a
                        href={a.explorer_url ?? explorerTxUrl(a.tx_hash)}
                        target="_blank"
                        rel="noreferrer"
                        className="numeric ml-auto flex items-center gap-1.5 text-[13px] text-dim transition-colors hover:text-white"
                      >
                        {truncHash(a.tx_hash, 10)}
                        <ArrowUpRight className="size-3.5" strokeWidth={2} aria-hidden />
                        <span className="sr-only">View on Solana Explorer</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[14px] text-dim">
                  This trace has not been anchored yet — there is no transaction to
                  check it against.
                </p>
              )}
              {anchorTx && (
                <p className="mt-2.5 text-[13px] text-faint">
                  The hash was written into signature{" "}
                  <span className="numeric text-dim">{truncHash(anchorTx.tx_hash, 10)}</span>{" "}
                  on {anchorTx.created_at?.slice(0, 19).replace("T", " ") ?? "an unrecorded date"}{" "}
                  UTC. Open it on Solana Explorer and read the memo yourself.
                </p>
              )}
            </section>

            {/* ── 5. check it yourself ─────────────────────────────────── */}
            <section className="mt-10">
              <SectionLabel className="mb-3">
                Check it yourself
              </SectionLabel>
              <p className="max-w-[68ch] text-[15px] leading-relaxed text-dim">
                The trace is serialised with sorted keys and no whitespace, then hashed
                with SHA-256 and prefixed <span className="numeric text-ink">0x</span>.
                Copy the canonical bytes below, hash them with any tool you trust, and
                compare the result with the anchored hash. Nothing on this page has to
                be taken on faith.
              </p>

              <div className="monitor mt-4 overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-2.5">
                  <span className="chyron text-faint">Canonical trace</span>
                  <span className="numeric chyron text-faint">
                    {trace.canonical_json.length.toLocaleString()} bytes
                  </span>
                  <Button
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => copy("json", trace.canonical_json)}
                  >
                    {copied === "json" ? (
                      <Check className="size-3.5 text-up" strokeWidth={2.5} aria-hidden />
                    ) : (
                      <Copy className="size-3.5" strokeWidth={2.5} aria-hidden />
                    )}
                    {copied === "json" ? "Copied" : "Copy bytes"}
                  </Button>
                </div>
                <pre className="numeric max-h-96 overflow-auto whitespace-pre-wrap break-all px-4 py-3.5 text-[12px] leading-relaxed text-dim">
                  {pretty}
                </pre>
              </div>
              <p className="mt-2 text-[13px] text-faint">
                Shown pretty-printed for reading. The copy button gives you the exact
                canonical bytes that were hashed — pretty-printed text will not
                reproduce the hash.
              </p>

              <div className="monitor mt-4 flex flex-wrap items-center gap-3 px-4 py-3">
                <code className="numeric min-w-0 flex-1 overflow-x-auto whitespace-pre text-[12px] text-dim">
                  {command}
                </code>
                <Button variant="ghost" onClick={() => copy("command", command)}>
                  {copied === "command" ? (
                    <Check className="size-3.5 text-up" strokeWidth={2.5} aria-hidden />
                  ) : (
                    <Copy className="size-3.5" strokeWidth={2.5} aria-hidden />
                  )}
                  {copied === "command" ? "Copied" : "Copy command"}
                </Button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
