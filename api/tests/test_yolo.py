"""The YOLO backend, and the guard against re-shipping a two-class model."""

import pathlib

import pytest

from predict.registry import ModelUnavailableError

SAMPLE = pathlib.Path(__file__).resolve().parents[2] / "demo" / "damaged" / "partial.jpg"


def _backend():
    """Construct the backend, skipping cleanly when it cannot run here."""
    pytest.importorskip("ultralytics")
    from predict.backends.yolo import YoloClassifier

    try:
        return YoloClassifier()
    except ModelUnavailableError as exc:
        pytest.skip(f"yolo unavailable: {exc.reason}")


@pytest.mark.skipif(not SAMPLE.exists(), reason="sample image not present")
def test_emits_all_three_tiers():
    """The binary model shipped before this could not produce NC at all."""
    prediction = _backend().classify(SAMPLE.read_bytes())
    assert set(prediction.probabilities) == {"NC", "PC", "GC"}


@pytest.mark.skipif(not SAMPLE.exists(), reason="sample image not present")
def test_contract_shape():
    prediction = _backend().classify(SAMPLE.read_bytes())
    assert sum(prediction.probabilities.values()) == pytest.approx(1.0, abs=1e-4)
    assert prediction.confidence == prediction.probabilities[prediction.tier]
    assert 0.0 <= prediction.damage_percent <= 100.0
    assert prediction.heatmap_base64 is None


@pytest.mark.skipif(not SAMPLE.exists(), reason="sample image not present")
def test_reports_the_retrained_accuracy():
    """The three-class figure, not the flattering binary 80.37%."""
    accuracy = _backend().accuracy
    assert accuracy is not None
    assert 0.0 < accuracy < 0.80


def test_missing_weights_report_unavailable(monkeypatch):
    pytest.importorskip("ultralytics")
    monkeypatch.setenv("YOLO_WEIGHTS_PATH", "/nonexistent/yolo.pt")
    from predict.backends.yolo import YoloClassifier

    with pytest.raises(ModelUnavailableError) as exc:
        YoloClassifier()
    assert exc.value.reason == "weights_missing"
