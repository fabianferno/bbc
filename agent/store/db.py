"""Supabase/Postgres DAO. Thin wrapper around PostgREST with typed dict rows.

Public functions keep their SQLite/Mongo-era signatures and return shapes.
Integer record ids are issued by Postgres identity columns (the old `counters`
collection and `next_id()` are gone); inserts ask PostgREST for the created row
and read the generated id back off it. JSON-text columns are stored verbatim as
strings — every JSON column in `schema.sql` is `text`, never `jsonb` — so API
payloads and on-chain trace hashes stay byte-identical.

Query-operator mapping from the Mongo original: `$ne` -> `.neq`, `$in` ->
`.in_`, a `^prefix` `$regex` -> `.like('prefix%')`, `$set` -> `.update`, a Mongo
upsert -> `.upsert(on_conflict=...)`, `find_one` -> `.limit(1)` + first-or-None.
The one deliberate exception is `$ne: None`: `col <> NULL` is NULL in Postgres,
which would drop EVERY row, so null-exclusion is done in Python instead (see
`_not_null`).
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any

from agent.store import supabase_client

# Module-level client handle. Tests monkeypatch this with the in-memory
# PostgREST fake (`tests/fakes/postgrest.py`).
_client: Any | None = None


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def get_client() -> Any:
    global _client
    if _client is None:
        _client = supabase_client.get_client()
    return _client


@contextmanager
def connect() -> Iterator[Any]:
    """Yield the shared Supabase client. The client is pooled, not closed."""
    yield get_client()


def init_db() -> None:
    """Readiness check. The schema itself is owned by `agent/store/schema.sql`,
    applied once by the operator in the Supabase SQL editor — a publishable key
    cannot run DDL. This is a cheap connectivity probe so `python -m agent
    init-db` and the API startup still fail loudly on a misconfigured store."""
    get_client().table("markets").select("id").limit(1).execute()


def _rows(res: Any) -> list[dict[str, Any]]:
    """`.data` of a PostgREST response, always as a list."""
    data = res.data
    if data is None:
        return []
    return data if isinstance(data, list) else [data]


def _first(res: Any) -> dict[str, Any] | None:
    """`find_one` equivalent: the first row of a response, or None."""
    rows = _rows(res)
    return rows[0] if rows else None


def _not_null(rows: list[dict[str, Any]], col: str) -> list[dict[str, Any]]:
    """Mongo's `{col: {"$ne": None}}`, applied client-side.

    NOT `.neq(col, None)`: PostgREST renders that as `col <> null`, which
    evaluates to NULL for every row and therefore returns nothing at all. The
    in-memory fake's Python `!=` would happily pass such a filter, so this would
    be a green-tests / empty-production bug. Filtering here is correct against
    both.
    """
    return [r for r in rows if r.get(col) is not None]


def _row(doc: dict[str, Any], id_field: str = "id") -> dict[str, Any]:
    """Row-shape normaliser, retained from the Mongo DAO.

    It used to map `_id` -> `id_field`. Postgres columns are already named
    (`markets.id`, `breaker_state.name`, `trace_blobs.decision_id`, ...), so
    this is now a defensive copy plus a no-op rename. Kept so every call site
    and return shape stays identical.
    """
    doc = dict(doc)
    if "_id" in doc:
        doc[id_field] = doc.pop("_id")
    return doc


def _opt(doc: dict[str, Any] | None, id_field: str = "id") -> dict[str, Any] | None:
    """`_row` for a possibly-missing single-row read."""
    return _row(doc, id_field) if doc is not None else None


# ---------- markets ----------

def upsert_market(conn: Any, m: dict[str, Any]) -> str:
    """Upsert market row. `m` must include venue, external_id, question."""
    market_id = m.get("id") or f"{m['venue']}:{m['external_id']}"
    now = _now()
    fields = {
        "question": m["question"],
        "category": m.get("category"),
        "resolution_source": m.get("resolution_source"),
        "resolution_rules": m.get("resolution_rules"),
        "yes_token_id": m.get("yes_token_id"),
        "no_token_id": m.get("no_token_id"),
        "end_date": m.get("end_date"),
        "closed_time": m.get("closed_time"),
        "resolved": 1 if m.get("resolved") else 0,
        "resolution_value": m.get("resolution_value"),
        "last_price_yes": m.get("last_price_yes"),
        "volume_24h": m.get("volume_24h"),
        "book_depth_5c": m.get("book_depth_5c"),
        "updated_at": now,
        "raw": json.dumps(m.get("raw")) if m.get("raw") else None,
    }
    # Read-then-write rather than a blind `.upsert`: the Mongo original used
    # `$setOnInsert` for venue/external_id/seen_at, and an upsert that merged
    # them on every write would keep resetting `seen_at` to now.
    exists = _first(conn.table("markets").select("id").eq("id", market_id).limit(1).execute())
    if exists is not None:
        conn.table("markets").update(fields).eq("id", market_id).execute()
    else:
        conn.table("markets").insert({
            "id": market_id,
            "venue": m["venue"],
            "external_id": m["external_id"],
            "seen_at": now,
            **fields,
        }).execute()
    return market_id


def get_market(conn: Any, market_id: str) -> dict[str, Any] | None:
    return _opt(_first(conn.table("markets").select("*").eq("id", market_id).limit(1).execute()))


def list_resolved_markets(
    conn: Any, *, category: str | None = None, limit: int | None = None
) -> list[dict[str, Any]]:
    q = conn.table("markets").select("*").eq("resolved", 1)
    if category:
        q = q.eq("category", category)
    rows = _not_null(_rows(q.order("end_date", desc=True).execute()), "resolution_value")
    # Limit is applied AFTER the null filter, matching the Mongo cursor order.
    if limit:
        rows = rows[:limit]
    return [_row(r) for r in rows]


def list_open_markets(conn: Any, limit: int) -> list[dict[str, Any]]:
    res = (
        conn.table("markets").select("*").eq("resolved", 0)
        .order("volume_24h", desc=True).limit(limit).execute()
    )
    return [_row(r) for r in _rows(res)]


def list_tradeable_markets(conn: Any, limit: int) -> list[dict[str, Any]]:
    res = (
        conn.table("markets").select("*")
        .eq("resolved", 0)
        .gte("last_price_yes", 0.05)
        .lte("last_price_yes", 0.95)
        .order("volume_24h", desc=True)
        .limit(limit)
        .execute()
    )
    return [_row(r) for r in _rows(res)]


# ---------- decisions ----------

def record_decision(conn: Any, d: dict[str, Any]) -> int:
    res = conn.table("decisions").insert({
        "market_id": d["market_id"],
        "kind": d["kind"],
        "as_of": d["as_of"],
        "prompt": d["prompt"],
        "search_used": json.dumps(d["search_used"]) if d.get("search_used") is not None else None,
        "model_id": d["model_id"],
        "response_raw": d["response_raw"],
        "response_json": json.dumps(d["response_json"]) if d.get("response_json") is not None else None,
        "p_yes": d.get("p_yes"),
        "confidence": d.get("confidence"),
        "action": d.get("action"),
        "input_tokens": d.get("input_tokens", 0),
        "output_tokens": d.get("output_tokens", 0),
        "cost_usd": d.get("cost_usd", 0.0),
        "created_at": _now(),
    }).execute()
    row = _first(res)
    assert row is not None  # an insert always returns its representation
    return int(row["id"])


def get_decision(conn: Any, decision_id: int) -> dict[str, Any] | None:
    return _opt(_first(conn.table("decisions").select("*").eq("id", decision_id).limit(1).execute()))


def recent_decisions(
    conn: Any, *, kind: str | None = None, limit: int = 50
) -> list[dict[str, Any]]:
    q = conn.table("decisions").select("*")
    if kind:
        q = q.eq("kind", kind)
    return [_row(r) for r in _rows(q.order("id", desc=True).limit(limit).execute())]


def latest_graph_decision_id(conn: Any, market_id: str) -> int | None:
    """Newest entry decision for `market_id` that actually has a stored graph.

    The most recent decision is not necessarily the most useful one to show: a run
    where search returned nothing produces a decision with no graph_run. Walk back
    until one with a graph is found so the UI hydrates a populated board rather
    than an empty one.
    """
    res = (
        conn.table("decisions").select("id")
        .eq("market_id", market_id).eq("kind", "entry")
        .order("id", desc=True).limit(25).execute()
    )
    for row in _rows(res):
        run = _first(
            conn.table("graph_runs").select("decision_id")
            .eq("decision_id", row["id"]).limit(1).execute()
        )
        if run is not None:
            return int(row["id"])
    return None


def latest_prior_p_yes(conn: Any, market_id: str) -> float | None:
    res = (
        conn.table("decisions").select("*")
        .eq("market_id", market_id).order("id", desc=True).execute()
    )
    rows = _not_null(_rows(res), "p_yes")
    return float(rows[0]["p_yes"]) if rows else None


# ---------- positions ----------

def open_position(conn: Any, p: dict[str, Any]) -> int:
    res = conn.table("positions").insert({
        "market_id": p["market_id"],
        "venue": p["venue"],
        "leg": p.get("leg") or "slow",
        "side": p["side"],
        "shares": p["shares"],
        "entry_price": p["entry_price"],
        "exit_price": None,
        "notional_in": p["notional_in"],
        "notional_in_original": p["notional_in"],
        "notional_out": None,
        "pnl": None,
        "fees": 0.0,
        "status": "open",
        "entry_decision_id": p.get("entry_decision_id"),
        "exit_decision_id": None,
        "venue_entry_order": p.get("venue_entry_order"),
        "venue_exit_order": None,
        "p_yes_at_entry": p.get("p_yes_at_entry"),
        "p_yes_at_exit": None,
        "opened_at": _now(),
        "closed_at": None,
    }).execute()
    row = _first(res)
    assert row is not None  # an insert always returns its representation
    pid = int(row["id"])
    if p["venue"] != "simulated":
        from agent.treasury import ledger  # local import: ledger imports db
        ledger.record("entry", -float(p["notional_in"]), position_id=pid, leg=p.get("leg") or "slow")
    return pid


def close_position(
    conn: Any,
    pos_id: int,
    *,
    exit_price: float,
    notional_out: float,
    exit_decision_id: int | None,
    venue_exit_order: str | None,
    p_yes_at_exit: float | None,
    fees: float = 0.0,
    shares_closed: float | None = None,
) -> None:
    pos = _first(conn.table("positions").select("*").eq("id", pos_id).limit(1).execute())
    if pos is None:
        return

    is_partial = shares_closed is not None and shares_closed < float(pos["shares"]) - 1e-9

    if is_partial:
        assert shares_closed is not None
        fraction = shares_closed / float(pos["shares"])
        closed_notional_in = float(pos["notional_in"]) * fraction
        slice_pnl = notional_out - closed_notional_in - fees
        new_fees = float(pos.get("fees") or 0.0) + fees
        new_pnl = float(pos.get("pnl") or 0.0) + slice_pnl
        new_notional_out = float(pos.get("notional_out") or 0.0) + notional_out
        conn.table("positions").update({
            "shares": float(pos["shares"]) - shares_closed,
            "notional_in": float(pos["notional_in"]) - closed_notional_in,
            "exit_price": exit_price,
            "notional_out": new_notional_out,
            "pnl": new_pnl,
            "fees": new_fees,
            "status": "open",
            "exit_decision_id": exit_decision_id,
            "venue_exit_order": venue_exit_order,
            "p_yes_at_exit": p_yes_at_exit,
        }).eq("id", pos_id).execute()
    else:
        # Terminal branch: covers both a genuine one-shot full close (no prior
        # partials — accumulators are at their defaults, so this reduces to the
        # original behaviour) and the final slice of a multi-partial sequence.
        # Recompute pnl from the ORIGINAL total cost basis and the TOTAL proceeds
        # across every slice, rather than accumulating slice-by-slice, so a
        # multi-step exit's stored pnl always equals total proceeds minus total
        # original cost basis minus total fees — the same invariant
        # `db.positions_today_pnl` / the daily-loss breaker rely on.
        original_notional_in = float(pos.get("notional_in_original") or pos["notional_in"])
        new_fees = float(pos.get("fees") or 0.0) + fees
        total_notional_out = float(pos.get("notional_out") or 0.0) + notional_out
        pnl = total_notional_out - original_notional_in - new_fees
        conn.table("positions").update({
            "exit_price": exit_price,
            "notional_in": original_notional_in,
            "notional_out": total_notional_out,
            "pnl": pnl,
            "fees": new_fees,
            "status": "closed",
            "exit_decision_id": exit_decision_id,
            "venue_exit_order": venue_exit_order,
            "p_yes_at_exit": p_yes_at_exit,
            "closed_at": _now(),
        }).eq("id", pos_id).execute()
    if pos.get("venue") != "simulated":
        from agent.treasury import flywheel, ledger
        # A profitable terminal close settles in TWO ledger writes: the full proceeds,
        # then the flywheel outflow. Suppress the HWM refresh on the first so the mark
        # is never pinned to the intermediate equity the book holds only between them,
        # and refresh once at the end — after the flywheel, whether or not it wrote
        # anything (it is idempotent per position and can no-op on a replay).
        will_flywheel = (not is_partial) and pnl > 0
        ledger.record(
            "settlement", float(notional_out), position_id=pos_id, leg=pos.get("leg") or "slow",
            refresh_hwm=not will_flywheel,
        )
        if will_flywheel:
            flywheel.on_settlement(pos_id, pnl)
            ledger.refresh_high_water_mark()


def open_positions(conn: Any) -> list[dict[str, Any]]:
    res = conn.table("positions").select("*").eq("status", "open").order("opened_at").execute()
    return [_row(r) for r in _rows(res)]


def all_positions(conn: Any, limit: int = 200) -> list[dict[str, Any]]:
    res = conn.table("positions").select("*").order("id", desc=True).limit(limit).execute()
    return [_row(r) for r in _rows(res)]


def positions_with_market(
    conn: Any, limit: int = 200, wallet: str | None = None
) -> list[dict[str, Any]]:
    """Positions newest-first, each enriched with its market `question` and `venue`.

    `venue` is the MARKET's venue (matching the old LEFT JOIN), which erases the
    position's own `venue="simulated"` backtest marker. The raw position venue is
    preserved as `position_venue` — filter on THAT to exclude backtest rows.

    `wallet` restricts to positions whose entry decision was anchored on-chain from
    that address (personal mode); omitted → the full shared agent record.
    """
    q = conn.table("positions").select("*")
    if wallet:
        q = q.in_("entry_decision_id", decision_ids_for_wallet(conn, wallet))
    rows = [_row(r) for r in _rows(q.order("id", desc=True).limit(limit).execute())]
    ids = list({r["market_id"] for r in rows})
    markets: dict[Any, dict[str, Any]] = {}
    if ids:
        markets = {
            m["id"]: m
            for m in _rows(conn.table("markets").select("*").in_("id", ids).execute())
        }
    for r in rows:
        m = markets.get(r["market_id"])
        r["question"] = m["question"] if m else None
        r["position_venue"] = r.get("venue")  # raw position venue; "simulated" == backtest
        r["venue"] = m["venue"] if m else r.get("venue")  # market venue overrides (matches old LEFT JOIN)
    return rows


def positions_today_pnl(conn: Any) -> float:
    today = datetime.now(UTC).date().isoformat()
    res = (
        conn.table("positions").select("*")
        .eq("status", "closed").like("closed_at", f"{today}%").execute()
    )
    return float(sum(float(r.get("pnl") or 0.0) for r in _rows(res)))


def latest_open_position_for_market(conn: Any, market_id: str) -> dict[str, Any] | None:
    res = (
        conn.table("positions").select("*")
        .eq("market_id", market_id).eq("status", "open")
        .order("id", desc=True).limit(1).execute()
    )
    return _opt(_first(res))


def simulated_closed_pnl(conn: Any) -> list[dict[str, Any]]:
    res = (
        conn.table("positions").select("*")
        .eq("venue", "simulated").eq("status", "closed").execute()
    )
    return [{"pnl": r.get("pnl"), "notional_in": r.get("notional_in")} for r in _rows(res)]


# ---------- orders ----------

def record_order(conn: Any, o: dict[str, Any]) -> int:
    res = conn.table("orders").insert({
        "market_id": o["market_id"],
        "venue": o["venue"],
        "venue_order_id": o.get("venue_order_id"),
        "side": o["side"],
        "order_type": o["order_type"],
        "limit_price": o["limit_price"],
        "requested_size": o["requested_size"],
        "filled_size": 0.0,
        "status": o.get("status", "open"),
        "decision_id": o.get("decision_id"),
        "created_at": _now(),
        "expires_at": o["expires_at"],
        "closed_at": None,
    }).execute()
    row = _first(res)
    assert row is not None  # an insert always returns its representation
    return int(row["id"])


def open_orders(conn: Any) -> list[dict[str, Any]]:
    res = (
        conn.table("orders").select("*")
        .in_("status", ["open", "partial"]).order("created_at").execute()
    )
    return [_row(r) for r in _rows(res)]


def update_order(conn: Any, order_id: int, **fields: Any) -> None:
    if not fields:
        return
    conn.table("orders").update(fields).eq("id", order_id).execute()


# ---------- llm budget ----------

def add_llm_usage(conn: Any, input_tokens: int, output_tokens: int, cost: float) -> None:
    day = datetime.now(UTC).date().isoformat()
    # Read-modify-write emulation of Mongo's `$inc`. PostgREST has no atomic
    # increment; a concurrent second writer could lose an update here. The agent
    # is single-process, and this counter is a budget guard rather than a ledger,
    # so the exposure is bounded.
    cur = _first(conn.table("llm_usage").select("*").eq("day", day).limit(1).execute()) or {}
    conn.table("llm_usage").upsert({
        "day": day,
        "input_tokens": int(cur.get("input_tokens") or 0) + input_tokens,
        "output_tokens": int(cur.get("output_tokens") or 0) + output_tokens,
        "cost_usd": float(cur.get("cost_usd") or 0.0) + cost,
    }, on_conflict="day").execute()


def llm_cost_today(conn: Any) -> float:
    day = datetime.now(UTC).date().isoformat()
    row = _first(conn.table("llm_usage").select("*").eq("day", day).limit(1).execute())
    return float(row["cost_usd"]) if row else 0.0


# ---------- breakers ----------

def set_breaker(conn: Any, name: str, *, tripped: bool, reason: str | None = None,
                expires_at: str | None = None) -> None:
    conn.table("breaker_state").upsert({
        "name": name,
        "tripped": bool(tripped),
        "tripped_at": _now() if tripped else None,
        "expires_at": expires_at,
        "reason": reason,
    }, on_conflict="name").execute()


def breaker_status(conn: Any, name: str) -> dict[str, Any] | None:
    return _opt(
        _first(conn.table("breaker_state").select("*").eq("name", name).limit(1).execute()),
        "name",
    )


def all_breakers(conn: Any) -> list[dict[str, Any]]:
    return [_row(r, "name") for r in _rows(conn.table("breaker_state").select("*").execute())]


def clear_breakers(conn: Any) -> None:
    # PostgREST refuses an unfiltered DELETE, so match every real row by name.
    conn.table("breaker_state").delete().neq("name", "").execute()


# ---------- snapshots ----------

def insert_snapshot(conn: Any, s: dict[str, Any]) -> None:
    """INSERT-OR-IGNORE on (market_id, as_of)."""
    def _existing() -> dict[str, Any] | None:
        return _first(
            conn.table("market_snapshots").select("id")
            .eq("market_id", s["market_id"]).eq("as_of", s["as_of"]).limit(1).execute()
        )

    if _existing() is not None:
        return
    try:
        conn.table("market_snapshots").insert({
            "market_id": s["market_id"],
            "as_of": s["as_of"],
            "price_yes": s["price_yes"],
            "book_depth_5c": s.get("book_depth_5c"),
            "volume_24h": s.get("volume_24h"),
            "raw": json.dumps(s.get("raw")) if s.get("raw") else None,
        }).execute()
    except Exception:
        # Swallow ONLY a lost race on the unique (market_id, as_of) index —
        # anything else is a real failure and must surface.
        if _existing() is None:
            raise


def snapshot_at_or_before(
    conn: Any, market_id: str, as_of: str
) -> dict[str, Any] | None:
    res = (
        conn.table("market_snapshots").select("*")
        .eq("market_id", market_id).lte("as_of", as_of)
        .order("as_of", desc=True).limit(1).execute()
    )
    return _opt(_first(res))


# ---------- metrics ----------

def upsert_metrics(conn: Any, m: dict[str, Any]) -> None:
    conn.table("metrics").upsert({
        "as_of": m["as_of"],
        "category": m["category"],
        "n_resolved": m["n_resolved"],
        "brier": m.get("brier"),
        "ece": m.get("ece"),
        "realized_pnl": m.get("realized_pnl", 0.0),
        "realized_roi": m.get("realized_roi"),
        "calibration_mul": m.get("calibration_mul", 0.5),
    }, on_conflict="as_of,category").execute()


def _latest_metrics_rows(conn: Any) -> list[dict[str, Any]]:
    """Latest metrics row per category (max as_of), like the SQL correlated subquery."""
    by_cat: dict[str, dict[str, Any]] = {}
    for r in _rows(conn.table("metrics").select("*").execute()):
        cat = r["category"]
        if cat not in by_cat or r["as_of"] > by_cat[cat]["as_of"]:
            by_cat[cat] = r
    return list(by_cat.values())


def latest_calibration_multipliers(conn: Any) -> dict[str, float]:
    return {r["category"]: float(r["calibration_mul"]) for r in _latest_metrics_rows(conn)}


def latest_metrics(conn: Any) -> list[dict[str, Any]]:
    rows = sorted(_latest_metrics_rows(conn), key=lambda r: r["category"])
    return [_row(r) for r in rows]


# ---------- blocklist ----------

def add_blocklist(conn: Any, pattern: str, reason: str = "") -> None:
    conn.table("blocklist").upsert({
        "pattern": pattern,
        "reason": reason,
        "added_at": _now(),
    }, on_conflict="pattern").execute()


def in_blocklist(conn: Any, question: str) -> bool:
    q = question.lower()
    return any(
        r["pattern"].lower() in q
        for r in _rows(conn.table("blocklist").select("*").execute())
    )


# ---------- graphrag ----------

def save_graph(
    conn: Any,
    *,
    decision_id: int,
    market_id: str,
    as_of: str,
    ontology: dict[str, Any],
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    stats: dict[str, Any],
) -> None:
    """Persist an ontology + extracted graph for one entry decision (idempotent)."""
    now = _now()
    conn.table("graph_nodes").delete().eq("decision_id", decision_id).execute()
    conn.table("graph_edges").delete().eq("decision_id", decision_id).execute()
    conn.table("graph_runs").upsert({
        "decision_id": decision_id,
        "market_id": market_id,
        # Verbatim JSON strings: `schema.sql` types these `text`, never `jsonb`,
        # so the anchored trace hash stays byte-identical on round-trip.
        "as_of": as_of,
        "ontology_json": json.dumps(ontology),
        "stats_json": json.dumps(stats),
        "created_at": now,
    }, on_conflict="decision_id").execute()
    if nodes:
        conn.table("graph_nodes").insert([{
            "decision_id": decision_id, "market_id": market_id,
            "node_key": n["id"], "label": n["label"], "type": n["type"],
            "summary": n.get("summary"), "source_url": n.get("source_url"),
            "published_date": n.get("published_date"), "degree": int(n.get("degree", 0)),
            "created_at": now,
        } for n in nodes]).execute()
    if edges:
        conn.table("graph_edges").insert([{
            "decision_id": decision_id, "market_id": market_id,
            "source_key": e["source"], "target_key": e["target"], "type": e["type"],
            "rationale": e.get("rationale"), "source_url": e.get("source_url"),
            "published_date": e.get("published_date"), "created_at": now,
        } for e in edges]).execute()


def get_graph(conn: Any, decision_id: int) -> dict[str, Any] | None:
    run = _first(
        conn.table("graph_runs").select("*").eq("decision_id", decision_id).limit(1).execute()
    )
    if not run:
        return None
    nodes = [_row(r) for r in _rows(
        conn.table("graph_nodes").select("*").eq("decision_id", decision_id).order("id").execute()
    )]
    edges = [_row(r) for r in _rows(
        conn.table("graph_edges").select("*").eq("decision_id", decision_id).order("id").execute()
    )]
    return {
        "decision_id": decision_id,
        "ontology": json.loads(run["ontology_json"]),
        "stats": json.loads(run["stats_json"]),
        "nodes": nodes,
        "edges": edges,
        "as_of": run["as_of"],
    }


# ---------- reasoning-trace blobs ----------

def save_trace_blob(
    conn: Any,
    *,
    decision_id: int,
    market_id: str,
    trace_hash: str,
    canonical_json: str,
) -> None:
    # `canonical_json` is stored verbatim in a `text` column. It is the exact
    # string that was hashed and anchored on Solana; ANY normalisation (jsonb,
    # re-serialisation, whitespace) breaks `/verify/<id>` for every trace
    # already on-chain.
    conn.table("trace_blobs").upsert({
        "decision_id": decision_id,
        "market_id": market_id,
        "trace_hash": trace_hash,
        "canonical_json": canonical_json,
        "created_at": _now(),
    }, on_conflict="decision_id").execute()


def get_trace_blob(conn: Any, decision_id: int) -> dict[str, Any] | None:
    res = (
        conn.table("trace_blobs").select("*")
        .eq("decision_id", decision_id).limit(1).execute()
    )
    return _opt(_first(res), "decision_id")


# ---------- on-chain anchors ----------

def record_anchor(conn: Any, a: dict[str, Any]) -> int:
    res = conn.table("onchain_anchors").insert({
        "decision_id": a.get("decision_id"),
        "market_id": a.get("market_id"),
        "kind": a["kind"],
        "trace_hash": a.get("trace_hash"),
        "tx_hash": a["tx_hash"],
        "explorer_url": a.get("explorer_url"),
        "usdc_amount": a.get("usdc_amount"),
        "to_address": a.get("to_address"),
        # signer of a personal-mode txn (lowercased for case-insensitive matching);
        # null for demo-mode txns signed by the server wallet.
        "from_address": (a.get("from_address") or "").lower() or None,
        "network": a.get("network", "arc-testnet"),
        "mocked": 1 if a.get("mocked") else 0,
        "created_at": _now(),
    }).execute()
    row = _first(res)
    assert row is not None  # an insert always returns its representation
    return int(row["id"])


def anchors_for_decision(conn: Any, decision_id: int) -> list[dict[str, Any]]:
    res = (
        conn.table("onchain_anchors").select("*")
        .eq("decision_id", decision_id).order("id").execute()
    )
    return [_row(r) for r in _rows(res)]


def recent_anchors(
    conn: Any, limit: int = 50, wallet: str | None = None
) -> list[dict[str, Any]]:
    """Newest-first anchors. `wallet` restricts to txns signed from that address
    (personal mode); omitted → the full shared ledger."""
    q = conn.table("onchain_anchors").select("*")
    if wallet:
        q = q.eq("from_address", wallet.lower())
    return [_row(r) for r in _rows(q.order("id", desc=True).limit(limit).execute())]


def decision_ids_for_wallet(conn: Any, wallet: str) -> list[int]:
    """Distinct decision ids whose on-chain txns were signed from `wallet`."""
    res = (
        conn.table("onchain_anchors").select("decision_id")
        .eq("from_address", wallet.lower()).execute()
    )
    seen: list[int] = []
    for r in _not_null(_rows(res), "decision_id"):
        did = int(r["decision_id"])
        if did not in seen:
            seen.append(did)
    return seen
