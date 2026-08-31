"use client";

/**
 * The wire. Every source the desk was allowed to read before it priced the
 * question — a dated list of wire copy, not a stack of cards. The temporal
 * guard is why the dates matter, so the date leads each item.
 */

import { ArrowUpRight } from "lucide-react";
import type { Citation } from "@/lib/types";
import { SectionLabel } from "./ui";

/** Publisher, as a viewer would read it off the strap. */
function outlet(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source unavailable";
  }
}

function filed(date: string | null | undefined) {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date.slice(0, 10);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function EvidenceFeed({ citations }: { citations: Citation[] }) {
  const shown = citations.slice(0, 8);

  return (
    <section className="monitor overflow-hidden">
      <div className="border-b border-rule px-4 py-3">
        <SectionLabel>Wire copy</SectionLabel>
        <p className="mt-2 text-[13px] leading-relaxed text-faint">
          Date-bounded sources. Nothing published after the market&rsquo;s reasoning
          cutoff is allowed on the desk.
        </p>
      </div>

      {shown.length === 0 ? (
        <div className="px-4 py-8">
          <p className="headline text-lg text-white">The wire is quiet</p>
          <p className="mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-dim">
            No sources have cleared the temporal guard yet. Put the market on air
            and the desk will file what it reads here, oldest cutoff first.
          </p>
        </div>
      ) : (
        <ol className="divide-y divide-rule">
          {shown.map((c, i) => {
            const date = filed(c.published_date);
            const host = outlet(c.url);
            const hasLink = Boolean(c.url);
            const body = (
              <>
                <span className="chyron flex items-center gap-2 text-faint">
                  <span className="numeric w-6 shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className={date ? "numeric text-dim" : "text-hold"}>
                    {date ?? "Undated"}
                  </span>
                </span>
                <span className="mt-1.5 flex items-start gap-2">
                  <span className="min-w-0 flex-1 text-[13.5px] leading-snug text-ink transition-colors group-hover:text-white">
                    {c.title || host}
                  </span>
                  {hasLink && (
                    <ArrowUpRight
                      className="mt-0.5 size-3.5 shrink-0 text-faint transition-colors group-hover:text-red-bright"
                      strokeWidth={2}
                      aria-hidden
                    />
                  )}
                </span>
                <span className="chyron mt-1.5 block truncate text-faint">{host}</span>
              </>
            );

            return (
              <li key={`${c.url}-${i}`}>
                {hasLink ? (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group block px-4 py-3 transition-colors hover:bg-desk"
                  >
                    {body}
                  </a>
                ) : (
                  <div className="group block px-4 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {citations.length > shown.length && (
        <div className="chyron border-t border-rule px-4 py-2.5 text-faint">
          <span className="numeric">{citations.length - shown.length}</span> more
          sources on file
        </div>
      )}
    </section>
  );
}
