"use client";

/**
 * The channel's on-air furniture. Everything a viewer recognises before they
 * read a word: the lower third, the strap, the ticker, the clock, the lamp.
 * Pages compose these; they never re-implement the red bar themselves.
 */

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/* ── clock ─────────────────────────────────────────────────────────────── */

/** Broadcast clock. Renders blank on the server so hydration never mismatches. */
export function StudioClock({ className }: { className?: string }) {
  // null on the server so the markup hydrates identically; the first tick
  // fills it in on the client.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const t = setInterval(tick, 1000);
    tick();
    return () => clearInterval(t);
  }, []);

  return (
    <time
      suppressHydrationWarning
      dateTime={now?.toISOString()}
      className={cn("numeric tabular-nums", className)}
    >
      {now
        ? now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
        : "--:--"}
    </time>
  );
}

/* ── lamps and slugs ───────────────────────────────────────────────────── */

export function LiveLamp({ label = "Live" }: { label?: string }) {
  return (
    <span className="chyron inline-flex items-center gap-2 text-white">
      <span className="lamp" aria-hidden />
      {label}
    </span>
  );
}

/** The small tracked label that names a segment. Never an eyebrow over a heading. */
export function Slug({
  children,
  className,
  tone = "dim",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "dim" | "red" | "white";
}) {
  const tones = {
    dim: "text-faint",
    red: "text-red-bright",
    white: "text-white",
  } as const;
  return <span className={cn("chyron", tones[tone], className)}>{children}</span>;
}

/* ── the lower third ───────────────────────────────────────────────────── */

/**
 * The red headline bar. `strap` is the second line that runs under it; the
 * clock sits in its own box on the right, exactly as it does on air.
 */
export function LowerThird({
  brand = "BBC",
  brandSuffix = "MARKETS",
  headline,
  strap,
  animate = true,
  className,
}: {
  brand?: string;
  brandSuffix?: string;
  headline: React.ReactNode;
  strap?: React.ReactNode;
  animate?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("w-full select-none", className)}>
      <div
        className={cn(
          "flex items-end gap-5 bg-red px-4 py-3 sm:gap-7 sm:px-7 sm:py-4",
          animate && "cut-in",
        )}
      >
        <span className="shrink-0 pb-0.5">
          <span className="headline block text-2xl leading-none text-white sm:text-3xl">
            {brand}
          </span>
          <span className="chyron mt-1 block text-white/80">{brandSuffix}</span>
        </span>
        <h2 className="headline min-w-0 flex-1 text-balance text-[clamp(1.25rem,3.1vw,2.4rem)] text-white">
          {headline}
        </h2>
      </div>

      {strap && (
        <div className="flex items-stretch bg-red-deep">
          <p className="strapline flex min-w-0 flex-1 items-center gap-2.5 px-4 py-2 text-[13px] text-white/95 sm:px-7 sm:text-[15px]">
            <span className="mt-px size-1.5 shrink-0 bg-white/85" aria-hidden />
            <span className="truncate">{strap}</span>
          </p>
          <StudioClock className="strapline flex shrink-0 items-center bg-red px-3.5 text-[13px] text-white sm:text-[15px]" />
        </div>
      )}
    </div>
  );
}

/* ── the ticker ────────────────────────────────────────────────────────── */

export type TickerItem = {
  /** short all-caps tag, e.g. ENTRY, EXIT, BREAKING */
  tag?: string;
  text: string;
  tone?: "neutral" | "up" | "down" | "hold";
};

/**
 * The rolling strip along the bottom of the screen. Duplicates its items once
 * so the -50% keyframe loops seamlessly; hovering pauses it so a viewer can
 * actually read a line.
 */
export function Ticker({
  items,
  speed = 64,
  className,
}: {
  items: TickerItem[];
  /** seconds for one full pass */
  speed?: number;
  className?: string;
}) {
  if (items.length === 0) return null;
  const run = [...items, ...items];

  return (
    <div
      className={cn("ticker flex items-stretch bg-[#0d1117]", className)}
      role="marquee"
      aria-label="Market ticker"
    >
      <div className="chyron flex shrink-0 items-center gap-2 bg-red px-3.5 text-white sm:px-4">
        <span className="lamp" aria-hidden />
        <span className="hidden sm:inline">Live tape</span>
      </div>

      <div className="relative min-w-0 flex-1 overflow-hidden">
        <div
          className="ticker-track items-center py-2"
          style={{ ["--roll" as string]: `${speed}s` }}
        >
          {run.map((it, i) => (
            <span
              key={i}
              className="flex shrink-0 items-center gap-2.5 whitespace-nowrap px-5 text-[13px]"
              aria-hidden={i >= items.length}
            >
              {it.tag && (
                <span
                  className={cn(
                    "chyron",
                    it.tone === "up" && "text-up",
                    it.tone === "down" && "text-down",
                    it.tone === "hold" && "text-hold",
                    (!it.tone || it.tone === "neutral") && "text-red-bright",
                  )}
                >
                  {it.tag}
                </span>
              )}
              <span className="text-dim">{it.text}</span>
              <span className="ml-3 h-3 w-px bg-rule" aria-hidden />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── the anchor ────────────────────────────────────────────────────────── */

/**
 * The bull anchor. Sits to camera-right of the headline, lit from the studio
 * behind it. `priority` on the home hero only.
 */
export function AnchorBull({
  className,
  priority = false,
  sizes = "(max-width: 1024px) 60vw, 520px",
}: {
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      {/* key light spilling off the anchor's shoulders */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[8%] bottom-[6%] top-[14%] rounded-full bg-red/25 blur-3xl"
      />
      <Image
        src="/anchor-bull.png"
        alt="The BBC anchor, a bull in a suit, presenting from the studio"
        width={1100}
        height={1059}
        priority={priority}
        sizes={sizes}
        className="relative h-full w-full object-contain object-bottom drop-shadow-[0_28px_44px_rgba(0,0,0,0.6)]"
      />
    </div>
  );
}

/* ── breaking-news cut-in ──────────────────────────────────────────────── */

/**
 * A transient banner for a live event (a fill, an exit, a payout draw). Fades
 * itself after `ttl` ms so the studio does not accumulate stale banners.
 */
export function BreakingCutIn({
  headline,
  detail,
  ttl = 9000,
  onDismiss,
}: {
  headline: string;
  detail?: string;
  ttl?: number;
  onDismiss?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const cb = useRef(onDismiss);

  useEffect(() => {
    cb.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const t = setTimeout(() => {
      setOpen(false);
      cb.current?.();
    }, ttl);
    return () => clearTimeout(t);
  }, [ttl, headline]);

  if (!open) return null;

  return (
    <div
      role="status"
      className="cut-in flex items-center gap-4 bg-red px-4 py-2.5 sm:px-7"
    >
      <span className="chyron flex shrink-0 items-center gap-2 bg-white px-2.5 py-1 text-red">
        <span className="lamp" aria-hidden />
        Breaking
      </span>
      <p className="strapline min-w-0 flex-1 truncate text-[14px] text-white sm:text-[15px]">
        {headline}
        {detail && <span className="ml-2 font-normal text-white/75">{detail}</span>}
      </p>
    </div>
  );
}
