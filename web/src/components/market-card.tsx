"use client";

/**
 * A line in the running order. A newsroom rundown is a numbered list of
 * stories with a slug, a duration and a state — not a grid of cards — so the
 * market list is built as a rundown row.
 */

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Market } from "@/lib/types";

function pct(n: number | null | undefined) {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

function closes(end: string | null) {
  if (!end) return "open-ended";
  const d = new Date(end);
  if (Number.isNaN(d.getTime())) return "open-ended";
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "closed";
  if (days === 0) return "closes today";
  if (days === 1) return "closes tomorrow";
  return `closes in ${days}d`;
}

export function MarketCard({ market, index }: { market: Market; index: number }) {
  const p = market.last_price_yes;
  // the market's own conviction: how far from a coin flip it currently sits
  const lean = p == null ? null : p >= 0.5 ? "yes" : "no";

  return (
    <Link
      href={`/analyze/${encodeURIComponent(market.id)}`}
      className="group grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 border-b border-rule px-3 py-3.5 transition-colors hover:bg-desk sm:gap-x-6 sm:px-4"
    >
      <span className="chyron numeric w-7 shrink-0 text-faint group-hover:text-red-bright">
        {String(index + 1).padStart(2, "0")}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[15px] leading-snug text-ink group-hover:text-white sm:text-base">
          {market.question}
        </span>
        <span className="chyron mt-1.5 flex items-center gap-2 text-faint">
          <span className="text-dim">{market.category || market.venue}</span>
          <span aria-hidden>·</span>
          <span>{closes(market.end_date)}</span>
          {market.volume_24h != null && market.volume_24h > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="numeric">
                {Math.round(market.volume_24h).toLocaleString()} vol
              </span>
            </>
          )}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-3 sm:gap-4">
        <span className="text-right">
          <span
            className={cn(
              "headline numeric block text-2xl leading-none",
              lean === "yes" ? "text-white" : "text-dim",
            )}
          >
            {pct(p)}
          </span>
          <span className="chyron mt-1 block text-faint">yes</span>
        </span>
        <ArrowUpRight
          className="size-4 shrink-0 text-faint transition-colors group-hover:text-red-bright"
          strokeWidth={2}
          aria-hidden
        />
      </span>
    </Link>
  );
}
