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
    assert first.tier in ("NC", "PC", "GC")


def test_mock_emits_the_three_tier_contract():
    prediction = get_classifier("mock").classify(SAMPLE)
    assert set(prediction.probabilities) == {"NC", "PC", "GC"}
    assert prediction.probabilities[prediction.tier] == pytest.approx(
        prediction.confidence
    )
    assert sum(prediction.probabilities.values()) == pytest.approx(1.0, abs=1e-6)
    assert 0.0 <= prediction.damage_percent <= 100.0


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
    monkeypatch.setenv("ENABLED_MODELS", "mock,raed")
    monkeypatch.delenv("RAED_WEIGHTS_PATH", raising=False)
    assert [m.id for m in list_models()] == ["raed", "mock"]


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
    assert raed.name == "Raed's model"


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
