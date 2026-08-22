"""Deterministic stand-in detector: same image bytes -> same result, always.

Keeps CI and the cloud deployment working with zero heavy dependencies, and
gives the UI something honest to develop against. Hash-seeded, so it is
reproducible without looking artificially uniform.
"""

from __future__ import annotations

import hashlib
import random

from predict.damage_classes import DAMAGE_CLASS_ORDER, Box, Detection, Prediction


class MockClassifier:
    """Hash-seeded fake classifier. Never loaded from weights, always available."""

    id = "mock"
    name = "Mock"
    accuracy: float | None = None

    def classify(self, image_bytes: bytes) -> Prediction:
        """Derive one stable synthetic detection from the image bytes."""
        seed = int.from_bytes(hashlib.sha256(image_bytes).digest()[:8], "big")
        rng = random.Random(seed)
        class_code = DAMAGE_CLASS_ORDER[rng.randrange(len(DAMAGE_CLASS_ORDER))]
        confidence = round(rng.uniform(0.55, 0.97), 6)
        scores = {code: 0.0 for code in DAMAGE_CLASS_ORDER}
        scores[class_code] = confidence
        detection = Detection(
            class_code=class_code,
            confidence=confidence,
            box=Box(x1=0.08, y1=0.08, x2=0.92, y2=0.92),
        )
        return Prediction(
            class_code=class_code,
            confidence=confidence,
            scores=scores,
            detections=(detection,),
        )
