"""The three-tier damage scale (PHI-Net Task 5, Collapse Mode).

The single source of truth for the scale, and — more importantly — the only
place that knows models emit classes in ALPHABETICAL order while the product
reasons in SEVERITY order. Converting at this boundary and passing tier codes
everywhere above it makes the mislabeling bug impossible to write.

NC is "non-collapse", NOT "intact": PHI-Net defines it as "intact or minor
damage, structure remains". Never label it as undamaged.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Literal, get_args

TierCode = Literal["NC", "PC", "GC"]

# Severity order. Everything user-facing iterates this.
TIER_ORDER: tuple[TierCode, ...] = get_args(TierCode)

# The order Keras and Ultralytics emit classes in: alphabetical, not severity.
# This constant is the trap, isolated so it can only be misread in one file.
MODEL_CLASS_ORDER: tuple[TierCode, ...] = ("GC", "NC", "PC")

# Damage-percentage weights (PHI-Net prototype formula). A weighted expectation
# over class probabilities — a planning signal, never a measured quantity.
DAMAGE_WEIGHT: dict[TierCode, float] = {"NC": 15.0, "PC": 60.0, "GC": 95.0}


def probabilities_from_model(vector: Sequence[float]) -> dict[TierCode, float]:
    """Map an alphabetically-ordered model output onto tier codes.

    Args:
        vector: softmax output in MODEL_CLASS_ORDER (GC, NC, PC).

    Returns:
        Probability per tier code.

    Raises:
        ValueError: if the vector is not exactly three values.
    """
    if len(vector) != len(MODEL_CLASS_ORDER):
        raise ValueError(
            f"expected 3 values in {MODEL_CLASS_ORDER} order, got {len(vector)}"
        )
    return {
        code: float(value)
        for code, value in zip(MODEL_CLASS_ORDER, vector, strict=True)
    }


def probabilities_from_names(
    names: Mapping[int, str], vector: Sequence[float]
) -> dict[TierCode, float]:
    """Map a model output using the model's OWN class-name table.

    Preferred over positional mapping whenever the framework reports names
    (Ultralytics does), because it survives a retrain that reorders classes.

    Args:
        names: the model's index -> class-name mapping.
        vector: per-class scores, indexed the same way.

    Returns:
        Probability per tier code.

    Raises:
        ValueError: if the model does not cover all three tiers.
    """
    by_code = {
        str(names[index]).upper(): float(value)
        for index, value in enumerate(vector)
        if index in names
    }
    missing = [code for code in TIER_ORDER if code not in by_code]
    if missing:
        raise ValueError(
            f"model does not emit tier(s) {', '.join(missing)}; "
            f"it reports classes {sorted(by_code)}"
        )
    return {code: by_code[code] for code in MODEL_CLASS_ORDER}


def top_tier(probabilities: Mapping[TierCode, float]) -> TierCode:
    """Return the most probable tier."""
    return max(TIER_ORDER, key=lambda code: probabilities[code])


def damage_percent(probabilities: Mapping[TierCode, float]) -> float:
    """Weighted-expectation damage percentage in 0..100."""
    return sum(probabilities[code] * DAMAGE_WEIGHT[code] for code in TIER_ORDER)
