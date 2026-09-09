"use client";

/**
 * The Desk — the transparency dashboard. Every figure here is a notional USD
 * book (paper mode, simulated on Manifold): the treasury, the risk limits
 * that gate it, the open and settled book by barbell leg, and the simulated
 * flywheel. Nothing on this page is realized cash.
 */

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Slug } from "@/components/broadcast";
import { Button, Pill, SectionLabel } from "@/components/ui";
import { TreasuryPanel } from "@/components/desk/treasury-panel";
import { RiskPanel } from "@/components/desk/risk-panel";
import { PositionsPanel } from "@/components/desk/positions-panel";
import { SettledHistoryPanel, LegPerformancePanel } from "@/components/desk/settled-panel";
import { FlywheelPanel } from "@/components/desk/flywheel-panel";
import { useOnAir } from "@/components/channel-frame";
import {
  api,
  type FlywheelResp,
  type PortfolioResp,
  type SettledPositionsResp,
  type TreasuryResp,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export default function DeskPage() {
  const [treasury, setTreasury] = useState<TreasuryResp | null>(null);
  const [flywheel, setFlywheel] = useState<FlywheelResp | null>(null);
  const [settled, setSettled] = useState<SettledPositionsResp | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    Promise.all([
      api.treasury().then(setTreasury),
      api.flywheel().then(setFlywheel),
      api.settledPositions().then(setSettled),
      api.portfolio().then(setPortfolio),
    ])
      .catch(() => setErr("The desk is off air — the agent API did not answer."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useOnAir({
    headline: "The Desk — the book, in the open",
    strap:
      "Every treasury, risk and flywheel figure on this page is notional, paper-mode, simulated on Manifold",
    brandSuffix: "Transparency",
  });

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6">
      <h1 className="headline mb-6 max-w-[24ch] text-[clamp(2.2rem,5.5vw,3.4rem)] text-white">
        The Desk
      </h1>

      <div className="flex flex-wrap items-center gap-3">
        <Pill tone="hold">Paper mode · notional book · simulated flywheel</Pill>
        <Slug>Public transparency dashboard — nothing here is realized cash</Slug>
        <Button variant="quiet" className="ml-auto" onClick={load} disabled={loading}>
          <RefreshCw
            className={cn("size-3.5", loading && "animate-spin")}
            strokeWidth={2.5}
            aria-hidden
          />
          {loading ? "Reading the desk" : "Re-read the desk"}
        </Button>
      </div>

      {err && (
        <div className="monitor mt-6 border-down/45 px-4 py-4">
          <div className="chyron text-down">Off air</div>
          <p className="mt-1.5 text-[14px] text-ink">{err}</p>
          <Button variant="ghost" className="mt-4" onClick={load}>
            Try the line again
          </Button>
        </div>
      )}

      {loading && !treasury ? (
        <p className="chyron mt-16 px-4 py-16 text-center text-faint">
          Reading the desk…
        </p>
      ) : (
        <div className="mt-10 space-y-12">
          {treasury && <TreasuryPanel treasury={treasury} />}
          {treasury && <RiskPanel treasury={treasury} />}
          {portfolio && <PositionsPanel positions={portfolio.positions} />}
          {settled && <SettledHistoryPanel positions={settled.positions} />}
          {settled && <LegPerformancePanel legPerformance={settled.leg_performance} />}
          {flywheel && <FlywheelPanel flywheel={flywheel} />}
        </div>
      )}

      {!loading && !treasury && !err && (
        <div className="mt-10">
          <SectionLabel className="mb-4">The desk</SectionLabel>
          <p className="text-[14px] text-dim">No data available yet.</p>
        </div>
      )}
    </div>
  );
}
