"""The Ultralytics adapter maps real detector-shaped output once."""

import io

import pytest
from PIL import Image

from predict.backends.raed import RaedClassifier
from predict.damage_classes import MODEL_CLASS_NAMES, NoDetectionError


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
    def __init__(self, cls, conf, xyxyn) -> None:  # noqa: ANN001 - test seam
        self.cls = Values(cls)
        self.conf = Values(conf)
        self.xyxyn = Values(xyxyn)


def _model(boxes, names=MODEL_CLASS_NAMES):  # noqa: ANN001, ANN202 - external model seam
    class Result:
        pass

    Result.names = names
    Result.boxes = boxes

    class FakeModel:
        names = Result.names

        def __call__(self, image, **kwargs):  # noqa: ANN001, ANN201
            assert image.size == (100, 50)
            assert kwargs == {"conf": 0.25, "verbose": False}
            return [Result()]

    return FakeModel()


def _weights(tmp_path):  # noqa: ANN001, ANN202
    weights = tmp_path / "best.pt"
    weights.write_bytes(b"weights")
    return str(weights)


def test_adapter_returns_normalized_detector_contract(tmp_path) -> None:
    boxes = Boxes([1.0, 3.0], [0.91, 0.62], [[0.1, 0.2, 0.4, 0.8], [0.2, 0.1, 0.9, 0.95]])
    classifier = RaedClassifier(
        weights_path=_weights(tmp_path), model_factory=lambda _p: _model(boxes)
    )

    prediction = classifier.classify(_image_bytes())

    assert prediction.class_code == "TD"
    assert prediction.confidence == pytest.approx(0.62)
    assert prediction.detections[0].class_code == "SMD"
    assert prediction.detections[0].box.x1 == pytest.approx(0.1)


def test_adapter_raises_no_detection_instead_of_inventing_no_damage(tmp_path) -> None:
    classifier = RaedClassifier(
        weights_path=_weights(tmp_path),
        model_factory=lambda _p: _model(Boxes([], [], [])),
    )

    with pytest.raises(NoDetectionError):
        classifier.classify(_image_bytes())


def test_adapter_clamps_edge_boxes_instead_of_rejecting_the_upload(tmp_path) -> None:
    """`xyxyn` can land a hair outside 0..1 on an edge-touching detection."""
    boxes = Boxes([0.0], [0.8], [[-0.0000031, 0.0, 1.0000024, 1.0]])
    classifier = RaedClassifier(
        weights_path=_weights(tmp_path), model_factory=lambda _p: _model(boxes)
    )

    box = classifier.classify(_image_bytes()).detections[0].box

    assert (box.x1, box.x2) == (0.0, 1.0)


def test_adapter_refuses_a_checkpoint_with_unknown_class_names(tmp_path) -> None:
    """A four-class checkpoint must not inherit this domain's severity order."""
    other = {0: "Grade_0", 1: "Grade_2", 2: "Grade_3", 3: "Grade_4_5"}

    with pytest.raises(ValueError, match="class names"):
        RaedClassifier(
            weights_path=_weights(tmp_path),
            model_factory=lambda _p: _model(Boxes([], [], []), names=other),
        )


def test_weights_variable_is_required(monkeypatch) -> None:
    from predict.registry import ModelUnavailableError

    monkeypatch.delenv("RAED_WEIGHTS_PATH", raising=False)

    with pytest.raises(ModelUnavailableError):
        RaedClassifier()
