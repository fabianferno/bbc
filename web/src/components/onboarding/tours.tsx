"use client";

/**
 * The running order for the guided tour. Copy here is the channel's voice, and
 * it obeys the phase rule: the alpha runs in paper mode, so nothing in this
 * tour may describe simulated P&L as cash.
 *
 * Selectors are the `#tour-*` ids planted in the header, the home page and the
 * channel frame. Steps 1–4 and the last step point at furniture that exists on
 * every route; the middle steps are home-page only, which is why the tour is
 * only auto-started there (see `onboarding.tsx`).
 */

import type { Tour } from "nextstepjs";

/** Bump when the tour changes enough that returning viewers should see it again. */
export const TOUR_ID = "welcome";
export const TOUR_VERSION = 1;

/** Clears the sticky channel bar when a target is scrolled into view. */
const HEADER = 76;

export const tours: Tour[] = [
  {
    tour: TOUR_ID,
    steps: [
      {
        title: "This is a news channel, not a dashboard",
        content: (
          <>
            BBC is an autonomous prediction-market trader that files a report on
            every position it takes. Everything you are about to see is the
            agent&rsquo;s own book, read out on air. Ninety seconds.
          </>
        ),
        selector: "#tour-channel",
        side: "bottom-left",
        pointerPadding: 8,
        pointerRadius: 0,
      },
      {
        title: "The programme strip",
        content: (
          <>
            Four programmes. <span className="text-white">On air</span> is the
            running order, <span className="text-white">The night desk</span>{" "}
            shows the agent reasoning live,{" "}
            <span className="text-white">The book</span> is every open and closed
            position, and <span className="text-white">The Desk</span> is where
            you put a market to it yourself.
          </>
        ),
        selector: "#tour-programmes",
        side: "bottom",
        pointerPadding: 6,
        pointerRadius: 0,
      },
      {
        title: "The lamp says which phase is on air",
        content: (
          <>
            The alpha runs in <span className="text-white">paper mode</span>:
            markets are real and the reasoning is real, but the trades are
            simulated on Manifold play money. Any figure you see on this site
            carries the mode that produced it — no paper P&amp;L is ever dressed
            up as cash.
          </>
        ),
        selector: "#tour-onair",
        side: "bottom",
        pointerPadding: 8,
        pointerRadius: 0,
      },
      {
        title: "Sign in to cue the desk",
        content: (
          <>
            Reading is open to everyone. Signing in — email, Google or a Solana
            wallet — is what lets you pull the wire, run the desk on a market and
            anchor a reasoning trace on chain.
          </>
        ),
        selector: "#tour-wallet",
        side: "bottom-right",
        pointerPadding: 8,
        pointerRadius: 0,
      },
      {
        title: "Watch it work, or read the book",
        content: (
          <>
            The night desk streams a cycle as it happens: search, evidence,
            price, size, anchor. The book is the receipt — every position with
            the trace that produced it.
          </>
        ),
        selector: "#tour-hero-actions",
        side: "top-left",
        pointerPadding: 10,
        pointerRadius: 0,
        scrollOffset: HEADER,
      },
      {
        title: "The studio wall",
        content: (
          <>
            What the desk has actually done: traces anchored to Solana,
            settlements signed, markets scored against their outcome, and what
            the thinking cost in inference today.
          </>
        ),
        selector: "#tour-wall",
        side: "top",
        pointerPadding: 8,
        scrollOffset: HEADER,
      },
      {
        title: "Tonight's running order",
        content: (
          <>
            Every market on the wire, with the crowd&rsquo;s price beside it. Open
            one to see where the agent thinks the crowd is wrong — that gap is
            the whole business.
          </>
        ),
        selector: "#tour-running-order",
        side: "top",
        pointerPadding: 8,
        scrollOffset: HEADER,
      },
      {
        title: "The bar never leaves",
        content: (
          <>
            The lower third carries whatever this page has on air, and the tape
            under it rolls the wire. Wherever you go, that bar tells you what the
            desk is doing. You&rsquo;re clear — go and watch it trade.
          </>
        ),
        selector: "#tour-lowerthird",
        side: "top",
        pointerPadding: 0,
        pointerRadius: 0,
      },
    ],
  },
];
