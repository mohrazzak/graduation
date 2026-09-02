"""The classifier roster: which backends exist, which load, which are shown.

Two entries, and only one of them is a model. `raed` is the trained four-class
detector the product serves. `mock` is infrastructure: CI, `docker compose` and
the test suite all run on it, because the API image ships neither Ultralytics
nor the weights.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

from predict.damage_classes import DetectorClassifier

logger = logging.getLogger(__name__)

# Roster order is also UI order and default-selection order.
_ROSTER: tuple[str, ...] = ("raed", "mock")
_DEFAULT_ENABLED = "raed"

# Reasons are message keys, translated in the frontend — never raw English.
REASON_WEIGHTS_MISSING = "weights_missing"
REASON_DEPENDENCY_MISSING = "dependency_missing"
REASON_LOAD_FAILED = "load_failed"

_DISPLAY_NAMES = {
    "raed": "Trained Model",
    "mock": "Mock",
}


class UnknownModelError(LookupError):
    """Raised when a caller asks for a model id that is not registered."""


class ModelUnavailableError(RuntimeError):
    """Raised when a registered model cannot be loaded right now."""

    def __init__(self, model_id: str, reason: str) -> None:
        super().__init__(f"model {model_id!r} is unavailable: {reason}")
        self.model_id = model_id
        self.reason = reason


@dataclass(frozen=True)
class ModelInfo:
    """What GET /models reports for one backend."""

    id: str
    name: str
    accuracy: float | None
    available: bool
    reason: str | None


def _load(model_id: str) -> DetectorClassifier:
    """Import and construct one backend.

    Imports are local so that selecting the mock never pulls in torch.

    Raises:
        UnknownModelError: the id is not registered.
        ModelUnavailableError: the backend exists but cannot load.
    """
    if model_id == "mock":
        from predict.backends.mock_backend import MockClassifier

        return MockClassifier()
    if model_id == "raed":
        from predict.backends.raed import RaedClassifier

        return RaedClassifier()
    raise UnknownModelError(f"unknown model id: {model_id}")


# Loaded backends are cached: reading a checkpoint takes seconds and must not
# happen per request. Failures are deliberately NOT cached, so a model becomes
# available as soon as its weights appear.
_cache: dict[str, DetectorClassifier] = {}


def _enabled_ids() -> list[str]:
    """Roster ids permitted by ENABLED_MODELS, in roster order.

    Unknown ids are warned about and dropped — a typo must not silently empty
    the roster. An empty result falls back to the mock so the API always has
    something to serve.
    """
    raw = os.environ.get("ENABLED_MODELS", _DEFAULT_ENABLED)
    requested = [item.strip() for item in raw.split(",") if item.strip()]
    for item in requested:
        if item not in _ROSTER:
            logger.warning("ENABLED_MODELS lists unknown model %r; ignoring", item)
    enabled = [model_id for model_id in _ROSTER if model_id in requested]
    if not enabled:
        logger.warning("ENABLED_MODELS matched no known model; falling back to mock")
        return ["mock"]
    return enabled


def get_classifier(model_id: str | None = None) -> DetectorClassifier:
    """Return a loaded backend by id, or the default when id is None.

    Raises:
        UnknownModelError: the id is not registered.
        ModelUnavailableError: the backend exists but cannot load.
    """
    resolved = model_id or default_model_id()
    if resolved not in _ROSTER:
        raise UnknownModelError(f"unknown model id: {resolved}")
    if resolved not in _cache:
        _cache[resolved] = _load(resolved)
    return _cache[resolved]


def list_models() -> list[ModelInfo]:
    """Report every enabled backend and whether it can actually run right now."""
    infos: list[ModelInfo] = []
    for model_id in _enabled_ids():
        try:
            backend = get_classifier(model_id)
        except ModelUnavailableError as exc:
            infos.append(
                ModelInfo(
                    id=model_id,
                    name=_DISPLAY_NAMES.get(model_id, model_id),
                    accuracy=None,
                    available=False,
                    reason=exc.reason,
                )
            )
            continue
        infos.append(
            ModelInfo(
                id=backend.id,
                name=backend.name,
                accuracy=backend.accuracy,
                available=True,
                reason=None,
            )
        )
    return infos


def default_model_id() -> str:
    """The first enabled backend that actually loads."""
    for info in list_models():
        if info.available:
            return info.id
    return "mock"
