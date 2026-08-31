"use client";

/**
 * The book — the business segment of the bulletin.
 *
 * A lower third carrying the one number that matters, the positions as a
 * proper dense table (a book is a table, not a grid of cards), then the
 * on-chain anchors as a ledger tape. Every P&L figure on this page is paper:
 * the trades are simulated on Manifold and the copy says so wherever a number
 * could be mistaken for cash.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { LowerThird, Slug } from "@/components/broadcast";
import { Button, Pill, SectionLabel, ReadoutStrip } from "@/components/ui";
import { api, type MetricsResp, type PortfolioResp, type Position } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBalance } from "@/lib/useBalance";
import { useDemoMode } from "@/lib/demo-mode";
import { explorerTxUrl } from "@/lib/solana";
import type { Anchor } from "@/lib/types";
import { cn, truncHash } from "@/lib/utils";

function shortAddr(a: string | null) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

/** Paper P&L, always signed, never dressed as cash. */
function fmtPnl(v: number | null | undefined) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;
}

const cents = (p: number | null | undefined) =>
  p == null ? "—" : `${(p * 100).toFixed(0)}¢`;

/**
 * The mark implied by the position's own paper P&L: pnl = shares × (mark −
 * entry). Inverted here rather than invented — if there is no P&L yet there is
 * no mark to show.
 */
function impliedMark(p: Position): number | null {
  if (p.pnl == null || !p.shares) return null;
  const m = p.entry_price + p.pnl / p.shares;
  return Math.min(1, Math.max(0, m));
}

function whenOpened(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

/** Open first (biggest paper move at the top), then everything already closed. */
function orderBook(positions: Position[]) {
  const rank = (p: Position) => (p.status === "open" ? 0 : 1);
  return [...positions].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const pa = a.pnl ?? Number.NEGATIVE_INFINITY;
    const pb = b.pnl ?? Number.NEGATIVE_INFINITY;
    if (pb !== pa) return pb - pa;
    return (b.opened_at ?? "").localeCompare(a.opened_at ?? "");
  });
}

export default function PortfolioPage() {
  const [pf, setPf] = useState<PortfolioResp | null>(null);
  const [metrics, setMetrics] = useState<MetricsResp | null>(null);
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const { demoMode } = useDemoMode();
  const { address } = useAuth();
  const wallet = useBalance(address);

  // Personal view: scope positions + settlements to the wallet that signed them,
  // and show that wallet's own balance instead of the server treasury.
  const personal = !demoMode && Boolean(address);
  const scopeWallet = personal ? address : null;

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    const book = api.portfolio(scopeWallet).then(setPf);
    const tape = api.anchors(30, scopeWallet).then((r) => setAnchors(r.anchors));
    api.metrics().then(setMetrics).catch(() => {});
    Promise.all([book, tape])
      .catch(() => setErr("The desk is off air — the agent API did not answer."))
      .finally(() => setLoading(false));
  }, [scopeWallet]);

  useEffect(() => {
    // clear stale data when the scope (mode/wallet) changes so we never show one
    // wallet's positions while the next wallet's data is still loading
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPf(null);
    setAnchors([]);
    load();
  }, [load]);

  const realTxns = personal
    ? anchors.filter((a) => !a.mocked).length
    : metrics?.real_tx_count ?? "—";

  const positions = orderBook(pf?.positions ?? []);
  const open = positions.filter((p) => p.status === "open");
  const closed = positions.filter((p) => p.status !== "open");
  const pnl = pf?.realized_pnl ?? null;
  const empty = Boolean(pf) && positions.length === 0;

  return (
    <div>
      <LowerThird
        brandSuffix="Business"
        headline={
          pnl == null
            ? "The book"
            : `The book is running ${fmtPnl(pnl)} in paper`
        }
        strap={
          personal
            ? `Positions and anchors signed by ${shortAddr(address)} — testnet alpha, simulated on Manifold`
            : "The desk's own book — testnet alpha, every trade simulated on Manifold"
        }
      />

      <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
        {/* the standing warning: no figure on this page is cash */}
        <div className="flex flex-wrap items-center gap-3">
          <Pill tone="hold">Paper mode · simulated on Manifold</Pill>
          <Slug>
            {personal ? "Personal view · your wallet" : "Desk view · the shared agent record"}
          </Slug>
          <Button variant="quiet" className="ml-auto" onClick={load} disabled={loading}>
            <RefreshCw
              className={cn("size-3.5", loading && "animate-spin")}
              strokeWidth={2.5}
              aria-hidden
            />
            {loading ? "Reading the book" : "Re-read the book"}
          </Button>
        </div>

        {!personal && (
          <p className="mt-3 max-w-[70ch] text-[14px] leading-relaxed text-dim">
            You are watching the shared agent record signed by the server wallet.
            Switch to personal mode to see only the positions and anchors your own
            wallet signed.
          </p>
        )}

        {err && (
          <div className="monitor mt-6 border-down/45 px-4 py-4">
            <div className="chyron text-down">Off air</div>
            <p className="mt-1.5 text-[14px] text-ink">{err}</p>
            <Button variant="ghost" className="mt-4" onClick={load}>
              Try the line again
            </Button>
          </div>
        )}

        {/* ── the wall ─────────────────────────────────────────────────── */}
        <ReadoutStrip
          className="mt-6"
          items={[
            {
              label: "Open positions",
              value: pf?.open_count ?? "—",
              sub: "live on the book",
              tone: "red",
            },
            {
              label: "Paper P&L",
              value: fmtPnl(pnl),
              sub: "simulated · not cash",
              tone: pnl == null ? "default" : pnl >= 0 ? "up" : "down",
            },
            {
              label: "Traces anchored",
              value: realTxns,
              sub: personal ? "signed by your wallet" : "written to Solana",
            },
            personal
              ? {
                  label: "Your wallet",
                  value: wallet.formatted ?? "—",
                  sub: (
                    <>
                      SOL · {shortAddr(address)}
                      <span className="mt-0.5 block">
                        {wallet.bbc
                          ? `${wallet.bbc.formatted} $BBC`
                          : "$BBC not yet launched"}
                      </span>
                    </>
                  ),
                  tone: "hold" as const,
                }
              : {
                  label: "Desk balance",
                  value:
                    metrics?.usdc_balance != null
                      ? metrics.usdc_balance.toFixed(2)
                      : "—",
                  sub: "server wallet",
                  tone: "hold" as const,
                },
          ]}
        />

        {/* ── the book ─────────────────────────────────────────────────── */}
        <section className="mt-10">
          <SectionLabel className="mb-4">
            The book — every position the desk is carrying
          </SectionLabel>

          <div className="monitor overflow-hidden">
            {loading && !pf ? (
              <p className="chyron px-4 py-16 text-center text-faint">
                Reading the book…
              </p>
            ) : empty ? (
              <div className="px-6 py-16 text-center">
                <p className="headline text-2xl text-white">
                  The book is empty — the desk hasn&rsquo;t traded yet
                </p>
                <p className="mx-auto mt-2 max-w-[52ch] text-[15px] text-dim">
                  {personal
                    ? "Nothing has been signed by this wallet. Run an analysis in personal mode and the position will appear here."
                    : "No positions are recorded yet. Put a market on air and the agent will open the book."}
                </p>
                <Link href="/">
                  <Button variant="primary" className="mt-6">
                    Open tonight&rsquo;s running order
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-rule">
                      <th className="chyron px-4 py-2.5 font-bold text-faint">Market</th>
                      <th className="chyron px-3 py-2.5 font-bold text-faint">Side</th>
                      <th className="chyron px-3 py-2.5 text-right font-bold text-faint">Shares</th>
                      <th className="chyron px-3 py-2.5 text-right font-bold text-faint">Entry</th>
                      <th className="chyron px-3 py-2.5 text-right font-bold text-faint">Mark</th>
                      <th className="chyron px-3 py-2.5 text-right font-bold text-faint">
                        Paper P&L
                      </th>
                      <th className="chyron px-3 py-2.5 font-bold text-faint">Opened</th>
                      <th className="chyron px-4 py-2.5 text-right font-bold text-faint">Status</th>
                    </tr>
                  </thead>

                  {[
                    { key: "open", label: "On the book", rows: open },
                    { key: "closed", label: "Settled", rows: closed },
                  ]
                    .filter((g) => g.rows.length > 0)
                    .map((g) => (
                      <tbody key={g.key}>
                        <tr>
                          <th
                            colSpan={8}
                            className="chyron border-y border-rule bg-desk px-4 py-1.5 text-left font-bold text-dim"
                            scope="colgroup"
                          >
                            {g.label} · {g.rows.length}
                          </th>
                        </tr>
                        {g.rows.map((p) => {
                          const mark = impliedMark(p);
                          return (
                            <tr
                              key={p.id}
                              className="group border-b border-rule/70 transition-colors last:border-0 hover:bg-desk"
                            >
                              <td className="max-w-[26rem] px-4 py-3">
                                <Link
                                  href={`/analyze/${encodeURIComponent(p.market_id)}`}
                                  className="flex items-center gap-2 text-[14px] leading-snug text-ink transition-colors hover:text-white"
                                >
                                  <span className="truncate">
                                    {p.question || p.market_id}
                                  </span>
                                  <ArrowUpRight
                                    className="size-3.5 shrink-0 text-faint transition-colors group-hover:text-red-bright"
                                    strokeWidth={2}
                                    aria-hidden
                                  />
                                </Link>
                                <span className="chyron mt-1 flex items-center gap-2 text-faint">
                                  <span>{p.venue ?? "manifold"}</span>
                                  {p.entry_decision_id != null && (
                                    <>
                                      <span aria-hidden>·</span>
                                      <Link
                                        href={`/verify/${p.entry_decision_id}`}
                                        className="text-monitor hover:text-white"
                                      >
                                        Trace #{p.entry_decision_id}
                                      </Link>
                                    </>
                                  )}
                                </span>
                              </td>
                              <td className="chyron px-3 py-3 text-dim">{p.side}</td>
                              <td className="numeric px-3 py-3 text-right text-[14px] text-dim">
                                {p.shares.toFixed(2)}
                              </td>
                              <td className="numeric px-3 py-3 text-right text-[14px] text-dim">
                                {cents(p.entry_price)}
                              </td>
                              <td className="numeric px-3 py-3 text-right text-[14px] text-ink">
                                {cents(mark)}
                              </td>
                              <td
                                className={cn(
                                  "numeric px-3 py-3 text-right text-[14px]",
                                  p.pnl == null
                                    ? "text-faint"
                                    : p.pnl >= 0
                                      ? "text-up"
                                      : "text-down",
                                )}
                              >
                                {fmtPnl(p.pnl)}
                              </td>
                              <td className="numeric px-3 py-3 text-[13px] text-faint">
                                {whenOpened(p.opened_at)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Pill tone={p.status === "open" ? "monitor" : "neutral"}>
                                  {p.status}
                                </Pill>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    ))}
                </table>
              </div>
            )}
          </div>

          <p className="mt-2.5 text-[13px] text-faint">
            Mark is the price implied by the position&rsquo;s own paper P&L. Every
            figure in this table is simulated on Manifold — nothing here has settled
            in cash.
          </p>
        </section>

        {/* ── the tape ─────────────────────────────────────────────────── */}
        <section className="mt-10">
          <SectionLabel className="mb-4">
            The ledger tape — reasoning anchored on Solana
          </SectionLabel>

          <div className="monitor overflow-hidden">
            {loading && anchors.length === 0 ? (
              <p className="chyron px-4 py-12 text-center text-faint">Reading the tape…</p>
            ) : anchors.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="headline text-xl text-white">Nothing on the tape</p>
                <p className="mx-auto mt-2 max-w-[48ch] text-[14px] text-dim">
                  {personal
                    ? "This wallet hasn't signed an anchor yet."
                    : "The desk hasn't written a reasoning trace to chain yet."}
                </p>
              </div>
            ) : (
              <ul>
                {anchors.map((a) => {
                  const href = a.explorer_url ?? explorerTxUrl(a.tx_hash);
                  return (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule/70 px-4 py-2.5 transition-colors last:border-0 hover:bg-desk"
                    >
                      <span className="numeric chyron w-[8ch] shrink-0 text-faint">
                        {a.created_at?.slice(11, 16) ?? "--:--"}
                      </span>
                      <span className="chyron w-[7ch] shrink-0 text-dim">{a.kind}</span>
                      {a.mocked ? (
                        <Pill tone="hold">simulated</Pill>
                      ) : (
                        <Pill tone="up">on chain</Pill>
                      )}
                      {a.decision_id != null ? (
                        <Link
                          href={`/verify/${a.decision_id}`}
                          className="chyron text-monitor hover:text-white"
                        >
                          Trace #{a.decision_id}
                        </Link>
                      ) : (
                        <span className="chyron text-faint">no trace</span>
                      )}
                      {a.usdc_amount != null && (
                        <span className="numeric chyron text-faint">
                          {a.usdc_amount} USDC
                        </span>
                      )}
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="numeric ml-auto flex items-center gap-1.5 text-[13px] text-dim transition-colors hover:text-white"
                      >
                        {truncHash(a.tx_hash, 8)}
                        <ArrowUpRight className="size-3.5" strokeWidth={2} aria-hidden />
                        <span className="sr-only">View signature on Solana Explorer</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <p className="mt-2.5 text-[13px] text-faint">
            Each line is a signature on Solana. Follow one to Solana Explorer and read
            the trace hash the desk wrote at the time.
          </p>
        </section>

        {/* ── calibration ──────────────────────────────────────────────── */}
        {metrics && metrics.metrics.length > 0 && (
          <section className="mt-10">
            <SectionLabel className="mb-1">
              Calibration by category — how well the desk prices what it says
            </SectionLabel>
            <p className="mb-4 mt-2 text-[13px] text-faint">
              The shared agent record, not wallet-specific. Lower Brier and ECE are
              better; P&L is paper.
            </p>

            <div className="monitor overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-rule">
                    <th className="chyron px-4 py-2.5 font-bold text-faint">Category</th>
                    <th className="chyron px-3 py-2.5 text-right font-bold text-faint">
                      Resolved
                    </th>
                    <th className="chyron px-3 py-2.5 text-right font-bold text-faint">Brier</th>
                    <th className="chyron px-3 py-2.5 text-right font-bold text-faint">ECE</th>
                    <th className="chyron px-4 py-2.5 text-right font-bold text-faint">
                      Paper P&L
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.metrics.map((m) => (
                    <tr
                      key={m.category}
                      className="border-b border-rule/70 transition-colors last:border-0 hover:bg-desk"
                    >
                      <td className="px-4 py-2.5 text-[14px] text-ink">{m.category}</td>
                      <td className="numeric px-3 py-2.5 text-right text-[14px] text-dim">
                        {m.n_resolved}
                      </td>
                      <td className="numeric px-3 py-2.5 text-right text-[14px] text-dim">
                        {m.brier?.toFixed(3) ?? "—"}
                      </td>
                      <td className="numeric px-3 py-2.5 text-right text-[14px] text-dim">
                        {m.ece?.toFixed(3) ?? "—"}
                      </td>
                      <td
                        className={cn(
                          "numeric px-4 py-2.5 text-right text-[14px]",
                          m.realized_pnl >= 0 ? "text-up" : "text-down",
                        )}
                      >
                        {fmtPnl(m.realized_pnl)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
