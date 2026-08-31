"use client";

/**
 * The channel bar. Wordmark, the programme strip, the on-air lamp and clock.
 * Chain and wallet state live in AuthControls; this bar stays chain-agnostic
 * so it never breaks when the wallet layer changes underneath it.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { StudioClock } from "@/components/broadcast";
import { AuthControls } from "@/components/auth-controls";

/** `short` is what fits on a phone; `label` is the programme's real name. */
const PROGRAMMES = [
  { href: "/", label: "On air", short: "On air" },
  { href: "/auto", label: "The night desk", short: "Desk" },
  { href: "/portfolio", label: "The book", short: "Book" },
];

/** How each agent phase should be described on air. Paper is never "live". */
const MODE_COPY: Record<string, string> = {
  backtest: "Rehearsal",
  paper: "Testnet alpha · paper",
  dryrun: "Dry run",
  live: "Live money",
};

export function SiteHeader() {
  const pathname = usePathname();
  const [mode, setMode] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "offline">("loading");

  useEffect(() => {
    let alive = true;
    const poll = () =>
      api
        .health()
        .then((h) => alive && (setMode(h.mode), setStatus("ok")))
        .catch(() => alive && (setMode(null), setStatus("offline")));
    poll();
    // re-poll so the bar recovers on its own once the backend comes up
    const t = setInterval(poll, 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-studio/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-baseline gap-2.5">
          <span className="headline bg-red px-2 py-0.5 text-xl leading-tight text-white">
            BBC
          </span>
          <span className="chyron hidden text-dim sm:inline">
            Bull Broadcasting Corporation
          </span>
        </Link>

        <nav className="ml-1 flex shrink-0 items-center gap-0.5 sm:ml-2 sm:gap-1">
          {PROGRAMMES.map((p) => {
            const active = pathname === p.href;
            return (
              <Link
                key={p.href}
                href={p.href}
                aria-current={active ? "page" : undefined}
                title={p.label}
                className={cn(
                  "chyron whitespace-nowrap border-b-2 px-2 py-1.5 transition-colors sm:px-3",
                  active
                    ? "border-red text-white"
                    : "border-transparent text-faint hover:text-ink",
                )}
              >
                <span className="sm:hidden">{p.short}</span>
                <span className="hidden sm:inline">{p.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <span className="chyron hidden items-center gap-2 md:flex">
            {status === "offline" ? (
              <>
                <span className="inline-block size-2 rounded-full bg-faint" aria-hidden />
                <span className="text-faint">Off air</span>
              </>
            ) : (
              <>
                <span className="lamp" aria-hidden />
                <span className="text-white">
                  {status === "loading" ? "Cueing" : (mode && MODE_COPY[mode]) || mode}
                </span>
              </>
            )}
          </span>
          <StudioClock className="chyron hidden text-dim sm:block" />
          <AuthControls />
        </div>
      </div>
    </header>
  );
}
