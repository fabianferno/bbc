export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "http://localhost:8000";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => getJSON<HealthResp>("/api/health"),
  markets: (limit = 24) => getJSON<MarketsResp>(`/api/markets?limit=${limit}`),
  discover: () =>
    fetch(`${API_BASE}/api/discover`, { method: "POST" }).then((r) => r.json()),
  trace: (id: number) => getJSON<TraceResp>(`/api/trace/${id}`),
  // Most recent graph-bearing decision for a market, so the analyze page can show
  // prior work instead of an empty board. 404 simply means "never analysed".
  latestForMarket: async (marketId: string): Promise<DecisionResp | null> => {
    const res = await fetch(
      `${API_BASE}/api/markets/${encodeURIComponent(marketId)}/latest`,
      { cache: "no-store" },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${res.status} latest`);
    return res.json() as Promise<DecisionResp>;
  },
  decision: (id: number) => getJSON<DecisionResp>(`/api/decisions/${id}`),
  // wallet (personal mode) restricts to positions/txns tied to that signer; omit for the shared agent record.
  portfolio: (wallet?: string | null) =>
    getJSON<PortfolioResp>(`/api/portfolio${wallet ? `?wallet=${encodeURIComponent(wallet)}` : ""}`),
  metrics: () => getJSON<MetricsResp>("/api/metrics"),
  anchors: (limit = 50, wallet?: string | null) => {
    const p = new URLSearchParams({ limit: String(limit) });
    if (wallet) p.set("wallet", wallet);
    return getJSON<{ anchors: Anchor[] }>(`/api/anchors?${p.toString()}`);
  },
  analyzeUrl: (id: string, opts: StreamOpts = {}) => {
    const qs = streamQuery(opts);
    return `${API_BASE}/api/analyze/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`;
  },
  autoUrl: (n: number, opts: StreamOpts = {}) => {
    const qs = streamQuery({ ...opts, n });
    return `${API_BASE}/api/auto${qs ? `?${qs}` : ""}`;
  },
  treasury: () => getJSON<TreasuryResp>("/api/treasury"),
  flywheel: () => getJSON<FlywheelResp>("/api/flywheel"),
  settledPositions: (limit = 100) =>
    getJSON<SettledPositionsResp>(`/api/positions/settled?limit=${limit}`),
  // Persist a client-signed (personal-mode) on-chain txn so it shows in the ledger.
  recordAnchor: (body: AnchorRecord) =>
    fetch(`${API_BASE}/api/anchors/record`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => {
      if (!r.ok) throw new Error(`record ${r.status}`);
      return r.json() as Promise<OnchainTx>;
    }),
};

export type StreamOpts = {
  replay?: boolean;
  mode?: "demo" | "personal";
  wallet?: string | null;
  n?: number;
};

function streamQuery(opts: StreamOpts): string {
  const p = new URLSearchParams();
  if (opts.replay) p.set("replay", "true");
  if (opts.mode) p.set("mode", opts.mode);
  if (opts.wallet) p.set("wallet", opts.wallet);
  if (opts.n != null) p.set("n", String(opts.n));
  return p.toString();
}

export type AnchorRecord = {
  decision_id: number | null;
  market_id: string | null;
  kind: "anchor" | "settle";
  tx_hash: string;
  trace_hash?: string | null;
  usdc_amount?: number | null;
  to_address?: string | null;
  from_address?: string | null;
};

import type { Anchor, GraphEdge, GraphNode, Market, Ontology, OnchainTx } from "./types";

export type ChainHealth = {
  network: string;
  cluster: string;
  real: boolean;
  rpc_url: string;
  rpc_ok: boolean;
  address: string | null;
  sol_balance: number | null;
  usdc_balance: number | null;
  mint: string | null;
  bbc_mint_configured: boolean;
  explorer: string;
};

export type HealthResp = {
  ok: boolean;
  mode: string;
  model: string;
  chain: ChainHealth;
  /** @deprecated alias of `chain`, emitted for one release. Read `chain`. */
  arc?: ChainHealth;
};
export type MarketsResp = { markets: Market[]; seeds: string[] };
export type TraceResp = {
  decision_id: number;
  trace_hash: string;
  canonical_json: string;
  trace: Record<string, unknown>;
  anchors: Anchor[];
};
export type DecisionResp = {
  decision: Record<string, unknown> & { response_json?: Record<string, unknown> };
  graph: { ontology: Ontology; nodes: GraphNode[]; edges: GraphEdge[]; stats: Record<string, unknown> } | null;
  anchors: Anchor[];
  market: { id: string; question: string; category: string; last_price_yes: number } | null;
};
export type PortfolioResp = {
  positions: Position[];
  open_count: number;
  realized_pnl: number;
  bankroll: number;
};
export type Position = {
  id: number;
  market_id: string;
  question: string | null;
  venue: string | null;
  side: string;
  shares: number;
  entry_price: number;
  pnl: number | null;
  status: string;
  entry_decision_id: number | null;
  opened_at: string;
  /** barbell sleeve this position was sized under — "fast" or "slow". */
  leg?: "fast" | "slow" | null;
};

// ── treasury / flywheel / settled — the transparency dashboard's payloads ──

export type BreakerState = {
  name: string;
  tripped: boolean;
  reason: string | null;
  expires_at: string | null;
};

export type TreasuryResp = {
  currency: string;
  seed: number;
  balance: number;
  high_water_mark: number;
  drawdown: number;
  updated_at: string | null;
  mode: string;
  simulated: boolean;
  notional: boolean;
  deployed: { fast: number; slow: number; total: number };
  /** live from the risk engine — never hardcode these limits in a component. */
  risk_params: Record<string, number>;
  breakers: BreakerState[];
  /** as of the last agent-loop evaluation, not real-time. */
  halted: boolean;
  events: TreasuryEvent[];
};

export type TreasuryEvent = {
  id: number;
  kind: string;
  amount: number;
  balance_after: number;
  position_id: number | null;
  leg: string | null;
  mode: string;
  created_at: string;
};

export type FlywheelEvent = {
  id: number;
  position_id: number;
  realized_pnl: number;
  treasury_share: number;
  ansem_share: number;
  reserve_share: number;
  ansem_price_usd: number | null;
  ansem_qty: number | null;
  price_source: string;
  mode: string;
  created_at: string;
};

export type FlywheelResp = {
  // `/api/flywheel` spreads `flywheel.totals()` — whose scalar count is
  // `event_count` — alongside `events`, the event log itself. Both survive on
  // the wire, so totals can be reconciled against the visible events.
  event_count: number;
  events: FlywheelEvent[];
  realized_profit_usd: number;
  treasury_usd: number;
  ansem_usd: number;
  ansem_qty: number;
  reserve_usd: number;
  mode: string;
  simulated: boolean;
  /** render this verbatim, visible without interaction — never behind a tooltip. */
  notice: string;
};

export type LegPerformance = {
  settled: number;
  wins: number;
  win_rate: number | null;
  realized_pnl_notional: number;
};

export type SettledPosition = {
  id: number;
  market_id: string;
  question: string | null;
  venue: string | null;
  leg: "fast" | "slow" | null;
  side: string;
  shares: number;
  entry_price: number;
  exit_price: number | null;
  notional_in: number;
  notional_out: number | null;
  pnl: number | null;
  status: string;
  closed_at: string | null;
};

export type SettledPositionsResp = {
  mode: string;
  simulated: boolean;
  notional: boolean;
  positions: SettledPosition[];
  leg_performance: { fast: LegPerformance; slow: LegPerformance };
};
export type MetricsResp = {
  metrics: MetricRow[];
  llm_cost_today: number;
  anchor_count: number;
  settle_count: number;
  real_tx_count: number;
  usdc_balance: number | null;
  model: string;
};
export type MetricRow = {
  category: string;
  n_resolved: number;
  brier: number | null;
  ece: number | null;
  realized_pnl: number;
};
