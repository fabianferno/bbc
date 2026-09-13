"use client";

/**
 * The tour card, drawn as a studio monitor with a red strap across its head —
 * the same furniture the rest of the channel uses. The library's default card
 * is a rounded white tooltip, which would be the one element on the page that
 * does not belong to the broadcast.
 */

import type { CardComponentProps } from "nextstepjs";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui";

export function TourCard({
  step,
  currentStep,
  totalSteps,
  nextStep,
  prevStep,
  skipTour,
  arrow,
}: CardComponentProps) {
  const first = currentStep === 0;
  const last = currentStep === totalSteps - 1;
  const n = (i: number) => String(i).padStart(2, "0");

  return (
    <div className="monitor monitor-lit cut-up relative w-[min(22rem,calc(100vw-2rem))] text-left">
      {/* the strap: what segment this is, and how far in we are */}
      <div className="flex items-center justify-between gap-3 bg-red px-4 py-2 text-white">
        <span className="chyron flex min-w-0 items-center gap-2">
          <span className="lamp" aria-hidden />
          <span className="truncate">Orientation</span>
        </span>
        <span className="chyron numeric shrink-0 text-white/80">
          {n(currentStep + 1)} / {n(totalSteps)}
        </span>
      </div>

      <div className="px-4 pb-4 pt-3.5">
        <h2 className="headline flex items-start gap-2 text-[22px] text-white">
          {step.icon ? (
            <span className="shrink-0 leading-none" aria-hidden>
              {step.icon}
            </span>
          ) : null}
          <span>{step.title}</span>
        </h2>

        <div className="mt-2 text-[14px] leading-relaxed text-dim">{step.content}</div>

        {/* the progress rule — one tally block per step, lit up to here */}
        <div className="mt-4 flex gap-1" aria-hidden>
          {Array.from({ length: totalSteps }, (_, i) => (
            <span
              key={i}
              className={`h-[3px] flex-1 ${i <= currentStep ? "bg-red-bright" : "bg-rule"}`}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button
            variant="quiet"
            onClick={prevStep}
            disabled={first}
            className="px-2"
            aria-label="Previous step"
          >
            <ArrowLeft className="size-3.5" strokeWidth={2.5} aria-hidden />
            Back
          </Button>

          <div className="ml-auto flex items-center gap-2">
            {skipTour && !last && (
              <Button variant="quiet" onClick={skipTour} className="px-2">
                <X className="size-3.5" strokeWidth={2.5} aria-hidden />
                Skip
              </Button>
            )}
            <Button variant="primary" onClick={nextStep}>
              {last ? "Off air" : "Next"}
              {!last && <ArrowRight className="size-3.5" strokeWidth={2.5} aria-hidden />}
            </Button>
          </div>
        </div>
      </div>

      {arrow}
    </div>
  );
}
