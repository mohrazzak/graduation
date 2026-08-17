"""Deterministic image preparation for the isolated ControlNet worker.

These helpers intentionally have no model or network dependencies.  They turn
the existing building mask into an inpainting mask, derive Canny conditioning,
and composite a worker result back into the source image.
"""

from __future__ import annotations

import hashlib

import numpy as np
from PIL import Image, ImageFilter

from predict.tiers import TierCode

_BOUNDED_TIERS = frozenset(("NC", "PC"))
_WINDOW_X = (0.20, 0.80)
_WINDOW_Y = (0.02, 0.85)
_SEED_MODULUS = 2**31


def _resize_mask(mask: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Normalize a mask to grayscale and resize it without inventing regions."""
    return mask.convert("L").resize(size, Image.Resampling.NEAREST)


def repair_mask(
    building_mask: Image.Image,
    tier: TierCode,
    size: tuple[int, int] = (512, 512),
) -> Image.Image:
    """Return the tier-specific region that the inpainting worker may change.

    Complete-collapse repairs use all building pixels.  Non-collapse repairs
    are constrained to the central reference window before intersecting with
    the existing building mask.
    """
    if tier not in ("GC", *_BOUNDED_TIERS):
        raise ValueError(f"unsupported repair tier: {tier}")

    resized = np.asarray(_resize_mask(building_mask, size), dtype=np.uint8)
    if tier == "GC":
        return Image.fromarray(resized, mode="L")

    width, height = size
    left = int(width * _WINDOW_X[0])
    right = int(width * _WINDOW_X[1])
    top = int(height * _WINDOW_Y[0])
    bottom = int(height * _WINDOW_Y[1])
    window = np.zeros((height, width), dtype=np.uint8)
    window[top:bottom, left:right] = 255
    return Image.fromarray(np.minimum(resized, window), mode="L")


def control_edges(
    image: Image.Image,
    mask: Image.Image,
    size: tuple[int, int] = (512, 512),
) -> Image.Image:
    """Return RGB Canny conditioning with edges removed inside ``mask``."""
    gray = image.convert("L").resize(size, Image.Resampling.LANCZOS)
    try:
        import cv2

        edges = cv2.Canny(np.asarray(gray), 100, 200)
    except ImportError:
        # Keep the helper usable in the API environment when optional OpenCV is
        # absent.  The worker's pinned environment uses the exact Canny path.
        edges = np.asarray(gray.filter(ImageFilter.FIND_EDGES))
        edges = np.where(edges >= 100, 255, 0).astype(np.uint8)

    repair_pixels = np.asarray(_resize_mask(mask, size), dtype=np.uint8) > 127
    edges = np.where(repair_pixels, 0, edges).astype(np.uint8)
    return Image.fromarray(edges, mode="L").convert("RGB")


def generation_seed(image_bytes: bytes, tier: TierCode, prompt: str) -> int:
    """Derive a stable 31-bit generation seed from all request inputs."""
    digest = hashlib.sha256(image_bytes + tier.encode() + prompt.encode()).digest()
    return int.from_bytes(digest[:8], byteorder="big") % _SEED_MODULUS


def composite_generated(
    original: Image.Image,
    generated: Image.Image,
    mask: Image.Image,
) -> Image.Image:
    """Blend generated pixels through a feathered mask into the source image."""
    source = original.convert("RGB")
    repaired = generated.convert("RGB").resize(source.size, Image.Resampling.LANCZOS)
    # A small feather softens the seam while leaving pixels well outside the
    # requested region unchanged (important for the surrounding scene).
    feathered = _resize_mask(mask, source.size).filter(ImageFilter.GaussianBlur(2))
    return Image.composite(repaired, source, feathered)
