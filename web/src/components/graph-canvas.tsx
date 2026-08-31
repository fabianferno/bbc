"use client";

/**
 * The graphic the channel puts on screen behind the anchor: the agent's
 * knowledge graph for one market, drawn as a studio diagram.
 *
 * The d3-force simulation and every interaction are unchanged from the
 * original — this is a restyle into the broadcast world. Colour carries one
 * piece of information only: red is the subject of the story, monitor blue is
 * everything the desk found around it.
 */

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
} from "d3-force";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphEdge, GraphNode } from "@/lib/types";

type SimNode = GraphNode & { x: number; y: number };
type SimLink = { source: SimNode | string; target: SimNode | string; type: string };

/* the studio palette, read straight from globals.css tokens */
const RED = "#e02020";
const BLUE = "#2f6fd0";
const RULE = "#232b36";
const RULE_LIT = "#33404f";

/** True for the node that *is* the story: the market, event or question itself. */
function isSubject(n: GraphNode) {
  return /\b(market|event|question|outcome|subject|proposition)\b/i.test(n.type);
}

const nodeColor = (n: GraphNode) => (isSubject(n) ? RED : BLUE);

export function GraphCanvas({
  nodes,
  edges,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 760, h: 540 });
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const [, setTick] = useState(0);
  const [hover, setHover] = useState<SimNode | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const { w, h } = size;
    const existing = new Map(nodesRef.current.map((n) => [n.id, n]));
    const simNodes: SimNode[] = nodes.map((n) => {
      const prev = existing.get(n.id);
      return prev
        ? Object.assign(prev, n)
        : { ...n, x: w / 2 + (Math.random() - 0.5) * 80, y: h / 2 + (Math.random() - 0.5) * 80 };
    });
    nodesRef.current = simNodes;
    const ids = new Set(simNodes.map((n) => n.id));
    const simLinks: SimLink[] = edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, type: e.type }));
    linksRef.current = simLinks;

    // a narrow phone frame needs a tighter graph or nodes push past the bezel
    const tight = w < 560;
    const charge = tight ? -170 : -280;
    const distance = tight ? 62 : 96;
    const collide = tight ? 26 : 36;

    if (!simRef.current) {
      simRef.current = forceSimulation<SimNode>(simNodes)
        .force("charge", forceManyBody().strength(charge))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .force("link", forceLink<SimNode, SimLink>(simLinks).id((d: any) => d.id).distance(distance).strength(0.45))
        .force("center", forceCenter(w / 2, h / 2))
        .force("collide", forceCollide(collide))
        .on("tick", () => setTick((t) => t + 1));
    } else {
      const sim = simRef.current;
      sim.nodes(simNodes);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sim.force("link") as any).links(simLinks).distance(distance);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sim.force("charge") as any).strength(charge);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sim.force("collide") as any).radius(collide);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sim.force("center") as any).x(w / 2).y(h / 2);
      sim.alpha(0.9).restart();
    }
  }, [nodes, edges, size]);

  useEffect(() => {
    return () => {
      simRef.current?.stop();
    };
  }, []);

  const simNodes = nodesRef.current;
  const simLinks = linksRef.current;

  // a selection pointing at a node the graph no longer contains simply stops
  // resolving — derived here rather than cleared in an effect
  const selected = simNodes.find((n) => n.id === selectedId) ?? null;
  /** what the detail card and the dimming both key off */
  const focus = hover ?? selected;

  const neighbours = useMemo(() => {
    if (!focus) return null;
    const set = new Set<string>([focus.id]);
    for (const l of simLinks) {
      const s = (l.source as SimNode).id;
      const t = (l.target as SimNode).id;
      if (s === focus.id) set.add(t);
      if (t === focus.id) set.add(s);
    }
    return set;
  }, [focus, simLinks]);

  const tight = size.w < 560;
  const radius = useCallback(
    (n: GraphNode) => (tight ? 6 : 8) + Math.min(n.degree ?? 0, 6) * (tight ? 1.5 : 2.2),
    [tight],
  );
  // on a phone there is no room for every label; the busiest entities keep theirs
  const labelFloor = tight ? 2 : 0;
  const clamp = tight ? 14 : 22;

  return (
    <div
      ref={wrapRef}
      className="relative h-full min-h-[320px] w-full max-w-full overflow-hidden bg-studio"
    >
      {/* the set behind the graphic: a cold key from camera left, red wash right */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60% 50% at 18% 24%, rgba(47,111,208,0.16), transparent 70%), radial-gradient(50% 45% at 86% 82%, rgba(187,25,25,0.14), transparent 72%)",
        }}
      />

      {simNodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <span className="chyron text-faint">Awaiting entity extraction</span>
        </div>
      )}

      <svg
        width={size.w}
        height={size.h}
        viewBox={`0 0 ${size.w} ${size.h}`}
        className="relative block max-w-full"
        role="img"
        aria-label={`Knowledge graph: ${simNodes.length} entities, ${simLinks.length} relations`}
      >
        {simLinks.map((l, i) => {
          const s = l.source as SimNode;
          const t = l.target as SimNode;
          if (s?.x == null || t?.x == null) return null;
          const active = Boolean(focus && (s.id === focus.id || t.id === focus.id));
          return (
            <motion.line
              key={`${s.id}-${t.id}-${i}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: active ? 1 : focus ? 0.28 : 0.7 }}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke={active ? RULE_LIT : RULE}
              strokeWidth={active ? 1.75 : 1}
            />
          );
        })}

        <AnimatePresence>
          {simNodes.map((n) => {
            const c = nodeColor(n);
            const r = radius(n);
            const isFocus = focus?.id === n.id;
            const isSel = selectedId === n.id;
            const dim = Boolean(neighbours && !neighbours.has(n.id));
            const showLabel = !dim && (isFocus || (n.degree ?? 0) >= labelFloor);
            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(n)}
                onBlur={() => setHover(null)}
                onClick={() => setSelectedId((cur) => (cur === n.id ? null : n.id))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedId((cur) => (cur === n.id ? null : n.id));
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`${n.label}, ${n.type}`}
                style={{
                  cursor: "pointer",
                  opacity: dim ? 0.22 : 1,
                  transition: "opacity 0.2s",
                  outline: "none",
                }}
              >
                {/* the selection ring: a lit bezel around the chosen node */}
                {isSel && (
                  <circle r={r + 6} fill="none" stroke="#ffffff" strokeWidth={1} opacity={0.85} />
                )}
                <motion.circle
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 240, damping: 16 }}
                  r={r}
                  fill={c}
                  fillOpacity={isFocus ? 0.34 : 0.16}
                  stroke={isFocus ? "#ffffff" : c}
                  strokeWidth={isFocus ? 2 : 1.5}
                />
                <circle r={2.5} fill={isFocus ? "#ffffff" : c} />
                {showLabel && (
                  <text
                    x={r + 7}
                    y={4}
                    fontSize={tight ? 11 : 12}
                    fontWeight={isFocus ? 600 : 500}
                    fill={isFocus ? "#ffffff" : "#f2f3f5"}
                    stroke="#0a0d11"
                    strokeWidth={3}
                    paintOrder="stroke"
                    strokeLinejoin="round"
                    style={{ pointerEvents: "none" }}
                  >
                    {n.label.length > clamp ? n.label.slice(0, clamp - 1) + "…" : n.label}
                  </text>
                )}
              </g>
            );
          })}
        </AnimatePresence>
      </svg>

      {/* the key, bottom-right, exactly as a broadcast graphic labels itself */}
      {simNodes.length > 0 && (
        <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-3">
          <span className="chyron flex items-center gap-1.5 text-faint">
            <span className="size-2 rounded-full" style={{ background: RED }} />
            Subject
          </span>
          <span className="chyron flex items-center gap-1.5 text-faint">
            <span className="size-2 rounded-full" style={{ background: BLUE }} />
            Entity
          </span>
        </div>
      )}

      {focus && (
        <div className="monitor pointer-events-none absolute bottom-3 left-3 right-3 max-w-[min(20rem,calc(100%-1.5rem))] px-3.5 py-3">
          <div className="mb-1.5 flex items-center gap-2">
            <span
              className="size-2 rounded-full"
              style={{ background: nodeColor(focus) }}
              aria-hidden
            />
            <span
              className="chyron"
              style={{ color: isSubject(focus) ? RED : BLUE }}
            >
              {focus.type}
            </span>
            {focus.degree != null && (
              <span className="chyron numeric ml-auto text-faint">
                {focus.degree} link{focus.degree === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="headline text-lg leading-tight text-white">{focus.label}</div>
          {focus.summary && (
            <p className="mt-1.5 text-[13px] leading-snug text-dim">{focus.summary}</p>
          )}
        </div>
      )}
    </div>
  );
}
