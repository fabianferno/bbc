"""Provider-agnostic search contract.

The load-bearing invariant is that every provider yields dated results and drops
prediction-market venue pages, since `plan_entry` feeds these straight into the
forecast prompt.
"""

from datetime import UTC, datetime, timedelta

import pytest

from agent.reasoning import search


def test_provider_registry_selects_by_name():
    assert search._PROVIDERS["exa"] is search.ExaClient


def test_unknown_provider_fails_loudly(monkeypatch):
    monkeypatch.setattr(search.settings, "search_provider", "bing", raising=False)
    monkeypatch.setattr(search, "_client_singleton", None)
    with pytest.raises(RuntimeError, match="unknown SEARCH_PROVIDER"):
        search.get_client()


def test_exa_requires_api_key(monkeypatch):
    c = search.ExaClient(api_key=None)
    monkeypatch.setattr(search.settings, "exa_api_key", None, raising=False)
    c.api_key = None
    with pytest.raises(RuntimeError, match="EXA_API_KEY"):
        c.search("q", as_of=datetime.now(UTC))


@pytest.mark.parametrize("url", [
    "https://manifold.markets/user/q",
    "https://polymarket.com/event/x",
    "https://polymarket.copilot.markets/event/x",   # mirror on another host
    "https://www.kalshi.com/markets/x",
    "https://www.metaculus.com/questions/1/",
])
def test_venue_urls_excluded(url):
    assert search.is_excluded_url(url)


@pytest.mark.parametrize("url", [
    "https://thehill.com/homenews/campaign/1",
    "https://www.natesilver.net/p/forecast",
    "https://en.wikipedia.org/wiki/Polymarket_lawsuit",  # about a venue, not a venue
])
def test_non_venue_urls_kept(url):
    assert not search.is_excluded_url(url)


def _exa_payload(results):
    return {"results": results, "costDollars": {"total": 0.01}}


def test_exa_drops_undated_and_postdated(monkeypatch):
    as_of = datetime(2026, 6, 1, tzinfo=UTC)
    rows = [
        {"url": "https://a.com/1", "title": "before", "text": "x",
         "publishedDate": "2026-05-01T00:00:00.000Z"},
        {"url": "https://b.com/2", "title": "after", "text": "x",
         "publishedDate": "2026-07-01T00:00:00.000Z"},   # post-dates as_of → leak
        {"url": "https://c.com/3", "title": "undated", "text": "x",
         "publishedDate": None},                          # undated → dropped
        {"url": "https://manifold.markets/q", "title": "venue", "text": "x",
         "publishedDate": "2026-05-02T00:00:00.000Z"},    # venue → dropped
    ]
    c = search.ExaClient(api_key="k")
    monkeypatch.setattr(c, "_post", lambda payload: _exa_payload(rows))
    hits = c.search("q", as_of=as_of)
    assert [h.url for h in hits] == ["https://a.com/1"]


def test_exa_bounds_request_at_as_of(monkeypatch):
    as_of = datetime(2026, 6, 1, tzinfo=UTC)
    seen = {}
    c = search.ExaClient(api_key="k")
    monkeypatch.setattr(c, "_post", lambda payload: seen.update(payload) or _exa_payload([]))
    c.search("q", as_of=as_of, max_results=5)
    assert seen["endPublishedDate"].startswith("2026-06-01")
    assert seen["numResults"] == 5
    assert set(search.EXCLUDED_DOMAINS) <= set(seen["excludeDomains"])


def test_exa_normalises_to_shared_hit_shape(monkeypatch):
    as_of = datetime.now(UTC)
    row = {"url": "https://a.com/1", "title": "T", "text": "BODY",
           "publishedDate": (as_of - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
           "score": 0.4}
    c = search.ExaClient(api_key="k")
    monkeypatch.setattr(c, "_post", lambda payload: _exa_payload([row]))
    (hit,) = c.search("q", as_of=as_of)
    assert (hit.title, hit.url, hit.content, hit.score) == ("T", "https://a.com/1", "BODY", 0.4)
    assert hit.to_dict()["published_date"] == row["publishedDate"]
