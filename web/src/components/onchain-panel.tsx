"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { HAS_BBC_MINT, explorerTxUrl } from "@/lib/solana";
import type { OnchainTx } from "@/lib/types";
import { truncHash } from "@/lib/utils";
import { Pill, SectionLabel } from "./ui";

function TxRow({ label, tx, sub }: { label: string; tx: OnchainTx; sub?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between gap-3 border border-rule bg-desk px-3 py-2.5"
    >
      <div className="min-w-0">
        <div className="chyron mb-1 flex items-center gap-2 text-dim">
          {label}
          {tx.mocked ? <Pill tone="monitor">Simulated</Pill> : <Pill tone="up">On chain</Pill>}
        </div>
        <div className="numeric truncate text-[12px] text-ink">
          {truncHash(tx.tx_hash, 8)}
          {sub && <span className="ml-2 text-faint">{sub}</span>}
        </div>
      </div>
      <a
        href={tx.explorer_url || explorerTxUrl(tx.tx_hash)}
        target="_blank"
        rel="noreferrer"
        className="chyron inline-flex shrink-0 items-center gap-1.5 text-faint transition-colors hover:text-white"
      >
        Explorer
        <ExternalLink className="size-3" strokeWidth={2} aria-hidden />
      </a>
    </motion.div>
  );
}

export function OnchainPanel({
  settled,
  anchored,
  decisionId,
  active,
}: {
  settled: OnchainTx | null;
  anchored: OnchainTx | null;
  decisionId?: number | null;
  active: boolean;
}) {
  return (
    <div className="monitor p-4">
      <SectionLabel>Settlement · Solana devnet</SectionLabel>

      <div className="mt-4 space-y-2">
        {settled && (
          <TxRow
            label={HAS_BBC_MINT ? "$BBC settled" : "USDC settled"}
            tx={settled}
            sub={
              settled.usdc_amount
                ? `${settled.usdc_amount} ${HAS_BBC_MINT ? "$BBC" : "USDC"}`
                : undefined
            }
          />
        )}
        {anchored ? (
          <TxRow label="Trace anchored" tx={anchored} />
        ) : active ? (
          <div className="flex items-center gap-2 border border-rule bg-desk px-3 py-2.5">
            <span className="lamp" aria-hidden />
            <span className="chyron text-red-bright">Anchoring the trace…</span>
          </div>
        ) : (
          <p className="text-[12px] leading-relaxed text-dim">
            Every decision&rsquo;s full reasoning trace is hashed and written to
            Solana devnet through the Memo program, alongside a symbolic SPL
            settlement. Anyone can check the record for themselves.
          </p>
        )}
      </div>

      {anchored?.trace_hash && (
        <div className="mt-3 border-t border-rule pt-3">
          <div className="chyron mb-1.5 text-faint">Trace hash · SHA-256</div>
          <div className="numeric break-all text-[11px] text-monitor">
            {anchored.trace_hash}
          </div>
          {decisionId != null && (
            <Link
              href={`/verify/${decisionId}`}
              className="chyron mt-3 inline-flex items-center gap-2 border border-rule-lit px-3 py-1.5 text-ink transition-colors hover:border-red hover:text-white"
            >
              Check the trace
              <ArrowRight className="size-3" strokeWidth={2} aria-hidden />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
