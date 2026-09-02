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

# The segmentation run labels the same four severity steps with its own grade
# vocabulary. The mapping onto this domain is POSITIONAL, which is exact for
# indices 0 and 1 but approximate at the top: `Grade_4_5_Very_Heavy_Total`
# merges what this domain splits into HVD and TD, so index 3 reports TD and
# that class is over-reported relative to the box detector. Listed explicitly
# rather than inferred, so a checkpoint with different labels is refused
# instead of being silently renumbered onto these codes.
SEG_MODEL_CLASS_NAMES: dict[int, str] = {
    0: "Grade_0_1_No_Damage",
    1: "Grade_2_Low_Damage",
    2: "Grade_3_Moderate",
    3: "Grade_4_5_Very_Heavy_Total",
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


def validate_model_names(
    names: Mapping[int, str], expected: Mapping[int, str] = MODEL_CLASS_NAMES
) -> None:
    """Refuse a checkpoint whose numeric labels do not match the known model.

    Each backend passes the exact label set its own checkpoint is known to
    carry. Accepting "any four classes" would let an unrelated run inherit this
    domain's severity order, and under most-severe-wins aggregation a silent
    mislabel becomes a confidently wrong verdict.
    """
    normalized = {int(index): str(name) for index, name in names.items()}
    if normalized != dict(expected):
        raise ValueError("checkpoint class names do not match the four-class contract")


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
