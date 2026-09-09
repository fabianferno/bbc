"""In-memory fake of the narrow PostgREST surface `agent/store/db.py` needs.

Test-only. Nothing in `agent/` may import this module.

Modeled on `supabase-py`'s sync client: `client.table(name).select(...)...execute()`
returns an object exposing `.data` (a list of dicts, or a single dict for `.single()`).

Implements exactly the operations the Mongo -> Postgres DAO rewrite (task 3 brief,
Step 1) needs, enumerated by reading every call site in `agent/store/db.py`:

    Table                Ops
    -----                ---
    markets               upsert (on_conflict="id"), select+eq(single), select+eq
                           +order+limit, select+eq+gte+lte+order+limit
    decisions              insert, select+eq(single), select+eq+order(desc)+limit,
                            select+eq(kind)+order(desc)+limit,
                            select(id)+eq+eq+order(desc)+limit,
                            select+eq+neq+order(desc)+limit(1)/single
    positions              insert, select+eq(single... via update-then-refetch),
                            update+eq, select+eq+order, select+order(desc)+limit,
                            select+eq+in_+order(desc)+limit, select+eq+like+... ,
                            select+eq+order(desc)+limit(1)/single, select+eq+eq
    orders                 insert, select+in_+order, update+eq
    llm_usage              upsert (on_conflict="day"), select+eq(single)
    breaker_state          upsert (on_conflict="name"), select+eq(single),
                            select (all), delete (all)
    market_snapshots       insert (unique violation => ignore), select+eq+lte
                            +order(desc)+limit(1)/single
    metrics                upsert (on_conflict="as_of,category"), select (all)
    blocklist               upsert (on_conflict="pattern"), select (all)
    graph_runs             upsert (on_conflict="decision_id"), select+eq(single)
    graph_nodes            delete+eq, insert, select+eq+order
    graph_edges            delete+eq, insert, select+eq+order
    trace_blobs            upsert (on_conflict="decision_id"), select+eq(single)
    onchain_anchors         insert, select+eq+order, select+eq+order(desc)+limit,
                            select(decision_id)+eq+neq
    treasury                upsert (on_conflict="id"), select+eq(single)
    treasury_events         insert, select ordered (ledger replay)
    flywheel_events         insert (unique violation on position_id => detectable),
                            select+eq(single), select (all)

The query-builder surface implemented: `table`, `select`, `insert`, `update`,
`upsert(on_conflict=...)`, `delete`, `eq`, `neq`, `in_`, `like`, `gte`, `lte`,
`order(column, desc=...)`, `limit`, `single`, `execute`.

`like` only needs to support a `'prefix%'` pattern (used by
`positions_today_pnl`'s ISO-date prefix match on `closed_at`); that is all
that is implemented.
"""

from __future__ import annotations

import copy
import fnmatch
from dataclasses import dataclass, field
from typing import Any


class PostgrestFakeError(Exception):
    """Raised in place of a real `postgrest.exceptions.APIError`."""


@dataclass
class _TableSpec:
    pk: tuple[str, ...]
    identity: bool = False  # single-column bigint identity pk
    unique: list[tuple[str, ...]] = field(default_factory=list)


# Table shapes mirror agent/store/schema.sql. Only what the DAO touches matters.
_SCHEMA: dict[str, _TableSpec] = {
    "markets": _TableSpec(pk=("id",)),
    "decisions": _TableSpec(pk=("id",), identity=True),
    "positions": _TableSpec(pk=("id",), identity=True),
    "orders": _TableSpec(pk=("id",), identity=True),
    "llm_usage": _TableSpec(pk=("day",)),
    "breaker_state": _TableSpec(pk=("name",)),
    "market_snapshots": _TableSpec(
        pk=("id",), identity=True, unique=[("market_id", "as_of")]
    ),
    "metrics": _TableSpec(pk=("id",), identity=True, unique=[("as_of", "category")]),
    "blocklist": _TableSpec(pk=("pattern",)),
    "graph_runs": _TableSpec(pk=("decision_id",)),
    "graph_nodes": _TableSpec(pk=("id",), identity=True),
    "graph_edges": _TableSpec(pk=("id",), identity=True),
    "trace_blobs": _TableSpec(pk=("decision_id",)),
    "onchain_anchors": _TableSpec(pk=("id",), identity=True),
    "treasury": _TableSpec(pk=("id",)),
    "treasury_events": _TableSpec(pk=("id",), identity=True),
    "flywheel_events": _TableSpec(pk=("id",), identity=True, unique=[("position_id",)]),
}


class _Response:
    def __init__(self, data: Any) -> None:
        self.data = data


class _Filter:
    __slots__ = ("kind", "col", "value")

    def __init__(self, kind: str, col: str, value: Any) -> None:
        self.kind = kind
        self.col = col
        self.value = value

    def matches(self, row: dict[str, Any]) -> bool:
        v = row.get(self.col)
        if self.kind == "eq":
            return v == self.value
        if self.kind == "neq":
            return v != self.value
        if self.kind == "in_":
            return v in self.value
        if self.kind == "like":
            pattern = self.value.replace("%", "*")
            return v is not None and fnmatch.fnmatch(str(v), pattern)
        if self.kind == "gte":
            return v is not None and v >= self.value
        if self.kind == "lte":
            return v is not None and v <= self.value
        raise AssertionError(f"unknown filter kind {self.kind}")


class _Query:
    """Query builder returned by `FakeClient.table(name)`."""

    def __init__(self, store: FakePostgrest, name: str) -> None:
        self._store = store
        self._name = name
        self._spec = _SCHEMA[name]
        self._filters: list[_Filter] = []
        self._order: tuple[str, bool] | None = None
        self._limit: int | None = None
        self._single = False
        self._op: str | None = None
        self._payload: Any = None
        self._on_conflict: tuple[str, ...] | None = None

    # ---- filters ----
    def eq(self, col: str, value: Any) -> _Query:
        self._filters.append(_Filter("eq", col, value))
        return self

    def neq(self, col: str, value: Any) -> _Query:
        self._filters.append(_Filter("neq", col, value))
        return self

    def in_(self, col: str, values: Any) -> _Query:
        self._filters.append(_Filter("in_", col, list(values)))
        return self

    def like(self, col: str, pattern: str) -> _Query:
        self._filters.append(_Filter("like", col, pattern))
        return self

    def gte(self, col: str, value: Any) -> _Query:
        self._filters.append(_Filter("gte", col, value))
        return self

    def lte(self, col: str, value: Any) -> _Query:
        self._filters.append(_Filter("lte", col, value))
        return self

    # ---- shaping ----
    def order(self, col: str, *, desc: bool = False) -> _Query:
        self._order = (col, desc)
        return self

    def limit(self, n: int) -> _Query:
        self._limit = n
        return self

    def single(self) -> _Query:
        self._single = True
        return self

    # ---- operations ----
    def select(self, *_cols: str) -> _Query:
        self._op = "select"
        return self

    def insert(self, payload: dict[str, Any] | list[dict[str, Any]]) -> _Query:
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload: dict[str, Any]) -> _Query:
        self._op = "update"
        self._payload = payload
        return self

    def upsert(
        self, payload: dict[str, Any] | list[dict[str, Any]], *, on_conflict: str | None = None
    ) -> _Query:
        self._op = "upsert"
        self._payload = payload
        cols = tuple(on_conflict.split(",")) if on_conflict else self._spec.pk
        self._on_conflict = cols
        return self

    def delete(self) -> _Query:
        self._op = "delete"
        return self

    # ---- execute ----
    def execute(self) -> _Response:
        rows = self._store._tables[self._name]
        if self._op == "select":
            matched = [r for r in rows if self._matches(r)]
            matched = self._shape(matched)
            data: Any = matched
            if self._single:
                if len(matched) != 1:
                    raise PostgrestFakeError(
                        f"select on {self._name!r} expected exactly one row, got {len(matched)}"
                    )
                data = matched[0]
            return _Response(copy.deepcopy(data))

        if self._op == "insert":
            payload = self._payload if isinstance(self._payload, list) else [self._payload]
            inserted = [self._store._insert_row(self._name, dict(p)) for p in payload]
            return _Response(copy.deepcopy(inserted))

        if self._op == "update":
            matched = [r for r in rows if self._matches(r)]
            for r in matched:
                r.update(self._payload)
            return _Response(copy.deepcopy(matched))

        if self._op == "upsert":
            payload = self._payload if isinstance(self._payload, list) else [self._payload]
            out = [self._store._upsert_row(self._name, dict(p), self._on_conflict) for p in payload]
            return _Response(copy.deepcopy(out))

        if self._op == "delete":
            matched = [r for r in rows if self._matches(r)]
            for r in matched:
                rows.remove(r)
            return _Response(copy.deepcopy(matched))

        raise AssertionError("no operation selected before execute()")

    def _matches(self, row: dict[str, Any]) -> bool:
        return all(f.matches(row) for f in self._filters)

    def _shape(self, matched: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if self._order is not None:
            col, desc = self._order
            matched = sorted(matched, key=lambda r: (r.get(col) is None, r.get(col)), reverse=desc)
        if self._limit is not None:
            matched = matched[: self._limit]
        return matched


class FakePostgrest:
    """Fake Supabase client: `FakePostgrest().table("markets").select(...)...execute()`."""

    def __init__(self) -> None:
        self._tables: dict[str, list[dict[str, Any]]] = {name: [] for name in _SCHEMA}
        self._next_id: dict[str, int] = {name: 1 for name in _SCHEMA}

    def table(self, name: str) -> _Query:
        if name not in self._tables:
            raise KeyError(f"fake postgrest: unknown table {name!r} (add it to _SCHEMA)")
        return _Query(self, name)

    # ---- internals ----
    def _check_unique(self, name: str, row: dict[str, Any]) -> None:
        spec = _SCHEMA[name]
        rows = self._tables[name]
        for cols in [spec.pk, *spec.unique]:
            key = tuple(row.get(c) for c in cols)
            if any(v is None for v in key):
                continue
            for existing in rows:
                if tuple(existing.get(c) for c in cols) == key:
                    raise PostgrestFakeError(
                        f"duplicate key value violates unique constraint on "
                        f"{name}{cols}: {key!r}"
                    )

    def _insert_row(self, name: str, row: dict[str, Any]) -> dict[str, Any]:
        spec = _SCHEMA[name]
        if spec.identity:
            pk_col = spec.pk[0]
            if row.get(pk_col) is None:
                row[pk_col] = self._next_id[name]
                self._next_id[name] += 1
            else:
                self._next_id[name] = max(self._next_id[name], int(row[pk_col]) + 1)
        self._check_unique(name, row)
        self._tables[name].append(row)
        return row

    def _upsert_row(
        self, name: str, row: dict[str, Any], on_conflict: tuple[str, ...]
    ) -> dict[str, Any]:
        spec = _SCHEMA[name]
        rows = self._tables[name]
        key = tuple(row.get(c) for c in on_conflict)
        for existing in rows:
            if tuple(existing.get(c) for c in on_conflict) == key:
                existing.update(row)
                return existing
        # No existing row on the conflict target: behaves like an insert.
        if spec.identity:
            pk_col = spec.pk[0]
            if row.get(pk_col) is None:
                row[pk_col] = self._next_id[name]
                self._next_id[name] += 1
            else:
                self._next_id[name] = max(self._next_id[name], int(row[pk_col]) + 1)
        self._check_unique(name, row)
        rows.append(row)
        return row
