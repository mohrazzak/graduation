"""The tier scale, and the alphabetical-order trap it exists to prevent."""

import pytest

from predict.tiers import (
    DAMAGE_WEIGHT,
    MODEL_CLASS_ORDER,
    TIER_ORDER,
    damage_percent,
    probabilities_from_model,
    probabilities_from_names,
    top_tier,
)

# The real ResNet output for demo/damaged/partial.jpg, measured 2026-08-17.
# Alphabetical order: GC, NC, PC.
REAL_VECTOR = [0.2213, 0.1784, 0.6003]


def test_model_order_differs_from_severity_order():
    """The whole reason this module exists — if these ever match, delete it."""
    assert MODEL_CLASS_ORDER == ("GC", "NC", "PC")
    assert TIER_ORDER == ("NC", "PC", "GC")
    assert MODEL_CLASS_ORDER != TIER_ORDER


def test_probabilities_from_model_maps_alphabetically():
    probs = probabilities_from_model(REAL_VECTOR)
    assert probs == {"GC": 0.2213, "NC": 0.1784, "PC": 0.6003}


def test_probabilities_from_model_rejects_wrong_length():
    with pytest.raises(ValueError, match="3 values"):
        probabilities_from_model([0.5, 0.5])


def test_top_tier_picks_the_highest_not_the_first():
    assert top_tier(probabilities_from_model(REAL_VECTOR)) == "PC"


def test_top_tier_would_be_wrong_if_indices_were_trusted():
    """Guards the actual bug: naive argmax on a severity-ordered assumption."""
    probs = probabilities_from_model(REAL_VECTOR)
    naive = TIER_ORDER[REAL_VECTOR.index(max(REAL_VECTOR))]
    assert naive == "GC"  # what the bug would produce
    assert top_tier(probs) == "PC"  # what is correct


def test_damage_percent_is_the_weighted_expectation():
    probs = probabilities_from_model(REAL_VECTOR)
    expected = 0.2213 * 95 + 0.1784 * 15 + 0.6003 * 60
    assert damage_percent(probs) == pytest.approx(expected, abs=1e-6)


def test_damage_percent_bounds_match_the_weights():
    assert damage_percent({"NC": 1.0, "PC": 0.0, "GC": 0.0}) == pytest.approx(15.0)
    assert damage_percent({"NC": 0.0, "PC": 0.0, "GC": 1.0}) == pytest.approx(95.0)


def test_probabilities_from_names_uses_the_models_own_labels():
    """Ultralytics reports names; trust those over positional assumptions."""
    names = {0: "GC", 1: "NC", 2: "PC"}
    assert probabilities_from_names(names, [0.1, 0.7, 0.2]) == {
        "GC": 0.1,
        "NC": 0.7,
        "PC": 0.2,
    }


def test_probabilities_from_names_survives_a_reordered_retrain():
    """A retrain that shuffles class order must not shuffle the probabilities."""
    names = {0: "NC", 1: "PC", 2: "GC"}
    assert probabilities_from_names(names, [0.7, 0.2, 0.1]) == {
        "NC": 0.7,
        "PC": 0.2,
        "GC": 0.1,
    }


def test_probabilities_from_names_rejects_a_missing_tier():
    """The old binary model reported only GC and PC — refuse it here."""
    with pytest.raises(ValueError, match="NC"):
        probabilities_from_names({0: "GC", 1: "PC"}, [0.4, 0.6])


def test_weights_cover_every_tier():
    assert set(DAMAGE_WEIGHT) == set(TIER_ORDER)
