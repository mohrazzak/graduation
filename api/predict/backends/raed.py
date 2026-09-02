"""Ultralytics adapter for Raed's four-class building-damage box detector."""

from __future__ import annotations

from predict.backends.ultralytics_detector import UltralyticsDetector, load_yolo
from predict.damage_classes import MODEL_CLASS_NAMES

# Kept importable under its historical name: existing tests and any pinned
# import path construct the backend through this seam.
_load_yolo = load_yolo


class RaedClassifier(UltralyticsDetector):
    """The serving detector: yolov8s, trained to completion on the four classes."""

    # The id is persisted in Supabase rows and used for routing — it stays "raed".
    # Only the human-facing label changed.
    id = "raed"
    name = "Trained Model"
    accuracy: float | None = None
    weights_env = "RAED_WEIGHTS_PATH"
    threshold_env = "RAED_CONFIDENCE_THRESHOLD"
    expected_names = MODEL_CLASS_NAMES
