"use client";

/**
 * The guided tour, wired into the channel. `Onboarding` wraps the app; the tour
 * auto-starts once on a first visit to the home page (the only route that has
 * every target on it) and is remembered in localStorage, the same way demo mode
 * is. `TourButton` puts it back on air on demand.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { NextStep, NextStepProvider, useNextStep, type Tour } from "nextstepjs";
import { PlayCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { TourCard } from "@/components/onboarding/tour-card";
import { TOUR_ID, TOUR_VERSION, tours } from "@/components/onboarding/tours";

const SEEN_KEY = "bbc.tourSeen";

/** Lets the cue hook swap the step list before the tour opens. */
const TourStepsCtx = createContext<{ setSteps: (s: Tour[]) => void }>({
  setSteps: () => {},
});

const useTourSteps = () => useContext(TourStepsCtx);

function seen() {
  try {
    return Number(window.localStorage.getItem(SEEN_KEY)) >= TOUR_VERSION;
  } catch {
    // a locked-down browser should cost the viewer a tour, not the page
    return true;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, String(TOUR_VERSION));
  } catch {
    /* ignore */
  }
}

/**
 * Drop any step whose target isn't on screen — the on-air lamp is hidden below
 * `md`, and a step pointing at a hidden element parks the card off the side of
 * the viewport. The remaining steps renumber themselves, so the card's "03/08"
 * stays honest on a phone.
 */
function visibleSteps(): Tour[] {
  return tours.map((t) => ({
    ...t,
    steps: t.steps.filter((step) => {
      if (!step.selector) return true;
      const el = document.querySelector(step.selector);
      if (!el) return false;
      // measure, don't ask for offsetParent: the lower third is position:fixed,
      // which has no offset parent even when it is plainly on screen
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }),
  }));
}

/** Auto-cue on a first visit to the home page. Renders nothing. */
function FirstVisit({ cue }: { cue: () => void }) {
  const pathname = usePathname();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || pathname !== "/" || seen()) return;
    fired.current = true;
    // let the page paint and the hero settle before the spotlight lands
    const t = setTimeout(cue, 900);
    return () => clearTimeout(t);
  }, [pathname, cue]);

  return null;
}

/** Puts the tour back on air. Lives in the channel bar. */
export function TourButton({ className }: { className?: string }) {
  const cue = useCueTour();
  return (
    <Button
      variant="quiet"
      className={className}
      onClick={cue}
      title="Replay the guided tour"
    >
      <PlayCircle className="size-3.5" strokeWidth={2} aria-hidden />
      Tour
    </Button>
  );
}

/**
 * Cue the tour: re-measure which targets are on screen, then start. The steps
 * are set on the provider one tick before `startNextStep`, so NextStep reads
 * the filtered list rather than the one from the previous viewport.
 */
function useCueTour() {
  const { startNextStep } = useNextStep();
  const { setSteps } = useTourSteps();
  return useCallback(() => {
    setSteps(visibleSteps());
    setTimeout(() => startNextStep(TOUR_ID), 0);
  }, [setSteps, startNextStep]);
}

export function Onboarding({ children }: { children: React.ReactNode }) {
  const [steps, setSteps] = useState<Tour[]>(tours);
  // stable, so the cue callback (and the first-visit timer that depends on it)
  // survives re-renders of the whole app
  const ctx = useMemo(() => ({ setSteps }), []);

  return (
    <NextStepProvider>
      <TourStepsCtx.Provider value={ctx}>
        <NextStep
          steps={steps}
          cardComponent={TourCard}
          // the studio is already dark; a heavy scrim would flatten the set
          shadowRgb="4, 6, 9"
          shadowOpacity="0.72"
          arrowStyle={{ color: "#bb1919" }}
          // the fixed lower third owns the foot of the screen — don't jump the
          // page back to the top when the tour ends on it
          scrollToTop={false}
          disableConsoleLogs
          onComplete={markSeen}
          onSkip={markSeen}
        >
          <Cue />
          {children}
        </NextStep>
      </TourStepsCtx.Provider>
    </NextStepProvider>
  );
}

/** Sits inside the provider so it can use the tour hooks. Renders nothing. */
function Cue() {
  return <FirstVisit cue={useCueTour()} />;
}
