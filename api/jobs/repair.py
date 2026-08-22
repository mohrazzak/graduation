"""Selective 2D restoration: generate through the submitted mask, then compose.

Mask preparation is a separate free job. This pipeline receives the edited
selection, calls the configured provider, and finally composites through that
selection so pixels outside it are always sourced from the original image.
"""

from __future__ import annotations

from io import BytesIO

import numpy as np
from PIL import Image

from jobs import stages
from jobs.repair_errors import RepairUnavailable
from jobs.repair_providers import generate_repaired
from jobs.store import store
from predict.damage_classes import DamageCode
from repair.controlnet_core import composite_generated

STAGE_KEYS = ("generating", "composing")

_BASE_INSTRUCTION = (
    "You are an architectural restoration visualizer. Edit this photograph of a "
    "damaged building to show the SAME building fully repaired and restored. "
    "Rebuild damaged or collapsed walls, replace broken or missing windows and "
    "doors, remove rubble, debris, scorch marks, smoke and graffiti, and return "
    "the facade to a clean, structurally sound condition. Keep the same building, "
    "the same architectural style, the same camera viewpoint, and the same "
    "surroundings and lighting. Produce a single photorealistic image."
)

# How much freedom the edit gets, by detector class.
_CLASS_GUIDANCE: dict[DamageCode, str] = {
    "ND": "No structural damage was detected; limit edits to the selected cosmetic area.",
    "SMD": (
        "Repair slight or moderate damage inside the selected area while preserving "
        "the intact structure."
    ),
    "HVD": (
        "Reconstruct the partially collapsed sections, rebuilding the walls, "
        "floors and balconies that are missing, while preserving the parts that "
        "still stand."
    ),
    "TD": (
        "Reconstruct the building from near-total destruction, inferring its "
        "original form from what remains and from the surrounding buildings. "
        "Rebuild whole structural volumes rather than patching openings."
    ),
}


def build_prompt(class_code: DamageCode) -> str:
    """Compose the four-class restoration instruction."""
    return f"{_BASE_INSTRUCTION} {_CLASS_GUIDANCE[class_code]}".strip()


class MaskValidationError(ValueError):
    """A stable client-facing reason for rejecting a submitted mask."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def decode_selection_mask(
    mask_bytes: bytes, source_size: tuple[int, int]
) -> Image.Image:
    """Decode a non-empty, same-sized selection as a binary grayscale mask."""
    try:
        with Image.open(BytesIO(mask_bytes)) as candidate:
            candidate.load()
            selection = candidate.convert("L")
    except Exception as exc:  # noqa: BLE001 - untrusted upload boundary
        raise MaskValidationError("invalid_mask") from exc
    if selection.size != source_size:
        raise MaskValidationError("mask_size_mismatch")
    binary = selection.point(lambda value: 255 if value >= 128 else 0, mode="L")
    if not np.asarray(binary, dtype=np.uint8).any():
        raise MaskValidationError("empty_mask")
    return binary


def _png(image: Image.Image) -> bytes:
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def run(
    job_id: str,
    image_bytes: bytes,
    selection_mask: Image.Image,
    class_code: DamageCode,
    prompt: str | None,
) -> None:
    """Execute the restoration pipeline, reporting each stage as it is reached.

    Runs on a worker thread; every outcome is recorded on the job rather than
    raised, so a failure surfaces to the client as a status instead of a 500.
    """
    try:
        image = stages.load_rgb(image_bytes)

        store.start_stage(job_id, "generating", 1)
        try:
            generated = generate_repaired(
                image_bytes=image_bytes,
                selection_mask=selection_mask,
                class_code=class_code,
                prompt=prompt or build_prompt(class_code),
            )
        except RepairUnavailable as exc:
            # The local artifacts above are real and already attached; keep them
            # and report why the generated image is missing.
            store.fail(job_id, exc.reason)
            return
        store.start_stage(job_id, "composing", 2)
        with Image.open(BytesIO(generated)) as candidate:
            repaired = _png(composite_generated(image, candidate, selection_mask))
        store.add_artifact(job_id, "repaired", repaired, "image/png")

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
