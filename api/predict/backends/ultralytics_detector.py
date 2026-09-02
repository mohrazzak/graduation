"""Shared Ultralytics adapter behind every four-class detector backend.

Two checkpoints are served through this one adapter: the yolov8s box detector
and the yolov8m-seg run. They differ only in where their weights live, what
labels they carry, and how they are named to a person — the inference call, the
normalization and the severity aggregation are identical, so they live here
once. A segmentation result still populates `result.boxes`, which is why the
segment run needs no contract of its own; its masks are simply not exposed.
"""

from __future__ import annotations

import os
from collections.abc import Callable, Mapping
from io import BytesIO
from typing import Any

from PIL import Image

from predict.damage_classes import (
    MODEL_CLASS_NAMES,
    MODEL_INDEX_TO_CODE,
    Box,
    Detection,
    Prediction,
    aggregate_detections,
    validate_model_names,
)
from predict.registry import REASON_WEIGHTS_MISSING, ModelUnavailableError

ModelFactory = Callable[[str], Any]

DEFAULT_CONFIDENCE_THRESHOLD = 0.25


def load_yolo(path: str) -> Any:
    """Import Ultralytics lazily after the registry's load-bearing early import."""
    from ultralytics import YOLO

    return YOLO(path)


class UltralyticsDetector:
    """Detect image regions and summarize them conservatively by severity.

    Subclasses supply the four identity attributes below. Nothing else varies.
    """

    # Ids are persisted in Supabase `model_id` and used for routing — never rename.
    id: str = "ultralytics"
    name: str = "Ultralytics detector"
    accuracy: float | None = None
    weights_env: str = "RAED_WEIGHTS_PATH"
    threshold_env: str = "RAED_CONFIDENCE_THRESHOLD"
    expected_names: Mapping[int, str] = MODEL_CLASS_NAMES

    def __init__(
        self,
        *,
        weights_path: str | None = None,
        confidence_threshold: float | None = None,
        model_factory: ModelFactory = load_yolo,
    ) -> None:
        path = (weights_path or os.environ.get(self.weights_env, "")).strip()
        if not path or not os.path.exists(path):
            raise ModelUnavailableError(self.id, REASON_WEIGHTS_MISSING)
        self._confidence_threshold = (
            confidence_threshold
            if confidence_threshold is not None
            else float(
                os.environ.get(self.threshold_env, str(DEFAULT_CONFIDENCE_THRESHOLD))
            )
        )
        if not 0.0 <= self._confidence_threshold <= 1.0:
            raise ValueError(f"{self.threshold_env} must be in 0..1")
        self._model = model_factory(path)
        validate_model_names(self._model.names, self.expected_names)

    def classify(self, image_bytes: bytes) -> Prediction:
        """Return normalized detector boxes and a most-severe image verdict."""
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        result = self._model(
            image,
            conf=self._confidence_threshold,
            verbose=False,
        )[0]
        validate_model_names(result.names, self.expected_names)

        boxes = result.boxes
        # Ultralytics reports `xyxyn` by dividing raw pixel bounds by the image
        # size, so a detection touching an edge can land a hair outside 0..1.
        # Clamping keeps that honest — the box really is at the border — where
        # passing it through would fail Box validation and 500 a valid upload.
        detections = [
            Detection(
                class_code=MODEL_INDEX_TO_CODE[int(class_index)],
                confidence=float(confidence),
                box=Box(*(min(1.0, max(0.0, float(value))) for value in coordinates)),
            )
            for class_index, confidence, coordinates in zip(
                boxes.cls.tolist(),
                boxes.conf.tolist(),
                boxes.xyxyn.tolist(),
                strict=True,
            )
        ]
        return aggregate_detections(detections)
