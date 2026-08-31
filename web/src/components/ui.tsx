import { cn } from "@/lib/utils";

/**
 * Studio primitives. Everything here belongs to the broadcast world: labels
 * are chyrons, panels are monitors, badges are on-air tags.
 */

/** Names a segment of the broadcast and rules off to the right. */
export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* the red tally block that opens a segment — drawn, not a glyph */}
      <span className="size-2 shrink-0 bg-red" aria-hidden />
      <span className="chyron text-dim">{children}</span>
      <span className="h-px flex-1 bg-rule" />
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "red" | "up" | "down" | "hold" | "monitor";
  className?: string;
}) {
  const tones = {
    neutral: "border-rule-lit text-dim",
    red: "border-transparent bg-red text-white",
    up: "border-up/45 bg-up/10 text-up",
    down: "border-down/45 bg-down/10 text-down",
    hold: "border-hold/45 bg-hold/10 text-hold",
    monitor: "border-monitor/50 bg-monitor/10 text-monitor",
  } as const;
  return (
    <span
      className={cn(
        "chyron inline-flex items-center gap-1.5 border px-2 py-0.5",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "red" }: { tone?: "red" | "up" | "hold" | "muted" }) {
  const c = {
    red: "bg-live",
    up: "bg-up",
    hold: "bg-hold",
    muted: "bg-faint",
  }[tone];
  return <span className={cn("inline-block size-1.5 rounded-full", c)} />;
}

/**
 * A single readout on the studio wall. `mode` labels which phase produced the
 * number — paper P&L is never allowed to read as cash.
 */
export function Stat({
  label,
  value,
  sub,
  tone,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "red" | "up" | "down" | "hold" | "default";
  className?: string;
}) {
  const c =
    tone === "red"
      ? "text-red-bright"
      : tone === "up"
        ? "text-up"
        : tone === "down"
          ? "text-down"
          : tone === "hold"
            ? "text-hold"
            : "text-white";
  return (
    <div className={cn("monitor px-4 py-3.5", className)}>
      <div className="chyron mb-2 text-faint">{label}</div>
      <div className={cn("headline numeric text-3xl leading-none", c)}>{value}</div>
      {sub && <div className="mt-1.5 text-[12px] text-faint">{sub}</div>}
    </div>
  );
}

export type Readout = {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "red" | "up" | "down" | "hold" | "default";
};

const READOUT_TONE = {
  red: "text-red-bright",
  up: "text-up",
  down: "text-down",
  hold: "text-hold",
  default: "text-white",
} as const;

/**
 * The channel's figures, in one divided readout inside a single monitor — the
 * form a broadcast uses for a results strip. Replaces the grid of metric tiles
 * everywhere the page needs to state several numbers at once.
 */
export function ReadoutStrip({
  items,
  className,
}: {
  items: Readout[];
  className?: string;
}) {
  const cols =
    items.length >= 4
      ? "sm:grid-cols-2 lg:grid-cols-4"
      : items.length === 3
        ? "sm:grid-cols-3"
        : "sm:grid-cols-2";

  return (
    <dl
      className={cn(
        "monitor grid grid-cols-1 divide-y divide-rule sm:divide-y-0 sm:divide-x",
        cols,
        className,
      )}
    >
      {items.map((it) => (
        <div
          key={it.label}
          className="flex items-baseline justify-between gap-4 border-rule px-5 py-4 sm:block"
        >
          <dt className="chyron text-faint">{it.label}</dt>
          <dd className="sm:mt-2">
            <span
              className={cn(
                "headline numeric text-3xl leading-none",
                READOUT_TONE[it.tone ?? "default"],
              )}
            >
              {it.value}
            </span>
            {it.sub && (
              <span className="mt-1.5 hidden text-[12px] text-faint sm:block">
                {it.sub}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The channel's button. One shape, three weights of authority. */
export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "quiet";
}) {
  const variants = {
    primary:
      "bg-red text-white hover:bg-red-bright active:translate-y-px disabled:bg-red/40",
    ghost:
      "border border-rule-lit text-ink hover:border-red hover:text-white active:translate-y-px",
    quiet: "text-dim hover:text-white",
  } as const;
  return (
    <button
      {...props}
      className={cn(
        "chyron inline-flex items-center justify-center gap-2 px-3.5 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}
