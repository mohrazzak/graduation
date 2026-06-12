"""Prediction seam: the single place where the trained model replaces the mock
(via MOCK_MODE) with zero frontend change."""

import os
from collections.abc import Callable
from dataclasses import dataclass

_TRUTHY = {"1", "true", "yes"}


@dataclass
class Prediction:
    """Framework-agnostic prediction result shared by the mock and real model."""

    level: int
    confidence: float
    probabilities: list[float]
    heatmap_base64: str | None


def is_mock_mode() -> bool:
    """Return True when MOCK_MODE selects the deterministic mock (the default)."""
    return os.environ.get("MOCK_MODE", "true").strip().lower() in _TRUTHY


def get_predictor() -> Callable[[bytes], Prediction]:
    """Return the active predict(image_bytes) -> Prediction callable.

    Resolved on every call, and the implementations are imported lazily, so
    flipping MOCK_MODE is the only step needed to swap in the trained model —
    its heavyweight dependencies are never touched while mocking.
    """
    if is_mock_mode():
        from predict.mock import predict as mock_predict

        return mock_predict

    from predict.model import predict as model_predict

    return model_predict
