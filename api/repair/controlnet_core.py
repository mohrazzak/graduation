"""Deterministic image preparation for the isolated ControlNet worker.

These helpers intentionally have no model or network dependencies.  They turn
the existing building mask into an inpainting mask, derive Canny conditioning,
and composite a worker result back into the source image.
"""

from __future__ import annotations

import hashlib

import numpy as np
from PIL import Image, ImageFilter

from predict.damage_classes import DamageCode

_SEED_MODULUS = 2**31


def _resize_mask(mask: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Normalize a mask to grayscale and resize it without inventing regions."""
    return mask.convert("L").resize(size, Image.Resampling.NEAREST)


def repair_mask(
    selection_mask: Image.Image,
    class_code: DamageCode,
    size: tuple[int, int] = (512, 512),
) -> Image.Image:
    """Resize the user's exact selection without class-dependent expansion."""
    if class_code not in ("ND", "SMD", "HVD", "TD"):
        raise ValueError(f"unsupported damage class: {class_code}")
    return _resize_mask(selection_mask, size)


def control_edges(
    image: Image.Image,
    mask: Image.Image,
    size: tuple[int, int] = (512, 512),
) -> Image.Image:
    """Return RGB Canny conditioning with edges removed inside ``mask``."""
    gray = image.convert("L").resize(size, Image.Resampling.LANCZOS)
    try:
        import cv2
    except ImportError as exc:
        raise RuntimeError("opencv_required") from exc

    edges = cv2.Canny(np.asarray(gray), 100, 200)

    repair_pixels = np.asarray(_resize_mask(mask, size), dtype=np.uint8) > 127
    edges = np.where(repair_pixels, 0, edges).astype(np.uint8)
    return Image.fromarray(edges, mode="L").convert("RGB")


def generation_seed(image_bytes: bytes, class_code: DamageCode, prompt: str) -> int:
    """Derive a stable 31-bit generation seed from all request inputs."""
    digest = hashlib.sha256(image_bytes + class_code.encode() + prompt.encode()).digest()
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
    resized_mask = _resize_mask(mask, source.size)
    blurred_mask = np.asarray(resized_mask.filter(ImageFilter.GaussianBlur(2)))
    # Feathering softens only the interior edge; never let alpha bleed beyond
    # the hard repair footprint into surrounding source pixels.
    footprint = np.asarray(resized_mask) > 0
    feathered = Image.fromarray(np.where(footprint, blurred_mask, 0).astype(np.uint8))
    return Image.composite(repaired, source, feathered)
