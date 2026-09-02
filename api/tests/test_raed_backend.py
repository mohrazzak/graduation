"""The Ultralytics adapters map real detector-shaped output once, per checkpoint.

Both trained runs share one adapter, so each case runs against both and asserts
that neither will accept the other's class names — a silent remap would give a
wrong verdict with full confidence.
"""

import io

import pytest
from PIL import Image

from predict.backends.raed import RaedClassifier
from predict.backends.raed_seg import RaedSegClassifier
from predict.damage_classes import (
    MODEL_CLASS_NAMES,
    SEG_MODEL_CLASS_NAMES,
    NoDetectionError,
)

BACKENDS = [
    pytest.param(RaedClassifier, MODEL_CLASS_NAMES, id="raed"),
    pytest.param(RaedSegClassifier, SEG_MODEL_CLASS_NAMES, id="raed-seg"),
]


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


def _model(names, boxes):  # noqa: ANN001, ANN202 - external model seam
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


@pytest.mark.parametrize(("backend", "names"), BACKENDS)
def test_adapter_returns_normalized_detector_contract(backend, names, tmp_path) -> None:
    boxes = Boxes([1.0, 3.0], [0.91, 0.62], [[0.1, 0.2, 0.4, 0.8], [0.2, 0.1, 0.9, 0.95]])
    classifier = backend(
        weights_path=_weights(tmp_path), model_factory=lambda _p: _model(names, boxes)
    )

    prediction = classifier.classify(_image_bytes())

    assert prediction.class_code == "TD"
    assert prediction.confidence == pytest.approx(0.62)
    assert prediction.detections[0].class_code == "SMD"
    assert prediction.detections[0].box.x1 == pytest.approx(0.1)


@pytest.mark.parametrize(("backend", "names"), BACKENDS)
def test_adapter_raises_no_detection_instead_of_inventing_no_damage(
    backend, names, tmp_path
) -> None:
    classifier = backend(
        weights_path=_weights(tmp_path),
        model_factory=lambda _p: _model(names, Boxes([], [], [])),
    )

    with pytest.raises(NoDetectionError):
        classifier.classify(_image_bytes())


@pytest.mark.parametrize(("backend", "names"), BACKENDS)
def test_adapter_clamps_edge_boxes_instead_of_rejecting_the_upload(
    backend, names, tmp_path
) -> None:
    """`xyxyn` can land a hair outside 0..1 on an edge-touching detection."""
    boxes = Boxes([0.0], [0.8], [[-0.0000031, 0.0, 1.0000024, 1.0]])
    classifier = backend(
        weights_path=_weights(tmp_path), model_factory=lambda _p: _model(names, boxes)
    )

    box = classifier.classify(_image_bytes()).detections[0].box

    assert (box.x1, box.x2) == (0.0, 1.0)


@pytest.mark.parametrize(("backend", "names"), BACKENDS)
def test_adapter_refuses_the_other_checkpoints_class_names(
    backend, names, tmp_path
) -> None:
    other = SEG_MODEL_CLASS_NAMES if names is MODEL_CLASS_NAMES else MODEL_CLASS_NAMES

    with pytest.raises(ValueError, match="class names"):
        backend(
            weights_path=_weights(tmp_path),
            model_factory=lambda _p: _model(other, Boxes([], [], [])),
        )


@pytest.mark.parametrize(("backend", "names"), BACKENDS)
def test_each_backend_reads_its_own_weights_variable(
    backend, names, monkeypatch, tmp_path
) -> None:
    monkeypatch.setenv(backend.weights_env, _weights(tmp_path))
    for other in (RaedClassifier, RaedSegClassifier):
        if other is not backend:
            monkeypatch.delenv(other.weights_env, raising=False)

    classifier = backend(model_factory=lambda _p: _model(names, Boxes([], [], [])))

    assert classifier.id == backend.id
