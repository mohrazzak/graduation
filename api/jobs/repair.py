"""The 2D restoration pipeline: mask -> edges -> generate -> compose.

Three of the four stages run locally for free and produce the artifacts the
interactive canvas shows. Only `generating` calls Gemini, and it is ONE long
opaque step: the API reports no progress, so the UI shows one honest indefinite
step rather than fabricated sub-progress.

The tier decides how much latitude the instruction grants. Raed's rule for a
total collapse — "use a full mask" — has no literal form on an instruction-editing
backend, which accepts no mask at all; it maps onto maximum reconstruction
latitude in the prompt. A mask-conditioned backend would express it literally.
"""

from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request

from jobs import stages
from jobs.store import store
from predict.tiers import TierCode

MODEL = "gemini-2.5-flash-image"
_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

STAGE_KEYS = ("isolating", "edges", "generating", "composing")

_BASE_INSTRUCTION = (
    "You are an architectural restoration visualizer. Edit this photograph of a "
    "damaged building to show the SAME building fully repaired and restored. "
    "Rebuild damaged or collapsed walls, replace broken or missing windows and "
    "doors, remove rubble, debris, scorch marks, smoke and graffiti, and return "
    "the facade to a clean, structurally sound condition. Keep the same building, "
    "the same architectural style, the same camera viewpoint, and the same "
    "surroundings and lighting. Produce a single photorealistic image."
)

# How much freedom the edit gets, by tier. NC is a touch-up; GC is a conceptual
# reconstruction, so the instruction says so outright.
_TIER_GUIDANCE: dict[TierCode, str] = {
    "NC": "The structure is standing; clean only minor surface damage and blemishes.",
    "PC": (
        "Reconstruct the partially collapsed sections, rebuilding the walls, "
        "floors and balconies that are missing, while preserving the parts that "
        "still stand."
    ),
    "GC": (
        "Reconstruct the building from near-total destruction, inferring its "
        "original form from what remains and from the surrounding buildings. "
        "Rebuild whole structural volumes rather than patching openings."
    ),
}


def build_prompt(tier: TierCode) -> str:
    """Compose the tier-tuned restoration instruction."""
    return f"{_BASE_INSTRUCTION} {_TIER_GUIDANCE[tier]}".strip()


class RepairUnavailable(RuntimeError):
    """Raised when the generation backend cannot run (no key, or quota spent)."""


def _generate(image_bytes: bytes, prompt: str) -> bytes:
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


def run(job_id: str, image_bytes: bytes, tier: TierCode, prompt: str | None) -> None:
    """Execute the restoration pipeline, reporting each stage as it is reached.

    Runs on a worker thread; every outcome is recorded on the job rather than
    raised, so a failure surfaces to the client as a status instead of a 500.
    """
    try:
        image = stages.load_rgb(image_bytes)

        store.start_stage(job_id, "isolating", 1)
        mask_preview, mask = stages.mask_png(image)
        store.add_artifact(job_id, "mask", mask_preview, "image/png")

        store.start_stage(job_id, "edges", 2)
        store.add_artifact(job_id, "edges", stages.edges_png(image, mask), "image/png")

        store.start_stage(job_id, "generating", 3)
        try:
            repaired = _generate(image_bytes, prompt or build_prompt(tier))
        except RepairUnavailable as exc:
            # The local artifacts above are real and already attached; keep them
            # and report why the generated image is missing.
            store.fail(job_id, str(exc.args[0] if exc.args else "backend_error"))
            return
        store.add_artifact(job_id, "repaired", repaired, "image/png")

        store.start_stage(job_id, "composing", 4)
        try:
            from repair.diff import change_overlay

            store.add_artifact(
                job_id, "diff", change_overlay(image_bytes, repaired), "image/png"
            )
        except Exception:  # noqa: BLE001 - the overlay is a nicety, not the result
            pass

        store.finish(job_id)
    except Exception as exc:  # noqa: BLE001 - a worker thread must never die silently
        store.fail(job_id, f"unexpected: {type(exc).__name__}")


def repaired_bytes(job_id: str) -> bytes | None:
    """The repaired image from a finished job, for the 3D from_job path."""
    job = store.get(job_id)
    if job is None:
        return None
    artifact = job.artifacts.get("repaired")
    return artifact.data if artifact else None
