"""Raed's Ultralytics adapter maps real detector-shaped output once."""

import io

import pytest
from PIL import Image

from predict.backends.raed import RaedClassifier
from predict.damage_classes import NoDetectionError


def _image_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (100, 50), "gray").save(buffer, format="PNG")
    return buffer.getvalue()


class Values:
    def __init__(self, values: list[float] | list[list[float]]) -> None:
        self._values = values

    def tolist(self):  # noqa: ANN201 - mirrors a tensor boundary
        return self._values


class Boxes:
    cls = Values([1.0, 3.0])
    conf = Values([0.91, 0.62])
    xyxyn = Values([[0.1, 0.2, 0.4, 0.8], [0.2, 0.1, 0.9, 0.95]])


class Result:
    names = {
        0: "No Damage",
        1: "Slight/Moderate Damage",
        2: "Heavy/Very Heavy Damage",
        3: "Total Damage",
    }
    boxes = Boxes()


class FakeModel:
    names = Result.names

    def __call__(self, image, **kwargs):  # noqa: ANN001, ANN201 - external model seam
        assert image.size == (100, 50)
        assert kwargs == {"conf": 0.25, "verbose": False}
        return [Result()]


def test_adapter_returns_normalized_detector_contract(tmp_path) -> None:
    weights = tmp_path / "best.pt"
    weights.write_bytes(b"weights")
    classifier = RaedClassifier(
        weights_path=str(weights), model_factory=lambda _path: FakeModel()
    )

    prediction = classifier.classify(_image_bytes())

    assert prediction.class_code == "TD"
    assert prediction.confidence == pytest.approx(0.62)
    assert prediction.detections[0].class_code == "SMD"
    assert prediction.detections[0].box.x1 == pytest.approx(0.1)


def test_adapter_raises_no_detection_instead_of_inventing_no_damage(tmp_path) -> None:
    weights = tmp_path / "best.pt"
    weights.write_bytes(b"weights")

    class EmptyResult(Result):
        boxes = Boxes()
        boxes.cls = Values([])
        boxes.conf = Values([])
        boxes.xyxyn = Values([])

    class EmptyModel(FakeModel):
        def __call__(self, image, **kwargs):  # noqa: ANN001, ANN201
            return [EmptyResult()]

    classifier = RaedClassifier(
        weights_path=str(weights), model_factory=lambda _path: EmptyModel()
    )

    with pytest.raises(NoDetectionError):
        classifier.classify(_image_bytes())
