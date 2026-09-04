"use client";

/**
 * The anchor, on air. A looping plate of the bull presenter pinned to the
 * bottom-right corner of every route, standing directly on the lower third —
 * where a broadcast keys its presenter over the bed.
 *
 * The source plate has a hard black background. `mix-blend-mode: screen` keys it
 * out against the dark studio (screen leaves black transparent and keeps the lit
 * bull), so no alpha-channel re-encode is needed. The blend has to sit on the
 * outermost element here: this div is `fixed` with a z-index, so it is its own
 * stacking context — anything blended *inside* it would compose against an empty
 * group instead of the page.
 *
 * `bottom` is the height of the fixed furniture below it (lower third + tape,
 * ~157px), so the plate meets the red bar with no seam.
 */
export function AnchorVideo() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed bottom-[156px] right-3 z-30 hidden w-[210px] overflow-hidden mix-blend-screen [mask-image:linear-gradient(to_bottom,transparent_0%,#000_14%)] sm:block sm:w-[250px] lg:w-[300px]"
    >
      {/* 5% off each side: overscale the plate and pull it back by half. */}
      <video
        src="/anchor-bull.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className="-ml-[5.5%] w-[111%] max-w-none"
      />
    </div>
  );
}
