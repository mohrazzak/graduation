"""Automatic mask preparation job used to seed the browser editor."""

from __future__ import annotations

from io import BytesIO

from jobs import stages
from jobs.store import store

STAGE_KEYS = ("isolating", "edges")


def run(job_id: str, image_bytes: bytes) -> None:
    """Produce a raw grayscale selection mask and matching edge preview."""
    try:
        image = stages.load_rgb(image_bytes)
        store.start_stage(job_id, "isolating", 1)
        selection = stages.building_mask(image)
        buffer = BytesIO()
        selection.convert("L").save(buffer, format="PNG")
        store.add_artifact(job_id, "mask", buffer.getvalue(), "image/png")

        store.start_stage(job_id, "edges", 2)
        store.add_artifact(
            job_id, "edges", stages.edges_png(image, selection), "image/png"
        )
        store.finish(job_id)
    except Exception as exc:  # noqa: BLE001 - worker failures become job status
        store.fail(job_id, f"unexpected: {type(exc).__name__}")
