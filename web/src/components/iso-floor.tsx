"use client";

import { useEffect, useRef } from "react";

/*
  The trading floor, seen from the gantry.

  A 7×7 isometric field of extruded probability columns. Each column is one
  market on the wire; its height is that market's implied probability, drifting
  as a slow wave the way a book breathes between prints. One column is on air —
  it burns red and is pinned to the price of whatever the rota is showing.

  Canvas rather than DOM: 49 prisms × 3 faces is 147 painted polygons a frame,
  which the compositor should never have to think about.
*/

const N = 7; // columns per side
const TILE_W = 46; // half-width of a tile in the projection
const TILE_H = 23; // half-height — 2:1, the classic isometric ratio
const MAX_LIFT = 58; // tallest a column ever stands

type Props = {
  /** 0..1 — the probability the on-air column should stand for. */
  price?: number | null;
  /** Changes on every cut; re-seeds which column is on air. */
  cut?: number;
  className?: string;
};

/** The rota of cells the on-air column can occupy: front-facing, well lit. */
const AIR_CELLS: [number, number][] = [
  [4, 3], [2, 5], [5, 5], [3, 2], [6, 4], [4, 6], [2, 3], [5, 2],
];

/** Deterministic per-cell noise so the field has texture but never flickers. */
function seed(x: number, y: number) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function face(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  fill: string,
) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

export function IsoFloor({ price, cut = 0, className }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  // read through refs so a cut never restarts the animation loop
  const live = useRef({ price, cut });
  live.current = { price, cut };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = (tms: number) => {
      const t = reduced ? 0 : tms / 1000;
      const { price: p, cut: c } = live.current;

      ctx.clearRect(0, 0, w, h);

      // fit the whole field inside the panel, whatever width it was given
      const s = Math.min(1, (w - 28) / (2 * TILE_W * N));
      const tw = TILE_W * s;
      const th = TILE_H * s;
      const maxLift = MAX_LIFT * s;

      // origin: the field sits centred, a touch low, so it reads as a floor
      const ox = w / 2;
      const oy = h / 2 - (N - 1) * th + 24;

      // the column on air walks the field on every cut, but only across the
      // near half — a red column hiding behind the back row is no use to anyone
      const air = AIR_CELLS[((c % AIR_CELLS.length) + AIR_CELLS.length) % AIR_CELLS.length];
      const airX = air[0];
      const airY = air[1];

      const cells: { x: number; y: number; d: number }[] = [];
      for (let x = 0; x < N; x++)
        for (let y = 0; y < N; y++) cells.push({ x, y, d: x + y });
      cells.sort((a, b) => a.d - b.d); // painter's order: back rows first

      for (const { x, y } of cells) {
        const cx = x - (N - 1) / 2;
        const cy = y - (N - 1) / 2;
        const radial = Math.hypot(cx, cy);
        const n = seed(x, y);

        // the book breathing: a radial swell crossed with a per-cell drift
        const wave =
          Math.sin(t * 0.9 - radial * 0.72) * 0.5 +
          Math.sin(t * 0.45 + n * 6.283) * 0.5;
        const onAir = x === airX && y === airY;

        let lift = (0.5 + wave * 0.28) * maxLift;
        if (onAir) {
          // the on-air column stands for the real number, not the wave
          const target = p == null ? 0.5 : Math.min(Math.max(p, 0.04), 1);
          lift = (0.28 + target * 0.85) * maxLift;
        }
        lift = Math.max(6 * s, lift);

        const sx = ox + (x - y) * tw;
        const sy = oy + (x + y) * th;
        const ty = sy - lift;

        // depth fade: the far rows sit back into the studio dark
        const depth = 1 - (x + y) / ((N - 1) * 2); // 1 near … 0 far
        const dim = 0.42 + depth * 0.58;

        const top: [number, number][] = [
          [sx, ty - th],
          [sx + tw, ty],
          [sx, ty + th],
          [sx - tw, ty],
        ];
        const left: [number, number][] = [
          [sx - tw, ty],
          [sx, ty + th],
          [sx, sy + th],
          [sx - tw, sy],
        ];
        const right: [number, number][] = [
          [sx, ty + th],
          [sx + tw, ty],
          [sx + tw, sy],
          [sx, sy + th],
        ];

        if (onAir) {
          ctx.save();
          ctx.shadowColor = "rgba(224, 32, 32, 0.55)";
          ctx.shadowBlur = 26;
          face(ctx, right, "#8e1414");
          ctx.restore();
          face(ctx, left, "#5e0f0f");
          face(ctx, right, "#a81818");
          face(ctx, top, "#e02020");
        } else {
          face(ctx, left, `rgba(19, 25, 33, ${dim})`);
          face(ctx, right, `rgba(30, 39, 51, ${dim})`);
          // the lit face: taller columns catch more of the studio light
          const heat = 0.16 + (lift / maxLift) * 0.34;
          face(ctx, top, `rgba(${Math.round(47 + heat * 120)}, ${Math.round(
            64 + heat * 150,
          )}, ${Math.round(84 + heat * 170)}, ${dim})`);
        }

        // hairline along the top edge — the bezel light of the video wall
        ctx.beginPath();
        ctx.moveTo(top[3][0], top[3][1]);
        ctx.lineTo(top[0][0], top[0][1]);
        ctx.lineTo(top[1][0], top[1][1]);
        ctx.strokeStyle = onAir
          ? "rgba(255, 120, 120, 0.9)"
          : `rgba(120, 145, 175, ${0.16 * dim})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      if (!reduced) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
