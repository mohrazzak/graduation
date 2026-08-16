"""Deterministic stand-in classifier: same image bytes -> same tier, always.

Keeps CI and the cloud deployment working with zero heavy dependencies, and
gives the UI something honest to develop against. Hash-seeded, so it is
reproducible without looking artificially uniform.
"""

from __future__ import annotations

import hashlib
import random

from predict.interface import Prediction
from predict.tiers import (
    MODEL_CLASS_ORDER,
    damage_percent,
    probabilities_from_model,
    top_tier,
)


class MockClassifier:
    """Hash-seeded fake classifier. Never loaded from weights, always available."""

    id = "mock"
    name = "Mock"
    accuracy: float | None = None

    def classify(self, image_bytes: bytes) -> Prediction:
        """Derive a stable pseudo-random tier distribution from the image bytes."""
        seed = int.from_bytes(hashlib.sha256(image_bytes).digest()[:8], "big")
        rng = random.Random(seed)

        # Exponential draws, normalized: one tier ends up dominating, so the
        # result reads like a real verdict rather than a flat three-way tie.
        raw = [rng.expovariate(1.0) for _ in MODEL_CLASS_ORDER]
        total = sum(raw)
        probabilities = probabilities_from_model([value / total for value in raw])

        tier = top_tier(probabilities)
        return Prediction(
            tier=tier,
            confidence=probabilities[tier],
            probabilities=probabilities,
            damage_percent=damage_percent(probabilities),
            heatmap_base64=None,
        )
