"""Registry roster, ENABLED_MODELS filtering, and graceful unavailability."""

import pytest

from predict.registry import (
    ModelUnavailableError,
    UnknownModelError,
    default_model_id,
    get_classifier,
    list_models,
)

SAMPLE = b"not-a-real-image-but-the-mock-only-hashes-it"


def test_mock_is_always_available_and_deterministic():
    mock = get_classifier("mock")
    first = mock.classify(SAMPLE)
    second = mock.classify(SAMPLE)
    assert first == second
    assert first.class_code in ("ND", "SMD", "HVD", "TD")


def test_mock_emits_the_four_class_detector_contract():
    prediction = get_classifier("mock").classify(SAMPLE)
    assert set(prediction.scores) == {"ND", "SMD", "HVD", "TD"}
    assert prediction.scores[prediction.class_code] == pytest.approx(prediction.confidence)
    assert len(prediction.detections) == 1
    assert prediction.detections[0].class_code == prediction.class_code


def test_different_images_give_different_results():
    mock = get_classifier("mock")
    assert mock.classify(b"aaa") != mock.classify(b"zzz")


def test_enabled_models_filters_the_roster(monkeypatch):
    monkeypatch.setenv("ENABLED_MODELS", "mock")
    assert [m.id for m in list_models()] == ["mock"]


def test_enabled_models_can_show_raed_alone(monkeypatch):
    monkeypatch.setenv("ENABLED_MODELS", "raed")
    monkeypatch.delenv("RAED_WEIGHTS_PATH", raising=False)
    assert [m.id for m in list_models()] == ["raed"]


def test_roster_order_is_stable_regardless_of_input_order(monkeypatch):
    """Roster order is UI order; ENABLED_MODELS must not reshuffle it."""
    monkeypatch.setenv("ENABLED_MODELS", "mock,raed-seg,raed")
    monkeypatch.delenv("RAED_WEIGHTS_PATH", raising=False)
    monkeypatch.delenv("RAED_SEG_WEIGHTS_PATH", raising=False)
    assert [m.id for m in list_models()] == ["raed", "raed-seg", "mock"]


def test_both_trained_runs_can_be_offered_together(monkeypatch):
    """The two checkpoints are independent roster entries, raed first."""
    monkeypatch.setenv("ENABLED_MODELS", "raed,raed-seg")
    monkeypatch.delenv("RAED_WEIGHTS_PATH", raising=False)
    monkeypatch.delenv("RAED_SEG_WEIGHTS_PATH", raising=False)
    assert [m.id for m in list_models()] == ["raed", "raed-seg"]


def test_the_segment_run_is_listed_with_its_own_name_and_reason(monkeypatch):
    monkeypatch.setenv("ENABLED_MODELS", "raed-seg")
    monkeypatch.delenv("RAED_SEG_WEIGHTS_PATH", raising=False)
    entry = next(m for m in list_models() if m.id == "raed-seg")
    assert entry.available is False
    assert entry.reason == "weights_missing"
    assert entry.name == "Segmentation Model"


def test_the_segment_run_has_its_own_weights_variable(monkeypatch):
    """RAED_WEIGHTS_PATH must never satisfy the segment backend."""
    monkeypatch.setenv("ENABLED_MODELS", "raed-seg")
    monkeypatch.setenv("RAED_WEIGHTS_PATH", "/nonexistent/raed.pt")
    monkeypatch.delenv("RAED_SEG_WEIGHTS_PATH", raising=False)
    with pytest.raises(ModelUnavailableError):
        get_classifier("raed-seg")


def test_unknown_ids_in_enabled_models_are_ignored(monkeypatch):
    monkeypatch.setenv("ENABLED_MODELS", "mock,does-not-exist")
    assert [m.id for m in list_models()] == ["mock"]


def test_empty_roster_falls_back_to_mock(monkeypatch):
    monkeypatch.setenv("ENABLED_MODELS", "nonsense-only")
    assert [m.id for m in list_models()] == ["mock"]


def test_unavailable_models_are_listed_with_a_reason(monkeypatch):
    monkeypatch.setenv("ENABLED_MODELS", "raed")
    monkeypatch.delenv("RAED_WEIGHTS_PATH", raising=False)
    raed = next(m for m in list_models() if m.id == "raed")
    assert raed.available is False
    assert raed.reason == "weights_missing"
    assert raed.name == "Trained Model"


def test_selecting_an_unavailable_model_raises(monkeypatch):
    monkeypatch.delenv("RAED_WEIGHTS_PATH", raising=False)
    with pytest.raises(ModelUnavailableError):
        get_classifier("raed")


def test_unknown_model_raises():
    with pytest.raises(UnknownModelError):
        get_classifier("gpt-9")


def test_default_is_the_first_available(monkeypatch):
    monkeypatch.setenv("ENABLED_MODELS", "raed,mock")
    monkeypatch.delenv("RAED_WEIGHTS_PATH", raising=False)
    assert default_model_id() == "mock"
