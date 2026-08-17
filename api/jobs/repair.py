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

from jobs import stages
from jobs.repair_errors import RepairUnavailable
from jobs.repair_providers import generate_repaired
from jobs.store import store
from predict.tiers import TierCode

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
            repaired = generate_repaired(
                image_bytes=image_bytes,
                building_mask=mask,
                tier=tier,
                prompt=prompt or build_prompt(tier),
            )
        except RepairUnavailable as exc:
            # The local artifacts above are real and already attached; keep them
            # and report why the generated image is missing.
            store.fail(job_id, exc.reason)
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
