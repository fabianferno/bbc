from datetime import UTC, datetime, timedelta

from agent.strategy import filters


def base_market(**overrides):
    m = {
        "category": "geopolitics",
        "volume_24h": 50_000,
        "book_depth_5c": 1500,
        "last_price_yes": 0.4,
        "end_date": (datetime.now(UTC) + timedelta(days=10)).isoformat(),
    }
    m.update(overrides)
    return m


def test_passes_all_happy():
    assert filters.passes_all(base_market()).accepted


def test_rejects_low_volume():
    assert not filters.passes_all(base_market(volume_24h=100)).accepted


def test_rejects_extreme_price():
    assert not filters.passes_all(base_market(last_price_yes=0.99)).accepted
    assert not filters.passes_all(base_market(last_price_yes=0.01)).accepted


def test_rejects_short_time_to_resolution():
    short = (datetime.now(UTC) + timedelta(hours=12)).isoformat()
    assert not filters.passes_all(base_market(end_date=short)).accepted


def test_rejects_long_time_to_resolution():
    longt = (datetime.now(UTC) + timedelta(days=120)).isoformat()
    assert not filters.passes_all(base_market(end_date=longt)).accepted


def test_depth_unknown_defers_not_rejects():
    res = filters.depth_ok({"book_depth_5c": None})
    assert res.accepted


def test_category_filter_matches_substring():
    # 'world' should match 'world-events'
    m = base_market(category="world-events")
    assert filters.category_ok(m).accepted


# --- Venue-aware thresholds (prd.md §5.3) ---------------------------------
# Regression guards for the three gates that once rejected 100% of Manifold
# markets, starving the reasoning layer of every candidate.


def manifold_market(**overrides):
    """A realistic open Manifold market: mana volume, mid-horizon 2026 election."""
    m = base_market(
        venue="manifold",
        category="us-politics",
        volume_24h=430,          # mana, not USD
        book_depth_5c=None,      # Manifold has no CLOB book
        end_date=(datetime.now(UTC) + timedelta(days=118)).isoformat(),
    )
    m.update(overrides)
    return m


def test_manifold_market_passes_all_filters():
    """The end-to-end guard: a typical liquid Manifold market must reach the LLM."""
    assert filters.passes_all(manifold_market()).accepted


def test_manifold_uses_mana_volume_floor():
    assert filters.min_volume_for({"venue": "manifold"}) == filters.MIN_VOLUME_24H_MANIFOLD
    # 430 mana clears Manifold's floor but would fail the USD floor.
    assert filters.volume_ok(manifold_market(volume_24h=430)).accepted
    assert not filters.volume_ok(base_market(volume_24h=430)).accepted


def test_manifold_still_rejects_dust_volume():
    assert not filters.passes_all(manifold_market(volume_24h=0)).accepted


def test_polymarket_keeps_usd_volume_floor():
    assert filters.min_volume_for({"venue": "polymarket"}) == filters.MIN_VOLUME_24H
    assert not filters.passes_all(base_market(venue="polymarket", volume_24h=4_999)).accepted


def test_manifold_allows_longer_horizon_than_polymarket():
    far = (datetime.now(UTC) + timedelta(days=118)).isoformat()
    assert filters.passes_all(manifold_market(end_date=far)).accepted
    # Same horizon on Polymarket is still too far out.
    assert not filters.passes_all(base_market(venue="polymarket", end_date=far)).accepted


def test_manifold_horizon_still_bounded():
    beyond = (datetime.now(UTC) + timedelta(days=400)).isoformat()
    assert not filters.passes_all(manifold_market(end_date=beyond)).accepted
    too_soon = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    assert not filters.passes_all(manifold_market(end_date=too_soon)).accepted


def test_venue_topic_slugs_are_allowed_categories():
    """Manifold discovery stamps topic slugs; they must satisfy category_ok."""
    for slug in ("us-politics", "politics-default", "geopolitics", "world-default"):
        assert filters.category_ok({"category": slug}).accepted, slug
    # The venue name is NOT a category — this was the original bug.
    assert not filters.category_ok({"category": "manifold"}).accepted
