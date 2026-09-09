from datetime import UTC, datetime

from agent.reasoning import prompts


def test_validate_entry_happy():
    parsed = {
        "p_yes": 0.6, "confidence": 0.7, "rationale": "x",
        "key_signals": ["a", "b"], "edge_vs_market": 0.1,
        "recommended_action": "enter_yes",
    }
    out = prompts.validate_entry(parsed)
    assert out is not None
    assert out["recommended_action"] == "enter_yes"
    assert out["p_yes"] == 0.6


def test_validate_entry_rejects_bad_action():
    parsed = {"p_yes": 0.6, "confidence": 0.7, "edge_vs_market": 0.1,
              "recommended_action": "buy_lots"}
    assert prompts.validate_entry(parsed) is None


def test_validate_entry_rejects_out_of_range():
    parsed = {"p_yes": 1.4, "confidence": 0.7, "edge_vs_market": 0.1,
              "recommended_action": "enter_yes"}
    assert prompts.validate_entry(parsed) is None


def test_validate_ambiguity_strict_about_boolean():
    assert prompts.validate_ambiguity({"unambiguous": "yes"}) is None
    assert prompts.validate_ambiguity({"unambiguous": True, "rationale": "ok"}) is not None


def test_build_entry_prompt_contains_as_of_and_market_price():
    p = prompts.build_entry_prompt(
        {"question": "Will X happen?", "category": "geopolitics",
         "end_date": "2030-01-01", "resolution_rules": None},
        as_of=datetime(2024, 1, 1, tzinfo=UTC),
        market_price_yes=0.42,
        search_results=[],
    )
    assert "2024-01-01" in p
    assert "0.420" in p
    assert "Will X happen?" in p


def test_validate_entry_accepts_intended_hold_hours():
    from agent.reasoning import prompts

    out = prompts.validate_entry({
        "p_yes": 0.7, "confidence": 0.6, "edge_vs_market": 0.2,
        "recommended_action": "enter_yes", "rationale": "x",
        "intended_hold_hours": 12,
    })
    assert out is not None
    assert out["intended_hold_hours"] == 12.0


def test_validate_entry_tolerates_missing_intended_hold_hours():
    from agent.reasoning import prompts

    out = prompts.validate_entry({
        "p_yes": 0.7, "confidence": 0.6, "edge_vs_market": 0.2,
        "recommended_action": "enter_yes", "rationale": "x",
    })
    assert out is not None
    assert out["intended_hold_hours"] is None


def test_entry_prompt_requests_intended_hold_hours():
    from datetime import UTC, datetime

    from agent.reasoning import prompts

    p = prompts.build_entry_prompt(
        {"question": "q", "category": "politics", "end_date": None, "resolution_rules": None},
        as_of=datetime(2026, 1, 1, tzinfo=UTC), market_price_yes=0.5, search_results=[],
    )
    assert "intended_hold_hours" in p
