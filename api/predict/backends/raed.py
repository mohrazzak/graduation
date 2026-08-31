"""Ultralytics adapter for Raed's four-class building-damage detector."""

from __future__ import annotations

import os
from collections.abc import Callable
from io import BytesIO
from typing import Any

from PIL import Image

from predict.damage_classes import (
    MODEL_INDEX_TO_CODE,
    Box,
    Detection,
    Prediction,
    aggregate_detections,
    validate_model_names,
)
from predict.registry import REASON_WEIGHTS_MISSING, ModelUnavailableError

ModelFactory = Callable[[str], Any]


def _load_yolo(path: str) -> Any:
    """Import Ultralytics lazily after the registry's load-bearing early import."""
    from ultralytics import YOLO

    return YOLO(path)


class RaedClassifier:
    """Detect image regions and summarize them conservatively by severity."""

    # The id is persisted in Supabase rows and used for routing — it stays "raed".
    # Only the human-facing label changed.
    id = "raed"
    name = "Trained Model"
    accuracy: float | None = None

    def __init__(
        self,
        *,
        weights_path: str | None = None,
        confidence_threshold: float | None = None,
        model_factory: ModelFactory = _load_yolo,
    ) -> None:
        path = (weights_path or os.environ.get("RAED_WEIGHTS_PATH", "")).strip()
        if not path or not os.path.exists(path):
            raise ModelUnavailableError(self.id, REASON_WEIGHTS_MISSING)
        self._confidence_threshold = (
            confidence_threshold
            if confidence_threshold is not None
            else float(os.environ.get("RAED_CONFIDENCE_THRESHOLD", "0.25"))
        )
        if not 0.0 <= self._confidence_threshold <= 1.0:
            raise ValueError("RAED_CONFIDENCE_THRESHOLD must be in 0..1")
        self._model = model_factory(path)
        validate_model_names(self._model.names)

    def classify(self, image_bytes: bytes) -> Prediction:
        """Return normalized detector boxes and a most-severe image verdict."""
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        result = self._model(
            image,
            conf=self._confidence_threshold,
            verbose=False,
        )[0]
        validate_model_names(result.names)

        boxes = result.boxes
        detections = [
            Detection(
                class_code=MODEL_INDEX_TO_CODE[int(class_index)],
                confidence=float(confidence),
                box=Box(*(float(value) for value in coordinates)),
            )
            for class_index, confidence, coordinates in zip(
                boxes.cls.tolist(),
                boxes.conf.tolist(),
                boxes.xyxyn.tolist(),
                strict=True,
            )
        ]
        return aggregate_detections(detections)
