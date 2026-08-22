"""Four-class detector aggregation stays severity ordered and truthful."""

import pytest

from predict.damage_classes import (
    Box,
    Detection,
    NoDetectionError,
    aggregate_detections,
)


def test_most_severe_detection_wins_over_higher_confidence() -> None:
    prediction = aggregate_detections(
        [
            Detection("SMD", 0.91, Box(0.1, 0.1, 0.4, 0.4)),
            Detection("TD", 0.62, Box(0.2, 0.2, 0.8, 0.8)),
        ]
    )

    assert prediction.class_code == "TD"
    assert prediction.confidence == pytest.approx(0.62)
    assert prediction.scores == {"ND": 0.0, "SMD": 0.91, "HVD": 0.0, "TD": 0.62}


def test_highest_confidence_wins_within_overall_class() -> None:
    prediction = aggregate_detections(
        [
            Detection("HVD", 0.55, Box(0.0, 0.0, 0.2, 0.2)),
            Detection("HVD", 0.83, Box(0.3, 0.3, 0.9, 0.9)),
        ]
    )

    assert prediction.class_code == "HVD"
    assert prediction.confidence == pytest.approx(0.83)


def test_no_detection_is_not_no_damage() -> None:
    with pytest.raises(NoDetectionError):
        aggregate_detections([])


@pytest.mark.parametrize("coordinate", (-0.01, 1.01))
def test_boxes_reject_coordinates_outside_normalized_frame(coordinate: float) -> None:
    with pytest.raises(ValueError, match="normalized"):
        Box(coordinate, 0.0, 0.5, 0.5)

