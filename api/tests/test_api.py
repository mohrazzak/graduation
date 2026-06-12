"""Contract tests for the DamageScale mock API — locks the frozen contract of
spec section 6 so the real model can later replace the mock without breakage."""

import base64
import io
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from PIL import Image

from main import app
from predict.interface import Prediction

client = TestClient(app)


def _png_bytes(color: tuple[int, int, int], size: tuple[int, int] = (32, 32)) -> bytes:
    """Encode a solid-color RGB image as PNG bytes."""
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format="PNG")
    return buffer.getvalue()


def _post_image(data: bytes, content_type: str = "image/png") -> Response:
    """POST raw bytes to /predict under the multipart field name 'file'."""
    return client.post("/predict", files={"file": ("photo.png", data, content_type)})


def test_health() -> None:
    """GET /health reports ok and that the mock predictor is active by default."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "mock": True}


def test_predict_contract_shape() -> None:
    """POST /predict returns the exact frozen JSON shape from spec section 6."""
    response = _post_image(_png_bytes((120, 120, 120)))
    assert response.status_code == 200
    body = response.json()

    assert isinstance(body["level"], int) and not isinstance(body["level"], bool)
    assert 0 <= body["level"] <= 5

    assert 0.6 <= body["confidence"] <= 0.95

    probabilities = body["probabilities"]
    assert len(probabilities) == 6
    assert all(p >= 0 for p in probabilities)
    assert abs(sum(probabilities) - 1.0) < 0.01
    assert probabilities.index(max(probabilities)) == body["level"]
    assert body["confidence"] == pytest.approx(probabilities[body["level"]])

    assert isinstance(body["heatmap_base64"], str)
    heatmap = Image.open(io.BytesIO(base64.b64decode(body["heatmap_base64"])))
    assert heatmap.format == "PNG"


def test_predict_deterministic() -> None:
    """The same image bytes must always yield a byte-identical JSON response."""
    data = _png_bytes((40, 80, 160))
    first = _post_image(data)
    second = _post_image(data)
    assert first.status_code == 200
    assert first.content == second.content


def test_distinct_images_yield_multiple_levels() -> None:
    """Different images must spread across levels (guards a constant mock)."""
    levels = set()
    for shade in range(12):
        response = _post_image(_png_bytes((shade * 20, 255 - shade * 20, shade * 7)))
        assert response.status_code == 200
        levels.add(response.json()["level"])
    assert len(levels) >= 2


def test_rejects_bad_type() -> None:
    """Non-image uploads are rejected with 400 and a detail message."""
    response = _post_image(b"definitely not an image", content_type="text/plain")
    assert response.status_code == 400
    assert "detail" in response.json()


def test_rejects_oversize() -> None:
    """Uploads above 10 MB are rejected with 400 and a detail message.

    httpx sends a Content-Length header for bytes bodies, so this exercises
    the cheap precheck that fires before the body is read.
    """
    response = _post_image(b"x" * (10 * 1024 * 1024 + 1))
    assert response.status_code == 400
    assert "detail" in response.json()


def test_rejects_oversize_without_content_length() -> None:
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


def test_rejects_mislabeled_non_image() -> None:
    """Garbage bytes labeled image/png fail Pillow verification with a 400."""
    response = _post_image(b"these bytes do not decode as any image", content_type="image/png")
    assert response.status_code == 400
    assert "detail" in response.json()


def test_missing_file_field_returns_400() -> None:
    """Omitting the 'file' field is a 400 {"detail": ...}, not FastAPI's 422."""
    response = client.post("/predict", files={"other": ("photo.png", b"123", "image/png")})
    assert response.status_code == 400
    assert "detail" in response.json()


def test_unhandled_predictor_error_returns_json_500(monkeypatch: pytest.MonkeyPatch) -> None:
    """A crashing predictor surfaces as 500 {"detail": ...} with no stack trace."""

    def boom(data: bytes) -> Prediction:
        raise RuntimeError("model exploded")

    # Patch the name the endpoint resolves at call time (main's module global).
    monkeypatch.setattr("main.get_predictor", lambda: boom)
    crashing_client = TestClient(app, raise_server_exceptions=False)
    response = crashing_client.post(
        "/predict", files={"file": ("photo.png", _png_bytes((9, 9, 9)), "image/png")}
    )
    assert response.status_code == 500
    body = response.json()
    assert isinstance(body["detail"], str)
    assert "RuntimeError" not in body["detail"]
    assert "model exploded" not in body["detail"]
