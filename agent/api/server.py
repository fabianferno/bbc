"""FastAPI sidecar for the BBC newsroom frontend.

Wraps the existing agent engine: streams a live analyze pipeline over SSE and serves
history (markets, decisions, graphs, traces, on-chain anchors, portfolio, metrics) from
SQLite. Run with:  uvicorn agent.api.server:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import json
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from agent.api import seeds
from agent.api.analyze import run_analysis
from agent.config import settings
from agent.execution import safety
from agent.logging import get_logger
from agent.onchain import explorer_tx_url, get_solana, network_name
from agent.store import db
from agent.treasury import flywheel, ledger, legs

log = get_logger(__name__)


@asynccontextmanager
async def _lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Idempotent treasury self-seed so a pre-treasury DB never serves a 0.00 book."""
    try:
        ledger.seed_if_empty()
    except Exception as e:  # noqa: BLE001 — never block API startup on the ledger
        log.warning("api.treasury_seed_failed", error=str(e))
    yield


app = FastAPI(title="BBC API", version="0.1.0", lifespan=_lifespan)

# Public read-mostly API consumed by a static frontend (no cookies) → allow any origin.
# This lets the deployed Vercel app (and judges) reach the agent over SSE + REST.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# events that animate node-by-node get a small inter-event delay for a smooth build
_ANIM_DELAY = {"entity_extracted": 0.09, "relation_extracted": 0.06}


# ---------- health / config ----------

@app.get("/")
def root() -> dict[str, Any]:
    """Service banner / quick liveness check."""
    return {"service": "BBC API", "status": "ok", "docs": "/docs"}


@app.get("/health")
@app.get("/healthz")
def healthz() -> dict[str, Any]:
    """Lightweight liveness probe — no external calls (fast, for uptime/platform checks)."""
    return {"status": "ok"}


@app.get("/api/health")
def health() -> dict[str, Any]:
    sol = get_solana()
    chain = {
        "network": network_name(),
        "cluster": settings.solana_cluster,
        "real": sol.real,
        "rpc_url": settings.solana_rpc_url,
        "rpc_ok": sol.rpc_ok(),
        "address": sol.address,
        "sol_balance": sol.sol_balance(),
        "usdc_balance": sol.usdc_balance(),
        "mint": sol.mint,
        "bbc_mint_configured": bool(settings.bbc_mint_address),
        "explorer": settings.solana_explorer_base,
    }
    return {
        "ok": True,
        "mode": settings.agent_mode,
        "model": settings.bedrock_model_id,
        "chain": chain,
        # deprecated alias for the frontend's HealthResp.arc — remove after one release
        "arc": chain,
    }


# ---------- markets ----------

@app.get("/api/markets")
def markets(limit: int = 24) -> dict[str, Any]:
    from agent.api.analyze import venue_market_url

    seeded = set(seeds.list_seeds())
    with db.connect() as conn:
        rows = db.list_open_markets(conn, limit)
    out = []
    for r in rows:
        d = dict(r)
        d["market_url"] = venue_market_url(d)
        d.pop("raw", None)
        d["seeded"] = any(s.startswith(d["id"].replace(":", "_")) for s in seeded)
        out.append(d)
    return {"markets": out, "seeds": list(seeded)}


@app.post("/api/discover")
def discover() -> dict[str, Any]:
    """Populate the DB with current open Manifold markets (paper-mode discovery)."""
    from agent.agent import _discover_manifold

    found = _discover_manifold()
    return {"discovered": len(found)}


# ---------- live / replay analyze (SSE) ----------

def _sse_format(event: str, data: dict[str, Any]) -> dict[str, Any]:
    return {"event": event, "data": json.dumps(data)}


async def _replay_stream(events: list[dict[str, Any]]):
    for item in events:
        ev, data = item["event"], item.get("data", {})
        yield _sse_format(ev, data)
        await asyncio.sleep(_ANIM_DELAY.get(ev, 0.35))
    yield _sse_format("done", {})


async def _live_stream(market: dict[str, Any], *, mode: str = "demo", signer: str | None = None):
    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def emit(event: str, data: dict[str, Any]) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, {"event": event, "data": data})

    def worker() -> None:
        try:
            run_analysis(market, emit=emit, mode=mode, signer=signer)
        except Exception as e:  # noqa: BLE001
            log.warning("analyze.worker_failed", error=str(e))
            loop.call_soon_threadsafe(
                queue.put_nowait, {"event": "error", "data": {"message": str(e)}}
            )
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, {"event": "done", "data": {}})

    threading.Thread(target=worker, daemon=True).start()

    while True:
        item = await queue.get()
        ev, data = item["event"], item["data"]
        yield _sse_format(ev, data)
        if ev == "done":
            break
        delay = _ANIM_DELAY.get(ev)
        if delay:
            await asyncio.sleep(delay)


@app.get("/api/analyze/{market_id:path}")
async def analyze(
    market_id: str, replay: bool = False, mode: str = "demo", wallet: str | None = None
) -> EventSourceResponse:
    if replay:
        events = seeds.load_seed(market_id)
        if events is None:
            raise HTTPException(404, f"no seed for {market_id}")
        return EventSourceResponse(_replay_stream(events))

    with db.connect() as conn:
        market = db.get_market(conn, market_id)
    if not market:
        raise HTTPException(404, f"unknown market {market_id}")
    return EventSourceResponse(_live_stream(market, mode=mode, signer=wallet))


# ---------- autonomous mode (SSE) ----------

def _pick_open_markets(n: int) -> list[dict[str, Any]]:
    with db.connect() as conn:
        return db.list_tradeable_markets(conn, n)


async def _auto_stream(n: int, *, mode: str = "demo", signer: str | None = None):
    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def top(event: str, data: dict[str, Any]) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, {"event": event, "data": data})

    def worker() -> None:
        try:
            markets = _pick_open_markets(n)
            top("auto_start", {"n": len(markets)})
            for idx, m in enumerate(markets):
                from agent.api.analyze import venue_market_url
                top("auto_pick", {
                    "index": idx,
                    "market": {"id": m["id"], "question": m["question"],
                               "category": m.get("category"), "price_yes": m.get("last_price_yes"),
                               "market_url": venue_market_url(m)},
                })

                def emit(ev: str, data: dict[str, Any], _i: int = idx) -> None:
                    loop.call_soon_threadsafe(
                        queue.put_nowait,
                        {"event": "auto_event", "data": {"index": _i, "ev": ev, "data": data}},
                    )

                try:
                    run_analysis(m, emit=emit, mode=mode, signer=signer)
                except Exception as e:  # noqa: BLE001
                    top("auto_error", {"index": idx, "message": str(e)})
        except Exception as e:  # noqa: BLE001
            top("auto_error", {"index": -1, "message": str(e)})
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, {"event": "auto_done", "data": {}})

    threading.Thread(target=worker, daemon=True).start()
    while True:
        item = await queue.get()
        yield _sse_format(item["event"], item["data"])
        if item["event"] == "auto_done":
            break


@app.get("/api/auto")
async def auto(
    n: int = 3, mode: str = "demo", wallet: str | None = None
) -> EventSourceResponse:
    """Agent autonomously selects markets from its universe and trades them — no human pick."""
    return EventSourceResponse(_auto_stream(min(max(n, 1), 8), mode=mode, signer=wallet))


# ---------- history reads ----------

@app.get("/api/decisions/{decision_id}")
def decision(decision_id: int) -> dict[str, Any]:
    with db.connect() as conn:
        d = db.get_decision(conn, decision_id)
        if not d:
            raise HTTPException(404, "unknown decision")
        if d.get("response_json"):
            d["response_json"] = json.loads(d["response_json"])
        if d.get("search_used"):
            d["search_used"] = json.loads(d["search_used"])
        graph = db.get_graph(conn, decision_id)
        anchors = db.anchors_for_decision(conn, decision_id)
        market = db.get_market(conn, d["market_id"])
    return {"decision": d, "graph": graph, "anchors": anchors,
            "market": {k: market[k] for k in ("id", "question", "category", "last_price_yes")}
            if market else None}


@app.get("/api/markets/{market_id:path}/latest")
def latest_for_market(market_id: str) -> dict[str, Any]:
    """Most recent graph-bearing decision for a market.

    Lets the analyze page show what the desk already worked out for this market
    instead of an empty board, without re-running the pipeline.
    """
    with db.connect() as conn:
        did = db.latest_graph_decision_id(conn, market_id)
        if did is None:
            raise HTTPException(404, f"no prior decision for {market_id}")
    return decision(did)


@app.get("/api/graph/{decision_id}")
def graph(decision_id: int) -> dict[str, Any]:
    with db.connect() as conn:
        g = db.get_graph(conn, decision_id)
    if not g:
        raise HTTPException(404, "no graph for decision")
    return g


@app.get("/api/trace/{decision_id}")
def trace(decision_id: int) -> dict[str, Any]:
    """Return the exact canonical bytes + hash + on-chain anchors, for client-side verify."""
    with db.connect() as conn:
        blob = db.get_trace_blob(conn, decision_id)
        if not blob:
            raise HTTPException(404, "no trace for decision")
        anchors = db.anchors_for_decision(conn, decision_id)
    return {
        "decision_id": decision_id,
        "trace_hash": blob["trace_hash"],
        "canonical_json": blob["canonical_json"],
        "trace": json.loads(blob["canonical_json"]),
        "anchors": anchors,
    }


@app.get("/api/portfolio")
def portfolio(wallet: str | None = None) -> dict[str, Any]:
    """Shared agent record by default; pass `wallet` (personal mode) to restrict to
    positions whose entry decision was anchored on-chain from that address."""
    with db.connect() as conn:
        positions = db.positions_with_market(conn, 200, wallet=wallet)
        open_pos = [p for p in positions if p["status"] == "open"]
        realized = sum(p["pnl"] or 0 for p in positions if p["status"] == "closed")
    return {
        "positions": positions,
        "open_count": len(open_pos),
        "realized_pnl": realized,
        "bankroll": settings.agent_bankroll,
    }


@app.get("/api/metrics")
def metrics() -> dict[str, Any]:
    sol = get_solana()
    with db.connect() as conn:
        ms = db.latest_metrics(conn)
        cost_today = db.llm_cost_today(conn)
        anchors = db.recent_anchors(conn, limit=100)
    return {
        "metrics": ms,
        "llm_cost_today": cost_today,
        "anchor_count": sum(1 for a in anchors if a["kind"] == "anchor"),
        "settle_count": sum(1 for a in anchors if a["kind"] == "settle"),
        "real_tx_count": sum(1 for a in anchors if not a["mocked"]),
        "usdc_balance": sol.usdc_balance(),
        "model": settings.bedrock_model_id,
    }


@app.get("/api/treasury")
def treasury() -> dict[str, Any]:
    """Notional treasury state. NOT realized cash — paper mode, notional USD book."""
    snap = ledger.snapshot()
    breakers = safety.breaker_snapshot()
    return {
        **snap,
        "mode": "paper",
        "simulated": True,
        "notional": True,
        "deployed": {
            "fast": ledger.deployed(legs.FAST),
            "slow": ledger.deployed(legs.SLOW),
            "total": ledger.deployed(),
        },
        "risk_params": safety.RISK_PARAMS,
        "breakers": breakers,
        "halted": any(b["tripped"] for b in breakers),
        "events": ledger.events(limit=50),
    }


@app.get("/api/flywheel")
def flywheel_state() -> dict[str, Any]:
    # `totals()` exposes the scalar count as `event_count`; `events` is the log itself.
    return {**flywheel.totals(), "events": flywheel.events(limit=50)}


@app.get("/api/positions/settled")
def settled_positions(limit: int = 100) -> dict[str, Any]:
    with db.connect() as conn:
        rows = [
            r for r in db.positions_with_market(conn, limit=limit)
            # Filter on the POSITION's own venue: `venue` on the joined row is the
            # market's venue, so a backtest position on a real manifold market would
            # otherwise be published as a settled paper trade.
            if r.get("status") == "closed" and r.get("position_venue") != "simulated"
        ]
    wins = {"fast": 0, "slow": 0}
    counts = {"fast": 0, "slow": 0}
    pnl = {"fast": 0.0, "slow": 0.0}
    for r in rows:
        leg = r.get("leg") or "slow"
        if leg not in counts:  # unknown/legacy leg label: never blend it into a real leg
            continue
        counts[leg] += 1
        pnl[leg] += float(r.get("pnl") or 0.0)
        # Break-even (pnl == 0) settlements count in `settled` but NOT as a win, so
        # win_rate = wins/settled treats a scratch as a non-win. Both numbers are
        # published so the gap is visible rather than hidden inside the rate.
        if float(r.get("pnl") or 0.0) > 0:
            wins[leg] += 1
    return {
        "mode": "paper",
        "simulated": True,
        "notional": True,
        "positions": rows,
        "leg_performance": {
            leg: {
                "settled": counts[leg],
                "wins": wins[leg],
                "win_rate": (wins[leg] / counts[leg]) if counts[leg] else None,
                "realized_pnl_notional": round(pnl[leg], 4),
            }
            for leg in ("fast", "slow")
        },
    }


@app.get("/api/anchors")
def anchors(limit: int = 50, wallet: str | None = None) -> dict[str, Any]:
    """Full settlement log by default; pass `wallet` to show only txns you signed."""
    with db.connect() as conn:
        return {"anchors": db.recent_anchors(conn, limit=limit, wallet=wallet)}


class AnchorRecordIn(BaseModel):
    decision_id: int | None = None
    market_id: str | None = None
    kind: str
    tx_hash: str
    trace_hash: str | None = None
    usdc_amount: float | None = None
    to_address: str | None = None
    from_address: str | None = None


@app.post("/api/anchors/record")
def record_anchor_tx(body: AnchorRecordIn) -> dict[str, Any]:
    """Record a client-signed (personal-mode) Solana txn so it shows in the ledger.

    Hackathon trust model: the reported signature is stored as-is, not re-verified on
    chain. For production, fetch the tx, check it matches the trace hash / amount, and
    that it was sent from the authenticated user's pubkey before recording.
    """
    if body.kind not in ("anchor", "settle"):
        raise HTTPException(400, "kind must be 'anchor' or 'settle'")
    h = body.tx_hash  # base58 Solana signature
    explorer_url = explorer_tx_url(h)
    with db.connect() as conn:
        # `decision_id` and `market_id` are caller-supplied and FK-constrained in
        # Postgres. A stale id was silently accepted under Mongo; unchecked it now
        # raises a foreign-key violation and surfaces as a 500 on a bad request.
        if body.decision_id is not None and db.get_decision(conn, body.decision_id) is None:
            raise HTTPException(422, f"unknown decision_id {body.decision_id}")
        if body.market_id is not None and db.get_market(conn, body.market_id) is None:
            raise HTTPException(422, f"unknown market_id {body.market_id}")
        db.record_anchor(conn, {
            "decision_id": body.decision_id, "market_id": body.market_id, "kind": body.kind,
            "trace_hash": body.trace_hash, "tx_hash": h, "explorer_url": explorer_url,
            "usdc_amount": body.usdc_amount, "to_address": body.to_address or body.from_address,
            "from_address": body.from_address,  # signer → links this txn to the user's wallet
            "mocked": False,
        })
    return {
        "tx_hash": h, "explorer_url": explorer_url, "mocked": False, "kind": body.kind,
        "network": network_name(), "trace_hash": body.trace_hash, "usdc_amount": body.usdc_amount,
    }
