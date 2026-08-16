"""YOLO11-cls damage classifier over the three PHI-Net collapse tiers.

Reads the model's OWN class-name table rather than assuming positions, so a
retrain that reorders classes cannot silently mislabel. A two-class model is
refused at construction instead of serving predictions it cannot make: the
weights shipped before this backend existed were GC-vs-PC only, with NC dropped.
"""

from __future__ import annotations

import functools
import os
from io import BytesIO

from predict.interface import Prediction
from predict.registry import (
    REASON_DEPENDENCY_MISSING,
    REASON_LOAD_FAILED,
    REASON_WEIGHTS_MISSING,
    ModelUnavailableError,
)
from predict.tiers import TIER_ORDER, damage_percent, probabilities_from_names, top_tier

DEFAULT_WEIGHTS = "/home/mohrazzak/projects/graduation/models/yolo_cls.pt"
DEFAULT_ACCURACY_FILE = "/home/mohrazzak/projects/graduation/models/yolo_accuracy.txt"


@functools.lru_cache(maxsize=1)
def _load_model(path: str):  # noqa: ANN202 - returns an ultralytics YOLO
    """Load and cache the YOLO model."""
    import torch  # noqa: F401  # keep torch ahead of any TensorFlow import
    from ultralytics import YOLO

    return YOLO(path)


def _read_accuracy(path: str) -> float | None:
    """Read the recorded validation top-1 accuracy, if the sidecar file exists."""
    try:
        with open(path) as handle:
            return float(handle.read().strip())
    except (OSError, ValueError):
        return None


class YoloClassifier:
    """Ultralytics YOLO11 classifier over GC/NC/PC."""

    id = "yolo-cls"
    name = "YOLO11-cls"

    def __init__(self) -> None:
        path = os.environ.get("YOLO_WEIGHTS_PATH", DEFAULT_WEIGHTS).strip()
        if not path or not os.path.exists(path):
            raise ModelUnavailableError(self.id, REASON_WEIGHTS_MISSING)
        try:
            import ultralytics  # noqa: F401
        except ImportError as exc:
            raise ModelUnavailableError(self.id, REASON_DEPENDENCY_MISSING) from exc
        try:
            model = _load_model(path)
        except Exception as exc:  # noqa: BLE001 - any load failure means "unavailable"
            raise ModelUnavailableError(self.id, REASON_LOAD_FAILED) from exc

        # A two-class model cannot serve the tier contract — refuse it rather
        # than emit predictions that can never say NC.
        labels = {str(name).upper() for name in model.names.values()}
        if not set(TIER_ORDER) <= labels:
            raise ModelUnavailableError(self.id, REASON_LOAD_FAILED)

        self._path = path
        self.accuracy: float | None = _read_accuracy(
            os.environ.get("YOLO_ACCURACY_PATH", DEFAULT_ACCURACY_FILE)
        )

    def classify(self, image_bytes: bytes) -> Prediction:
        """Classify a building photo into a damage tier."""
        from PIL import Image

        model = _load_model(self._path)
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        result = model.predict(image, verbose=False)[0]

        probabilities = probabilities_from_names(model.names, result.probs.data.tolist())
        tier = top_tier(probabilities)
        return Prediction(
            tier=tier,
            confidence=probabilities[tier],
            probabilities=probabilities,
            damage_percent=damage_percent(probabilities),
            heatmap_base64=None,
        )
