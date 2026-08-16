"""Contract tests for the tier-based API — locks the wire shape the frontend
depends on, and the upload guards that protect POST /predict."""

import io
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from PIL import Image

from main import create_app


@pytest.fixture(autouse=True)
def _mock_roster(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pin every test to the mock backend so none of them load TensorFlow."""
    monkeypatch.setenv("ENABLED_MODELS", "mock")


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


def _png_bytes(color: tuple[int, int, int], size: tuple[int, int] = (32, 32)) -> bytes:
    """Encode a solid-color RGB image as PNG bytes."""
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format="PNG")
    return buffer.getvalue()


def _post_image(
    client: TestClient, data: bytes, content_type: str = "image/png"
) -> Response:
    """POST raw bytes to /predict under the multipart field name 'file'."""
    return client.post("/predict", files={"file": ("photo.png", data, content_type)})


def test_health(client: TestClient) -> None:
    """GET /health reports ok, the mock flag, and which model is active."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "mock": True, "model": "mock"}


def test_predict_contract_shape(client: TestClient) -> None:
    """POST /predict returns the tier-keyed JSON shape from spec section 4."""
    response = _post_image(client, _png_bytes((120, 120, 120)))
    assert response.status_code == 200
    body = response.json()

    assert body["tier"] in ("NC", "PC", "GC")

    probabilities = body["probabilities"]
    assert set(probabilities) == {"NC", "PC", "GC"}
    assert all(p >= 0 for p in probabilities.values())
    assert abs(sum(probabilities.values()) - 1.0) < 0.01

    # The reported tier must be the argmax, and confidence must be its probability.
    assert max(probabilities, key=probabilities.__getitem__) == body["tier"]
    assert body["confidence"] == pytest.approx(probabilities[body["tier"]])

    assert 0.0 <= body["damage_percent"] <= 100.0
    assert body["model"]["id"] == "mock"

    # Real backends return no heatmap in v1; the mock matches them rather than
    # showing a model explanation that no model produced.
    assert body["heatmap_base64"] is None


def test_predict_never_exposes_a_class_index(client: TestClient) -> None:
    """Indices are the mislabeling bug's only entry point — keep them off the wire."""
    body = _post_image(client, _png_bytes((77, 88, 99))).json()
    assert "level" not in body
    assert not isinstance(body["probabilities"], list)


def test_predict_deterministic(client: TestClient) -> None:
    """The same image bytes must always yield a byte-identical JSON response."""
    data = _png_bytes((40, 80, 160))
    first = _post_image(client, data)
    second = _post_image(client, data)
    assert first.status_code == 200
    assert first.content == second.content


def test_distinct_images_yield_multiple_tiers(client: TestClient) -> None:
    """Different images must spread across tiers (guards a constant mock)."""
    tiers = set()
    for shade in range(12):
        response = _post_image(
            client, _png_bytes((shade * 20, 255 - shade * 20, shade * 7))
        )
        assert response.status_code == 200
        tiers.add(response.json()["tier"])
    assert len(tiers) >= 2


def test_rejects_bad_type(client: TestClient) -> None:
    """Non-image uploads are rejected with 400 and a detail message."""
    response = _post_image(client, b"definitely not an image", content_type="text/plain")
    assert response.status_code == 400
    assert "detail" in response.json()


def test_rejects_oversize(client: TestClient) -> None:
    """Uploads above 10 MB are rejected with 400 and a detail message.

    httpx sends a Content-Length header for bytes bodies, so this exercises
    the cheap precheck that fires before the body is read.
    """
    response = _post_image(client, b"x" * (10 * 1024 * 1024 + 1))
    assert response.status_code == 400
    assert "detail" in response.json()


def test_rejects_oversize_without_content_length(client: TestClient) -> None:
    """Chunked uploads (no Content-Length) still hit the post-read size check."""
    boundary = "damagescale-test-boundary"
    body = (
        (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="file"; filename="big.png"\r\n'
            "Content-Type: image/png\r\n\r\n"
        ).encode()
        + b"x" * (10 * 1024 * 1024 + 1)
        + f"\r\n--{boundary}--\r\n".encode()
    )

    # A generator body makes httpx use Transfer-Encoding: chunked, so the
    # Content-Length precheck cannot fire and the post-read check must.
    def chunks() -> Iterator[bytes]:
        yield body

    response = client.post(
        "/predict",
        content=chunks(),
        headers={"content-type": f"multipart/form-data; boundary={boundary}"},
    )
    assert response.status_code == 400
    assert "detail" in response.json()


def test_rejects_mislabeled_non_image(client: TestClient) -> None:
    """Garbage bytes labeled image/png fail Pillow verification with a 400."""
    response = _post_image(
        client, b"these bytes do not decode as any image", content_type="image/png"
    )
    assert response.status_code == 400
    assert "detail" in response.json()


def test_missing_file_field_returns_400(client: TestClient) -> None:
    """Omitting the 'file' field is a 400 {"detail": ...}, not FastAPI's 422."""
    response = client.post(
        "/predict", files={"other": ("photo.png", b"123", "image/png")}
    )
    assert response.status_code == 400
    assert "detail" in response.json()


def test_unhandled_classifier_error_returns_json_500(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A crashing classifier surfaces as 500 {"detail": ...} with no stack trace."""

    class Exploding:
        id = "mock"
        name = "Mock"
        accuracy = None

        def classify(self, image_bytes: bytes):  # noqa: ANN202 - never returns
            raise RuntimeError("model exploded")

    # Patch the name the endpoint resolves at call time (main's module global).
    monkeypatch.setattr("main.get_classifier", lambda model=None: Exploding())
    crashing_client = TestClient(create_app(), raise_server_exceptions=False)
    response = crashing_client.post(
        "/predict", files={"file": ("photo.png", _png_bytes((9, 9, 9)), "image/png")}
    )
    assert response.status_code == 500
    body = response.json()
    assert isinstance(body["detail"], str)
    assert "RuntimeError" not in body["detail"]
    assert "model exploded" not in body["detail"]
