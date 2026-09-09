"""Date-bounded web search behind a provider-agnostic interface.

Providers (selected by `SEARCH_PROVIDER`): `exa`.

Every provider must return a per-result publication date. `temporal_guard.filter_results`
drops undated results by default, and that default is what makes the Phase-1
`leakage-check` gate meaningful — a provider without dates would silently starve the
evidence feed rather than fail loudly.

Date filtering is applied twice: server-side where the provider supports it, and
re-verified client-side by `filter_results`. Both, because:
  - Server-side filtering can silently fail on undated content.
  - We want a single deterministic point at which leakage is enforced.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from agent.config import settings
from agent.http_retry import retry_transient
from agent.logging import get_logger
from agent.reasoning.temporal_guard import filter_results

log = get_logger(__name__)

# Prediction-market venues and aggregators. Their pages restate the market's own
# price, so feeding them back as "evidence" is circular — the agent would anchor on
# the number it is supposed to beat — and on a resolved market the page states the
# outcome outright, which is a direct backtest leak.
EXCLUDED_DOMAINS: tuple[str, ...] = (
    "manifold.markets", "polymarket.com", "kalshi.com",
    "metaculus.com", "predictit.org",
)

# Server-side domain exclusion misses mirrors and proxies that re-publish the same
# order book on another host (e.g. `polymarket.copilot.markets`), so hosts are also
# screened client-side on these tokens.
EXCLUDED_HOST_TOKENS: tuple[str, ...] = (
    "manifold", "polymarket", "kalshi", "metaculus", "predictit",
)


def is_excluded_url(url: str) -> bool:
    """True if `url`'s host belongs to a prediction-market venue, mirror included."""
    from urllib.parse import urlsplit
    host = (urlsplit(url).hostname or "").lower()
    return any(tok in host for tok in EXCLUDED_HOST_TOKENS)


@dataclass(slots=True)
class SearchHit:
    title: str
    url: str
    content: str
    published_date: str | None
    score: float | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "url": self.url,
            "content": self.content,
            "published_date": self.published_date,
            "score": self.score,
        }


class SearchProvider(Protocol):
    """What `plan_entry` requires of a search backend."""

    def search(
        self,
        query: str,
        *,
        as_of: datetime,
        max_results: int | None = ...,
        allow_undated: bool = ...,
        topic: str = ...,
    ) -> list[SearchHit]: ...

    def close(self) -> None: ...


class ExaClient:
    """Exa search. Neural/keyword-auto retrieval with native published-date bounds."""

    def __init__(self, *, api_key: str | None = None, timeout: float = 45.0) -> None:
        self.api_key = api_key or settings.exa_api_key
        self._client = httpx.Client(timeout=timeout)

    def close(self) -> None:
        self._client.close()

    @retry(
        reraise=True,
        retry=retry_transient,
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
    )
    def _post(self, payload: dict[str, Any]) -> dict[str, Any]:
        r = self._client.post(
            "https://api.exa.ai/search",
            headers={"x-api-key": self.api_key or "", "Content-Type": "application/json"},
            json=payload,
        )
        r.raise_for_status()
        return r.json()

    def search(
        self,
        query: str,
        *,
        as_of: datetime,
        max_results: int | None = None,
        allow_undated: bool = False,
        topic: str = "news",
    ) -> list[SearchHit]:
        if not self.api_key:
            raise RuntimeError("EXA_API_KEY is not configured")

        payload: dict[str, Any] = {
            "query": query,
            "numResults": max_results or settings.search_max_results,
            # Only an upper bound: `as_of` is the leakage cutoff, not a recency
            # window. Older background reporting is still useful evidence.
            "endPublishedDate": as_of.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "type": "auto",
            "excludeDomains": list(EXCLUDED_DOMAINS),
            # 600 chars is what `prompts._format_evidence` renders; fetching more
            # would cost tokens that are truncated away before reaching the model.
            "contents": {"text": {"maxCharacters": 600}},
        }
        if topic == "news":
            payload["category"] = "news"

        data = self._post(payload)
        raw = data.get("results", []) or []

        # Normalise to the shared shape before the guard runs, so leakage enforcement
        # sees the same `published_date` key regardless of provider.
        normalised = [
            {
                "title": r.get("title") or "",
                "url": r.get("url") or "",
                "content": r.get("text") or "",
                "published_date": r.get("publishedDate"),
                "score": r.get("score"),
            }
            for r in raw
        ]
        normalised = [r for r in normalised if not is_excluded_url(r["url"])]
        kept = filter_results(normalised, as_of, allow_undated=allow_undated)
        hits = [
            SearchHit(
                title=r["title"], url=r["url"], content=r["content"],
                published_date=r["published_date"], score=r["score"],
            )
            for r in kept
        ]
        log.info(
            "exa.search",
            query=query[:80],
            n_returned=len(raw),
            n_kept=len(hits),
            cost_usd=(data.get("costDollars") or {}).get("total"),
            as_of=as_of.isoformat(),
        )
        return hits


_client_singleton: SearchProvider | None = None

_PROVIDERS: dict[str, type] = {"exa": ExaClient}


def get_client() -> SearchProvider:
    global _client_singleton
    if _client_singleton is None:
        name = (settings.search_provider or "exa").lower().strip()
        try:
            cls = _PROVIDERS[name]
        except KeyError:
            raise RuntimeError(
                f"unknown SEARCH_PROVIDER={name!r}; expected one of {sorted(_PROVIDERS)}"
            ) from None
        _client_singleton = cls()
    return _client_singleton
