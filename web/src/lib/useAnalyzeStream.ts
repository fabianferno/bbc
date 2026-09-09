"use client";

import { useCallback, useRef, useState } from "react";
import { api, type DecisionResp } from "./api";
import { useAuth } from "./auth";
import { useDemoMode } from "./demo-mode";
import { useOnchainExecutor } from "./useOnchainExecutor";
import type {
  AnchorRequest,
  Citation,
  Decision,
  GraphEdge,
  GraphNode,
  Market,
  Ontology,
  OnchainTx,
  SettleRequest,
} from "./types";

export type Phase =
  | "idle"
  | "connecting"
  | "filtering"
  | "searching"
  | "ontology"
  | "extracting"
  | "reasoning"
  | "settling"
  | "anchoring"
  | "done"
  | "error";

export type StreamState = {
  phase: Phase;
  market: Market | null;
  searchCount: number | null;
  ontology: Ontology | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  evidence: Citation[];
  decision: Decision | null;
  executed: Record<string, unknown> | null;
  settled: OnchainTx | null;
  anchored: OnchainTx | null;
  error: string | null;
  /** Populated from a stored prior decision rather than a live run. */
  hydrated: boolean;
};

const EMPTY: StreamState = {
  phase: "idle",
  market: null,
  searchCount: null,
  ontology: null,
  nodes: [],
  edges: [],
  evidence: [],
  decision: null,
  executed: null,
  settled: null,
  anchored: null,
  error: null,
  hydrated: false,
};

export function useAnalyzeStream(marketId: string) {
  const [state, setState] = useState<StreamState>(EMPTY);
  const esRef = useRef<EventSource | null>(null);
  const { demoMode } = useDemoMode();
  const { address } = useAuth();
  const { anchor, settle } = useOnchainExecutor();

  const reset = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setState(EMPTY);
  }, []);

  /**
   * Seed the board from a stored decision. `phase` deliberately stays "idle": this
   * is prior work, not a live run, so the "put it on air" call to action remains and
   * `running` stays false. A live start() clears it.
   */
  const hydrate = useCallback((resp: DecisionResp) => {
    setState((s) => {
      if (s.phase !== "idle" || s.hydrated) return s;   // never clobber a live run
      const g = resp.graph;
      const rj = (resp.decision.response_json ?? {}) as Record<string, unknown>;
      const used = (resp.decision.search_used ?? []) as {
        url?: string; title?: string; published?: string | null;
      }[];
      const price = resp.market?.last_price_yes ?? null;
      const txOf = (kind: string) => {
        const a = (resp.anchors ?? []).find((x) => x.kind === kind);
        return a
          ? {
              tx_hash: a.tx_hash,
              explorer_url: a.explorer_url ?? "",
              mocked: Boolean(a.mocked),
              kind: a.kind,
              trace_hash: a.trace_hash ?? undefined,
              usdc_amount: a.usdc_amount ?? undefined,
            }
          : null;
      };
      const pYes = Number(resp.decision.p_yes ?? rj.p_yes ?? 0);
      return {
        ...s,
        hydrated: true,
        ontology: g?.ontology ?? null,
        // Stored rows key nodes by `node_key`; edges reference the same key, so the
        // canvas needs that as `id`/`source`/`target`, not the numeric row id.
        nodes: (g?.nodes ?? []).map((n) => ({
          ...n,
          id: (n as unknown as { node_key: string }).node_key,
        })),
        edges: (g?.edges ?? []).map((e) => {
          const r = e as unknown as { source_key: string; target_key: string };
          return { ...e, source: r.source_key, target: r.target_key };
        }),
        searchCount: used.length || null,
        evidence: used.map((h) => ({
          url: h.url ?? "",
          title: h.title ?? "",
          published_date: h.published ?? null,
        })),
        anchored: txOf("anchor"),
        settled: txOf("settle"),
        decision: {
          decision_id: Number(resp.decision.id ?? 0),
          p_yes: pYes,
          market_price: price ?? 0,
          confidence: Number(resp.decision.confidence ?? rj.confidence ?? 0),
          edge: Number(rj.edge_vs_market ?? (price == null ? 0 : pYes - price)),
          action: String(resp.decision.action ?? rj.recommended_action ?? "skip"),
          rationale: String(rj.rationale ?? ""),
        },
      };
    });
  }, []);

  const start = useCallback(
    (replay = false) => {
      esRef.current?.close();
      setState({ ...EMPTY, phase: "connecting" });
      const personal = !demoMode && !replay && Boolean(address);
      const es = new EventSource(
        api.analyzeUrl(marketId, {
          replay,
          mode: personal ? "personal" : "demo",
          wallet: personal ? address : null,
        }),
      );
      esRef.current = es;

      const on = (name: string, fn: (d: unknown) => void) =>
        es.addEventListener(name, (e) => fn(JSON.parse((e as MessageEvent).data)));

      on("market", (d) =>
        setState((s) => ({ ...s, market: d as Market, phase: "filtering" })),
      );
      on("filter_passed", () => setState((s) => ({ ...s, phase: "searching" })));
      on("search_complete", (d) =>
        setState((s) => ({
          ...s,
          searchCount: (d as { n: number }).n,
          phase: "ontology",
        })),
      );
      on("ontology_generated", (d) =>
        setState((s) => ({ ...s, ontology: d as Ontology, phase: "extracting" })),
      );
      on("entity_extracted", (d) =>
        setState((s) => ({
          ...s,
          nodes: [...s.nodes, (d as { node: GraphNode }).node],
        })),
      );
      on("relation_extracted", (d) =>
        setState((s) => ({
          ...s,
          edges: [...s.edges, (d as { edge: GraphEdge }).edge],
        })),
      );
      on("graph_complete", () => setState((s) => ({ ...s, phase: "reasoning" })));
      on("evidence", (d) =>
        setState((s) => ({
          ...s,
          evidence: (d as { citations: Citation[] }).citations,
        })),
      );
      on("decision", (d) =>
        setState((s) => ({ ...s, decision: d as Decision, phase: "settling" })),
      );
      on("executed", (d) =>
        setState((s) => ({ ...s, executed: d as Record<string, unknown> })),
      );
      on("settled", (d) =>
        setState((s) => ({ ...s, settled: d as OnchainTx, phase: "anchoring" })),
      );
      on("anchored", (d) =>
        setState((s) => ({ ...s, anchored: d as OnchainTx, phase: "anchoring" })),
      );
      // personal mode: the server hands us unsigned txns to sign in-browser
      on("settle_request", (d) => {
        setState((s) => ({ ...s, phase: "settling" }));
        settle(d as SettleRequest)
          .then((tx) => setState((s) => ({ ...s, settled: tx, phase: "anchoring" })))
          .catch((e) =>
            setState((s) => ({ ...s, error: `settle: ${e.message ?? e}`, phase: "error" })),
          );
      });
      on("anchor_request", (d) => {
        setState((s) => ({ ...s, phase: "anchoring" }));
        anchor(d as AnchorRequest)
          .then((tx) => setState((s) => ({ ...s, anchored: tx })))
          .catch((e) =>
            setState((s) => ({ ...s, error: `anchor: ${e.message ?? e}`, phase: "error" })),
          );
      });
      on("complete", () => setState((s) => ({ ...s, phase: "done" })));
      on("error", (d) =>
        setState((s) => ({
          ...s,
          error: (d as { message: string }).message,
          phase: "error",
        })),
      );
      on("done", () => {
        setState((s) => (s.phase === "error" ? s : { ...s, phase: "done" }));
        es.close();
      });
      es.onerror = () => {
        setState((s) =>
          s.phase === "done" || s.phase === "error"
            ? s
            : { ...s, phase: "error", error: "stream disconnected" },
        );
        es.close();
      };
    },
    [marketId, demoMode, address, anchor, settle],
  );

  const running =
    state.phase !== "idle" && state.phase !== "done" && state.phase !== "error";

  return { state, start, reset, running, hydrate };
}
