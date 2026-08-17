"""Select the optional local repair provider or the Gemini fallback."""

from __future__ import annotations

import logging
import os
from collections.abc import Callable
from typing import Literal

from PIL import Image

from jobs.repair_errors import RepairUnavailable
from jobs.repair_gemini import generate_gemini
from predict.tiers import TierCode

logger = logging.getLogger(__name__)

RepairBackend = Literal["auto", "local-controlnet", "gemini"]


def parse_backend(raw: str | None) -> RepairBackend:
    """Validate the configured backend without silently changing providers."""
    if raw is None:
        return "auto"
    if raw in ("auto", "local-controlnet", "gemini"):
        return raw
    raise RepairUnavailable("invalid_repair_backend")


def generate_with(
    backend: RepairBackend,
    *,
    local: Callable[[], bytes],
    gemini: Callable[[], bytes],
    local_ready: Callable[[], bool],
) -> bytes:
    """Generate through the selected provider, falling back only in auto mode."""
    if backend == "gemini":
        return gemini()
    if backend == "local-controlnet":
        return local()
    if not local_ready():
        return gemini()
    try:
        return local()
    except RepairUnavailable as exc:
        logger.warning("local ControlNet unavailable; falling back to Gemini: %s", exc.reason)
        return gemini()


def generate_repaired(
    image_bytes: bytes,
    building_mask: Image.Image,
    tier: TierCode,
    prompt: str,
) -> bytes:
    """Run the configured repair backend with a lazy optional local import."""

    def generate_local() -> bytes:
        try:
            from jobs.local_controlnet import generate_local as local_generator
        except (ImportError, RuntimeError) as exc:
            raise RepairUnavailable("local_dependency_missing") from exc
        return local_generator(image_bytes, building_mask, tier, prompt)

    def local_available() -> bool:
        try:
            from jobs.local_controlnet import local_available as local_probe
        except (ImportError, RuntimeError):
            return False
        return local_probe()

    return generate_with(
        parse_backend(os.environ.get("REPAIR_BACKEND")),
        local=generate_local,
        gemini=lambda: generate_gemini(image_bytes, prompt),
        local_ready=local_available,
    )
