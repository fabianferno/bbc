export type Market = {
  id: string;
  venue: string;
  question: string;
  category: string | null;
  end_date: string | null;
  last_price_yes: number | null;
  volume_24h: number | null;
  market_url?: string | null;
  seeded?: boolean;
};

export type GraphNode = {
  id: string;
  label: string;
  type: string;
  summary?: string;
  source_url?: string | null;
  published_date?: string | null;
  degree?: number;
};

export type GraphEdge = {
  source: string;
  target: string;
  type: string;
  rationale?: string;
  source_url?: string | null;
};

export type Ontology = { entity_types: string[]; relation_types: string[] };

export type Decision = {
  decision_id: number;
  p_yes: number;
  market_price: number;
  confidence: number;
  edge: number;
  action: string;
  rationale: string;
};

export type OnchainTx = {
  /** Solana transaction signature (base58). Wire name kept as `tx_hash`. */
  tx_hash: string;
  explorer_url: string;
  mocked: boolean;
  kind: string;
  trace_hash?: string;
  usdc_amount?: number;
};

export type Anchor = {
  id: number;
  decision_id: number | null;
  market_id: string | null;
  kind: string;
  trace_hash: string | null;
  /** Solana transaction signature (base58). Wire name kept as `tx_hash`. */
  tx_hash: string;
  explorer_url: string | null;
  usdc_amount: number | null;
  from_address: string | null; // signer wallet for personal-mode txns; null in demo mode
  mocked: number;
  created_at: string;
};

// SSE event payloads
export type AnalyzeEvent =
  | { event: "market"; data: Market }
  | { event: "filter_passed"; data: { market_id: string; question: string } }
  | { event: "search_complete"; data: { n: number } }
  | { event: "ontology_generated"; data: Ontology }
  | { event: "entity_extracted"; data: { node: GraphNode } }
  | { event: "relation_extracted"; data: { edge: GraphEdge } }
  | { event: "graph_complete"; data: { stats: Record<string, unknown> } }
  | { event: "evidence"; data: { citations: Citation[] } }
  | { event: "decision"; data: Decision }
  | { event: "executed"; data: Record<string, unknown> }
  | { event: "settled"; data: OnchainTx }
  | { event: "anchored"; data: OnchainTx }
  | { event: "complete"; data: Record<string, unknown> }
  | { event: "error"; data: { message: string } }
  | { event: "done"; data: Record<string, unknown> };

export type Citation = { url: string; title: string; published_date: string | null };

// Personal-mode: server asks the browser to sign these Solana txns itself.
// Address-shaped fields are optional/lenient because the backend wire contract
// is unchanged from the EVM build — anything that isn't a valid base58 pubkey
// falls back to the client-side Solana defaults in lib/solana.ts.
export type AnchorRequest = {
  decision_id: number;
  market_id: string;
  /** sha256 of the canonical reasoning trace; written via the Memo program. */
  trace_hash: string;
  /** Legacy/optional destination hint. Ignored unless a valid Solana pubkey. */
  to?: string | null;
  chain_id?: number | null;
};

export type SettleRequest = {
  decision_id: number;
  market_id: string;
  /** Treasury pubkey. Falls back to NEXT_PUBLIC_SOLANA_TREASURY, then self. */
  treasury?: string | null;
  /** SPL mint to transfer. Prefers `mint`; `usdc_address` kept for wire compat. */
  mint?: string | null;
  usdc_address?: string | null;
  amount_usdc: number;
  decimals?: number | null;
  chain_id?: number | null;
};
