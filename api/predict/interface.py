"""The prediction seam: one Prediction shape, many interchangeable backends."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

from predict.tiers import TierCode


@dataclass(frozen=True)
class Prediction:
    """A framework-agnostic classification result, in tier codes only.

    Carries no numeric class index by design — see predict/tiers.py for why.
    """

    tier: TierCode
    confidence: float
    probabilities: dict[TierCode, float]
    damage_percent: float
    heatmap_base64: str | None = None


@runtime_checkable
class Classifier(Protocol):
    """What every damage-classification backend must provide."""

    id: str
    name: str
    accuracy: float | None

    def classify(self, image_bytes: bytes) -> Prediction:
        """Classify a building photo into a damage tier."""
        ...
