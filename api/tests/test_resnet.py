"""The ResNet backend, pinned to a measured real prediction.

Skipped when TensorFlow or the weights are absent, so CI stays light.
"""

import pathlib

import pytest

from predict.registry import ModelUnavailableError

# The committed demo sample, so the suite never depends on an untracked file.
SAMPLE = (
    pathlib.Path(__file__).resolve().parents[2]
    / "web" / "public" / "samples" / "sample-PC.jpg"
)


def _backend():
    """Construct the backend, skipping cleanly when it cannot run here."""
    pytest.importorskip("tensorflow")
    from predict.backends.resnet import ResNetClassifier

    try:
        return ResNetClassifier()
    except ModelUnavailableError as exc:
        pytest.skip(f"resnet unavailable: {exc.reason}")


@pytest.mark.skipif(not SAMPLE.exists(), reason="sample image not present")
def test_classifies_the_partial_damage_sample_as_pc():
    """Measured 2026-08-17 on sample-PC.jpg: GC 0.239 / NC 0.042 / PC 0.719.

    This is the Caffe-preprocessing regression guard. If preprocessing drifts
    (RGB instead of BGR, /255 normalization, wrong means) the model still
    returns confident numbers — they are just wrong. Only this assertion
    catches that.
    """
    prediction = _backend().classify(SAMPLE.read_bytes())
    assert prediction.tier == "PC"
    assert prediction.probabilities["PC"] == pytest.approx(0.719, abs=0.03)
    assert prediction.probabilities["GC"] == pytest.approx(0.239, abs=0.03)
    assert prediction.probabilities["NC"] == pytest.approx(0.042, abs=0.03)


@pytest.mark.skipif(not SAMPLE.exists(), reason="sample image not present")
def test_contract_shape():
    prediction = _backend().classify(SAMPLE.read_bytes())
    assert set(prediction.probabilities) == {"NC", "PC", "GC"}
    assert sum(prediction.probabilities.values()) == pytest.approx(1.0, abs=1e-4)
    assert prediction.confidence == prediction.probabilities[prediction.tier]
    assert 0.0 <= prediction.damage_percent <= 100.0
    assert prediction.heatmap_base64 is None  # Grad-CAM is a later stretch


def test_missing_weights_report_unavailable(monkeypatch):
    pytest.importorskip("tensorflow")
    monkeypatch.setenv("RESNET_WEIGHTS_PATH", "/nonexistent/model.keras")
    from predict.backends.resnet import ResNetClassifier

    with pytest.raises(ModelUnavailableError) as exc:
        ResNetClassifier()
    assert exc.value.reason == "weights_missing"
