"""GET /models and model selection on POST /predict."""

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from main import create_app


@pytest.fixture
def client(monkeypatch):
    """A client pinned to the mock roster so tests never load heavy backends."""
    monkeypatch.setenv("ENABLED_MODELS", "mock")
    return TestClient(create_app())


def _png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), (120, 120, 120)).save(buffer, format="PNG")
    return buffer.getvalue()


def _upload(client, model: str | None = None):
    path = "/predict" if model is None else f"/predict?model={model}"
    return client.post(path, files={"file": ("b.png", _png(), "image/png")})


def test_models_lists_the_enabled_roster(client):
    body = client.get("/models").json()
    assert [m["id"] for m in body["models"]] == ["mock"]
    assert body["models"][0]["available"] is True
    assert body["models"][0]["reason"] is None


def test_models_reports_unavailable_with_a_reason(client, monkeypatch):
    monkeypatch.setenv("ENABLED_MODELS", "raed")
    monkeypatch.delenv("RAED_WEIGHTS_PATH", raising=False)
    entry = client.get("/models").json()["models"][0]
    assert entry["id"] == "raed"
    assert entry["available"] is False
    assert entry["reason"] == "weights_missing"


def test_predict_returns_tier_codes_not_indices(client):
    body = _upload(client).json()
    assert body["tier"] in ("NC", "PC", "GC")
    assert isinstance(body["probabilities"], dict)
    assert set(body["probabilities"]) == {"NC", "PC", "GC"}
    assert "level" not in body


def test_predict_reports_which_model_ran(client):
    body = _upload(client).json()
    assert body["model"]["id"] == "mock"
    assert 0.0 <= body["damage_percent"] <= 100.0


def test_predict_is_deterministic_for_the_same_bytes(client):
    first = _upload(client).json()
    second = _upload(client).json()
    assert first["tier"] == second["tier"]
    assert first["probabilities"] == second["probabilities"]


def test_predict_rejects_an_unknown_model(client):
    response = _upload(client, model="gpt-9")
    assert response.status_code == 400
    assert "gpt-9" in response.json()["detail"]


def test_predict_reports_an_unavailable_model_as_503(client, monkeypatch):
    monkeypatch.delenv("RAED_WEIGHTS_PATH", raising=False)
    response = _upload(client, model="raed")
    assert response.status_code == 503
    assert "detail" in response.json()


def test_health_reports_the_active_model(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["model"] == "mock"
    assert body["mock"] is True
