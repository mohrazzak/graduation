"""Gemini image-editing adapter retained as the repair fallback provider."""

from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request

from jobs.repair_errors import RepairUnavailable

MODEL = "gemini-2.5-flash-image"
_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


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
            return base64.b64decode(inline["data"])
    raise RepairUnavailable("no_image_returned")
