"""Gemini output is normalized into a bounded, verified PNG artifact."""

from __future__ import annotations

import base64
import io
import json
import struct
import zlib

import pytest
from PIL import Image

from jobs import repair_gemini
from jobs.repair_errors import RepairUnavailable


class JsonResponse(io.BytesIO):
    def __enter__(self) -> JsonResponse:
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()


def image_bytes(image_format: str) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (7, 5), (30, 60, 90)).save(buffer, format=image_format)
    return buffer.getvalue()


def gemini_payload(data: str, mime_type: str) -> bytes:
    return json.dumps(
        {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "inlineData": {
                                    "mimeType": mime_type,
                                    "data": data,
                                }
                            }
                        ]
                    }
                }
            ]
        }
    ).encode()


def decompression_bomb_png() -> bytes:
    payload = struct.pack(">IIBBBBB", 100_000, 100_000, 8, 2, 0, 0, 0)
    header = b"IHDR" + payload
    return (
        b"\x89PNG\r\n\x1a\n"
        + struct.pack(">I", len(payload))
        + header
        + struct.pack(">I", zlib.crc32(header) & 0xFFFFFFFF)
    )


def test_generate_gemini_normalizes_a_valid_jpeg_to_png(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The repair job always stores actual PNG bytes, regardless of Gemini input format."""
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    jpeg = image_bytes("JPEG")
    payload = gemini_payload(base64.b64encode(jpeg).decode("ascii"), "image/jpeg")
    monkeypatch.setattr(
        repair_gemini.urllib.request,
        "urlopen",
        lambda *_args, **_kwargs: JsonResponse(payload),
    )

    result = repair_gemini.generate_gemini(image_bytes("PNG"), "repair")

    with Image.open(io.BytesIO(result)) as candidate:
        candidate.verify()
        assert candidate.format == "PNG"


@pytest.mark.parametrize(
    ("data", "mime_type"),
    [
        ("%%%not-base64%%%", "image/png"),
        (base64.b64encode(b"not an image").decode("ascii"), "image/png"),
        (base64.b64encode(image_bytes("PNG")).decode("ascii"), "application/octet-stream"),
        (base64.b64encode(decompression_bomb_png()).decode("ascii"), "image/png"),
    ],
)
def test_generate_gemini_rejects_invalid_image_payloads(
    monkeypatch: pytest.MonkeyPatch,
    data: str,
    mime_type: str,
) -> None:
    """Malformed or mislabeled model output must not reach the job artifact store."""
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    payload = gemini_payload(data, mime_type)
    monkeypatch.setattr(
        repair_gemini.urllib.request,
        "urlopen",
        lambda *_args, **_kwargs: JsonResponse(payload),
    )

    with pytest.raises(RepairUnavailable) as error:
        repair_gemini.generate_gemini(image_bytes("PNG"), "repair")
    assert error.value.reason == "backend_error"


def test_generate_gemini_rejects_an_oversized_decoded_image(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A model response above 25 MiB is rejected before Pillow or storage sees it."""
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    oversized = base64.b64encode(b"x" * (25 * 1024 * 1024 + 1)).decode("ascii")
    payload = gemini_payload(oversized, "image/png")
    monkeypatch.setattr(
        repair_gemini.urllib.request,
        "urlopen",
        lambda *_args, **_kwargs: JsonResponse(payload),
    )

    with pytest.raises(RepairUnavailable) as error:
        repair_gemini.generate_gemini(image_bytes("PNG"), "repair")
    assert error.value.reason == "backend_error"
