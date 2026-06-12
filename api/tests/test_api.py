"""Contract tests for the DamageScale mock API — locks the frozen contract of
spec section 6 so the real model can later replace the mock without breakage."""

import base64
import io

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from PIL import Image

from main import app

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
    """Uploads above 10 MB are rejected with 400 and a detail message."""
    response = _post_image(b"x" * (10 * 1024 * 1024 + 1))
    assert response.status_code == 400
    assert "detail" in response.json()
