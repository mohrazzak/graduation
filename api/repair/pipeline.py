"""Orchestrator: one photo -> severity (Stage A) + repair cost (Stage C).

Ties the local CLIP classifier to the parametric cost model so a single image
yields a damage level and an automatic cost estimate. Repair (B) and diff (D)
are layered on once a repaired image exists for the photo.

    python -m repair.pipeline <image.jpg> [--area-m2 300]
"""

from __future__ import annotations

from dataclasses import dataclass

from predict.interface import Prediction
from repair.assess_clip import classify
from repair.cost import CostEstimate, estimate_cost

# Stated assumption when the building's size is unknown: a ~3-floor mid-rise with
# a ~100 m2 footprint. Always surface this — the cost scales linearly with it.
DEFAULT_AREA_M2 = 300.0


@dataclass
class Analysis:
    """The combined Stage A + Stage C result for one building photo."""

    prediction: Prediction
    cost: CostEstimate


def analyze(image_bytes: bytes, *, area_m2: float = DEFAULT_AREA_M2) -> Analysis:
    """Classify damage, then estimate repair cost for the given (or assumed) area."""
    prediction = classify(image_bytes)
    cost = estimate_cost(prediction.level, area_m2)
    return Analysis(prediction=prediction, cost=cost)


def _main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Severity + cost for a building photo.")
    parser.add_argument("image", help="path to the building photo")
    parser.add_argument("--area-m2", type=float, default=DEFAULT_AREA_M2)
    args = parser.parse_args()

    with open(args.image, "rb") as f:
        result = analyze(f.read(), area_m2=args.area_m2)

    p = result.prediction
    print(f"damage level : {p.level}  (confidence {p.confidence:.0%})")
    print(f"area assumed : {args.area_m2:,.0f} m²")
    print(f"repair cost  : {result.cost.summary()}")


if __name__ == "__main__":
    _main()
