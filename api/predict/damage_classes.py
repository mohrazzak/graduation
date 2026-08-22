"""Truthful four-class domain for Raed's object detector."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol

DamageCode = Literal["ND", "SMD", "HVD", "TD"]

DAMAGE_CLASS_ORDER: tuple[DamageCode, ...] = ("ND", "SMD", "HVD", "TD")
MODEL_CLASS_NAMES: dict[int, str] = {
    0: "No Damage",
    1: "Slight/Moderate Damage",
    2: "Heavy/Very Heavy Damage",
    3: "Total Damage",
}
MODEL_INDEX_TO_CODE: dict[int, DamageCode] = {
    0: "ND",
    1: "SMD",
    2: "HVD",
    3: "TD",
}


class NoDetectionError(RuntimeError):
    """Raised when no detector box clears the configured threshold."""


@dataclass(frozen=True)
class Box:
    """One normalized `xyxy` box in the uploaded image frame."""

    x1: float
    y1: float
    x2: float
    y2: float

    def __post_init__(self) -> None:
        coordinates = (self.x1, self.y1, self.x2, self.y2)
        if any(value < 0.0 or value > 1.0 for value in coordinates):
            raise ValueError("box coordinates must be normalized to 0..1")
        if self.x1 > self.x2 or self.y1 > self.y2:
            raise ValueError("box coordinates must be ordered as xyxy")


@dataclass(frozen=True)
class Detection:
    """One detector observation with its stable domain code."""

    class_code: DamageCode
    confidence: float
    box: Box

    def __post_init__(self) -> None:
        if self.class_code not in DAMAGE_CLASS_ORDER:
            raise ValueError(f"unknown damage class: {self.class_code}")
        if self.confidence < 0.0 or self.confidence > 1.0:
            raise ValueError("confidence must be in 0..1")


@dataclass(frozen=True)
class Prediction:
    """Image-level summary derived without inventing class probabilities."""

    class_code: DamageCode
    confidence: float
    scores: dict[DamageCode, float]
    detections: tuple[Detection, ...]


class DetectorClassifier(Protocol):
    """Runtime contract shared by Raed and the development mock."""

    id: str
    name: str
    accuracy: float | None

    def classify(self, image_bytes: bytes) -> Prediction:
        """Detect damaged buildings and summarize the most severe class."""
        ...


def validate_model_names(names: Mapping[int, str]) -> None:
    """Refuse a checkpoint whose numeric labels do not match the known model."""
    normalized = {int(index): str(name) for index, name in names.items()}
    if normalized != MODEL_CLASS_NAMES:
        raise ValueError("Raed checkpoint class names do not match the four-class contract")


def aggregate_detections(detections: Sequence[Detection]) -> Prediction:
    """Select the most severe observed class and maximum score per class."""
    if not detections:
        raise NoDetectionError("no_detection")

    scores: dict[DamageCode, float] = {code: 0.0 for code in DAMAGE_CLASS_ORDER}
    for detection in detections:
        scores[detection.class_code] = max(
            scores[detection.class_code], detection.confidence
        )

    present = {detection.class_code for detection in detections}
    class_code = max(present, key=DAMAGE_CLASS_ORDER.index)
    return Prediction(
        class_code=class_code,
        confidence=scores[class_code],
        scores=scores,
        detections=tuple(detections),
    )
