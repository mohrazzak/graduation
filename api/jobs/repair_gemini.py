"""Gemini image-editing adapter retained as the repair fallback provider."""

from __future__ import annotations

import base64
import io
import json
import os
import urllib.error
import urllib.request
import warnings

from PIL import Image

from jobs.repair_errors import RepairUnavailable

MODEL = "gemini-2.5-flash-image"
_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
_MAX_IMAGE_BYTES = 25 * 1024 * 1024
_MAX_BASE64_CHARS = ((_MAX_IMAGE_BYTES + 2) // 3) * 4
_IMAGE_FORMATS = {"image/jpeg": "JPEG", "image/png": "PNG"}


def _normalized_png(data: object, mime_type: object) -> bytes:
    """Strictly decode and normalize one bounded Gemini image to verified PNG."""
    try:
        if (
            not isinstance(data, str)
            or not data
            or len(data) > _MAX_BASE64_CHARS
            or not isinstance(mime_type, str)
            or mime_type not in _IMAGE_FORMATS
        ):
            raise ValueError("invalid Gemini image envelope")
        decoded = base64.b64decode(data, validate=True)
        if not decoded or len(decoded) > _MAX_IMAGE_BYTES:
            raise ValueError("Gemini image exceeds the byte limit")

        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(decoded)) as candidate:
                if candidate.format != _IMAGE_FORMATS[mime_type]:
                    raise ValueError("Gemini image format does not match its MIME type")
                candidate.load()
                has_alpha = "A" in candidate.getbands() or "transparency" in candidate.info
                normalized = candidate.convert("RGBA" if has_alpha else "RGB")

        output = io.BytesIO()
        normalized.save(output, format="PNG")
        png = output.getvalue()
        if not png or len(png) > _MAX_IMAGE_BYTES:
            raise ValueError("normalized Gemini PNG exceeds the byte limit")
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(png)) as candidate:
                candidate.verify()
                if candidate.format != "PNG" or min(candidate.size) <= 0:
                    raise ValueError("normalized Gemini result is not a PNG")
        return png
    except Exception as exc:  # noqa: BLE001 - provider bytes are an untrusted boundary
        raise RepairUnavailable("backend_error") from exc


def generate_gemini(image_bytes: bytes, prompt: str) -> bytes:
    """Call Gemini image editing and return PNG/JPEG bytes of the result.

    Raises:
        RepairUnavailable: no API key, quota exhausted, or no image returned.
    """
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise RepairUnavailable("no_api_key")

    body = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": base64.b64encode(image_bytes).decode(),
                        }
                    },
                ]
            }
        ]
    }
    request = urllib.request.Request(
        f"{_ENDPOINT.format(model=MODEL)}?key={key}",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=240) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as exc:
        # 429 is the one users will actually hit on the free tier; name it so the
        # UI can say "out of credit today" instead of "error 429".
        raise RepairUnavailable("quota_exceeded" if exc.code == 429 else "backend_error") from exc
    except Exception as exc:  # noqa: BLE001
        raise RepairUnavailable("backend_error") from exc

    parts = payload.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    for part in parts:
        inline = part.get("inlineData") or part.get("inline_data")
        if inline and inline.get("data"):
            return _normalized_png(
                inline["data"], inline.get("mimeType") or inline.get("mime_type")
            )
    raise RepairUnavailable("no_image_returned")
