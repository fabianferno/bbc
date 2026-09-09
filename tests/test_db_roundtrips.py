from agent.store import db


def test_market_upsert_and_get():
    with db.connect() as conn:
        mid = db.upsert_market(conn, {
            "venue": "test",
            "external_id": "m1",
            "question": "Q?",
            "category": "geopolitics",
            "end_date": "2030-01-01T00:00:00+00:00",
            "last_price_yes": 0.4,
            "volume_24h": 1234.0,
        })
        got = db.get_market(conn, mid)
    assert got and got["question"] == "Q?"
    assert got["id"] == mid
    assert got["volume_24h"] == 1234.0


def test_decision_roundtrip():
    with db.connect() as conn:
        mid = db.upsert_market(conn, {"venue": "t", "external_id": "m2", "question": "Q"})
        did = db.record_decision(conn, {
            "market_id": mid, "kind": "entry", "as_of": "2024-01-01T00:00:00+00:00",
            "prompt": "p", "search_used": [{"url": "u"}],
            "model_id": "x", "response_raw": "{}", "response_json": {"a": 1},
            "p_yes": 0.55, "confidence": 0.6, "action": "enter_yes",
            "input_tokens": 100, "output_tokens": 50, "cost_usd": 0.001,
        })
        row = db.get_decision(conn, did)
    assert isinstance(did, int)
    assert row["id"] == did
    assert row["p_yes"] == 0.55
    assert row["action"] == "enter_yes"
    assert row["cost_usd"] == 0.001


def test_decision_ids_are_sequential():
    with db.connect() as conn:
        mid = db.upsert_market(conn, {"venue": "t", "external_id": "seq", "question": "Q"})
        a = db.record_decision(conn, {
            "market_id": mid, "kind": "entry", "as_of": "x", "prompt": "p",
            "model_id": "x", "response_raw": "{}",
        })
        b = db.record_decision(conn, {
            "market_id": mid, "kind": "entry", "as_of": "x", "prompt": "p",
            "model_id": "x", "response_raw": "{}",
        })
    assert b == a + 1


def test_position_open_close():
    with db.connect() as conn:
        mid = db.upsert_market(conn, {"venue": "t", "external_id": "m3", "question": "Q"})
        pid = db.open_position(conn, {
            "market_id": mid, "venue": "t", "side": "YES",
            "shares": 10.0, "entry_price": 0.4, "notional_in": 4.0,
        })
        db.close_position(
            conn, pid, exit_price=0.55, notional_out=5.5,
            exit_decision_id=None, venue_exit_order=None,
            p_yes_at_exit=0.55, fees=0.0,
        )
        rows = db.all_positions(conn)
    row = next(r for r in rows if r["id"] == pid)
    assert row["status"] == "closed"
    assert abs(row["pnl"] - 1.5) < 1e-6


def test_llm_usage_accumulates():
    with db.connect() as conn:
        db.add_llm_usage(conn, 100, 200, 0.001)
        db.add_llm_usage(conn, 50, 60, 0.0005)
        spent = db.llm_cost_today(conn)
    assert abs(spent - 0.0015) < 1e-9


def test_blocklist_substring_match():
    with db.connect() as conn:
        db.add_blocklist(conn, "forbidden", "test")
        assert db.in_blocklist(conn, "this is a FORBIDDEN topic")
        assert not db.in_blocklist(conn, "this is fine")


def test_snapshot_at_or_before():
    with db.connect() as conn:
        mid = db.upsert_market(conn, {"venue": "t", "external_id": "snap", "question": "Q"})
        db.insert_snapshot(conn, {"market_id": mid, "as_of": "2024-01-01T00:00:00+00:00",
                                   "price_yes": 0.3})
        db.insert_snapshot(conn, {"market_id": mid, "as_of": "2024-02-01T00:00:00+00:00",
                                   "price_yes": 0.4})
        # duplicate (market_id, as_of) is ignored
        db.insert_snapshot(conn, {"market_id": mid, "as_of": "2024-01-01T00:00:00+00:00",
                                   "price_yes": 0.99})
        snap = db.snapshot_at_or_before(conn, mid, "2024-01-15T00:00:00+00:00")
    assert snap is not None
    assert abs(snap["price_yes"] - 0.3) < 1e-9


def test_graph_roundtrip():
    with db.connect() as conn:
        mid = db.upsert_market(conn, {"venue": "t", "external_id": "g", "question": "Q"})
        did = db.record_decision(conn, {
            "market_id": mid, "kind": "entry", "as_of": "x", "prompt": "p",
            "model_id": "x", "response_raw": "{}",
        })
        db.save_graph(
            conn, decision_id=did, market_id=mid, as_of="x",
            ontology={"entity_types": ["A"]}, stats={"node_count": 1},
            nodes=[{"id": "n1", "label": "N1", "type": "A"}],
            edges=[{"source": "n1", "target": "n1", "type": "REL"}],
        )
        g = db.get_graph(conn, did)
    assert g["ontology"] == {"entity_types": ["A"]}
    assert g["stats"] == {"node_count": 1}
    assert g["nodes"][0]["label"] == "N1"
    assert g["edges"][0]["type"] == "REL"


def test_trace_blob_canonical_json_round_trips_byte_identically():
    """The stored canonical JSON is the exact string that was hashed and anchored
    on-chain. Any normalisation — key reordering, whitespace collapse, a jsonb
    round-trip — breaks `/verify/<id>` for every trace already on Solana, so the
    byte-for-byte identity is asserted here rather than assumed."""
    import hashlib

    # Deliberately non-canonical spacing, non-sorted keys, unicode and escapes:
    # anything that re-serialises this string will change it.
    canonical = '{"z":1,  "a":[1,2,3],"s":"caf\\u00e9 \\"quoted\\"","n":null,"f":1.50}'
    digest = hashlib.sha256(canonical.encode()).hexdigest()

    with db.connect() as conn:
        mid = db.upsert_market(conn, {"venue": "t", "external_id": "tb", "question": "Q"})
        did = db.record_decision(conn, {
            "market_id": mid, "kind": "entry", "as_of": "x", "prompt": "p",
            "model_id": "x", "response_raw": "{}",
        })
        db.save_trace_blob(
            conn, decision_id=did, market_id=mid, trace_hash=digest,
            canonical_json=canonical,
        )
        blob = db.get_trace_blob(conn, did)

    assert blob is not None
    assert blob["canonical_json"] == canonical
    assert hashlib.sha256(blob["canonical_json"].encode()).hexdigest() == digest
    assert blob["decision_id"] == did


def test_json_text_columns_round_trip_verbatim():
    """`decisions.search_used` / `response_json` and `graph_runs.*_json` are `text`
    columns holding whatever `json.dumps` produced. Confirm the stored string is
    returned unchanged, key order included."""
    import json

    search_used = [{"url": "https://e.example", "title": "z", "published": "2026-01-01"}]
    response_json = {"z": 1, "a": 2, "nested": {"b": [1, 2]}}
    with db.connect() as conn:
        mid = db.upsert_market(conn, {"venue": "t", "external_id": "jt", "question": "Q"})
        did = db.record_decision(conn, {
            "market_id": mid, "kind": "entry", "as_of": "x", "prompt": "p",
            "model_id": "x", "response_raw": "{}",
            "search_used": search_used, "response_json": response_json,
        })
        row = db.get_decision(conn, did)
    assert row is not None
    assert row["search_used"] == json.dumps(search_used)
    assert row["response_json"] == json.dumps(response_json)
    # Key order survives: a jsonb column would have sorted these.
    assert row["response_json"].index('"z"') < row["response_json"].index('"a"')
