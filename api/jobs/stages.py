"""The local, free stages of the restoration pipeline.

Everything here runs on this machine with no API key and no quota: the building
mask, the edge map, and the change overlay. They are what the interactive canvas
displays beside the photo — genuine model output, not decoration.

Only the generation stage (jobs/repair.py) calls a paid/quota'd service.

The mask approach is ported from the team's image_to_isolated.py: semantic
segmentation is the right prior because a salient-object model locks onto one
dominant subject, which is wrong for both a wide scene and a facade that fills
the frame. Classical cues back it up so the stage still works offline.
"""

from __future__ import annotations

import functools
from io import BytesIO

import numpy as np
from PIL import Image, ImageFilter, ImageOps

# Longest side used while analysing. The mask is computed here and upsampled.
ANALYSIS_MAX_SIDE = 1024

# ADE20K-trained segmenter. b0 is the small variant — enough to separate a
# building from sky/road/vegetation, and it loads in seconds on CPU.
SEGMENTATION_MODEL = "nvidia/segformer-b0-finetuned-ade-512-512"

# ADE20K class ids that are scenery rather than built structure. The mask is
# built by SUBTRACTION — keep everything that is not recognisable scenery — so
# structure the model mislabels (common on a collapsed building, where interiors
# are exposed) still survives.
BACKGROUND_CLASS_IDS = frozenset(
    {2, 4, 6, 9, 11, 12, 13, 16, 17, 20, 21, 26, 27, 46, 48, 52, 53, 60, 61, 91, 94, 109, 128}
)


def _to_png(image: Image.Image) -> bytes:
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def load_rgb(image_bytes: bytes) -> Image.Image:
    """Decode upload bytes to RGB."""
    return Image.open(BytesIO(image_bytes)).convert("RGB")


@functools.lru_cache(maxsize=1)
def _segmenter():  # noqa: ANN202 - heavyweight transformers pipeline
    """Load the segmentation pipeline once, or return None when unavailable."""
    try:
        from transformers import pipeline

        return pipeline("image-segmentation", model=SEGMENTATION_MODEL)
    except Exception:  # noqa: BLE001 - no network, no weights, no torch: all "no prior"
        return None


def building_mask(image: Image.Image) -> Image.Image:
    """Return an 'L' mask where white is building and black is scenery.

    Uses semantic segmentation when it loads, and falls back to a classical
    structural-energy cue (facades are dense with window/floor/rubble edges;
    sky, sand and asphalt are flat) so the stage never hard-fails.
    """
    work = image.copy()
    work.thumbnail((ANALYSIS_MAX_SIDE, ANALYSIS_MAX_SIDE))

    segmenter = _segmenter()
    if segmenter is not None:
        try:
            mask = np.zeros((work.height, work.width), dtype=bool)
            for segment in segmenter(work):
                label = str(segment.get("label", "")).lower()
                is_scenery = any(
                    word in label
                    for word in ("sky", "tree", "road", "grass", "earth", "water",
                                 "sidewalk", "person", "car", "plant", "mountain", "sand")
                )
                if is_scenery:
                    continue
                piece = np.array(segment["mask"].convert("L")) > 127
                mask |= piece
            if mask.any():
                out = Image.fromarray((mask * 255).astype(np.uint8), mode="L")
                return out.resize(image.size, Image.LANCZOS).filter(
                    ImageFilter.GaussianBlur(2)
                )
        except Exception:  # noqa: BLE001 - fall through to the classical cue
            pass

    # Classical fallback: local edge density, stretched and thresholded.
    energy = work.convert("L").filter(ImageFilter.FIND_EDGES)
    energy = energy.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(6))
    energy = ImageOps.autocontrast(energy, cutoff=2)
    array = np.array(energy)
    mask = (array > max(int(array.mean()), 24)).astype(np.uint8) * 255
    return Image.fromarray(mask, mode="L").resize(image.size, Image.LANCZOS)


def canny_edges(image: Image.Image, mask: Image.Image | None = None) -> Image.Image:
    """Return an RGB edge map, restricted to the building when a mask is given.

    Uses OpenCV's Canny when available. Without it, falls back to a Sobel-style
    filter — a different operator, so the stage label says "edge map" rather
    than claiming Canny it did not run.
    """
    gray = image.convert("L")
    try:
        import cv2

        array = np.array(gray)
        blurred = cv2.GaussianBlur(array, (5, 5), 1.4)
        edges = cv2.Canny(blurred, 60, 160)
    except ImportError:
        edges = np.array(gray.filter(ImageFilter.FIND_EDGES).point(lambda v: 255 if v > 40 else 0))

    if mask is not None:
        edges = np.where(np.array(mask.resize(image.size)) > 127, edges, 0)
    return Image.fromarray(edges.astype(np.uint8), mode="L").convert("RGB")


def masked_preview(image: Image.Image, mask: Image.Image) -> Image.Image:
    """The photo with scenery dimmed — how the mask reads to a human."""
    dimmed = Image.blend(image, Image.new("RGB", image.size, (12, 12, 14)), 0.82)
    return Image.composite(image, dimmed, mask.resize(image.size))


def mask_png(image: Image.Image) -> tuple[bytes, Image.Image]:
    """Building mask as a PNG, plus the mask itself for downstream stages."""
    mask = building_mask(image)
    return _to_png(masked_preview(image, mask)), mask


def edges_png(image: Image.Image, mask: Image.Image) -> bytes:
    """Edge map as a PNG."""
    return _to_png(canny_edges(image, mask))


def has_segmenter() -> bool:
    """Whether the real semantic segmenter loaded.

    Callers that need a silhouette (the 3D subject matte) must check this: the
    classical fallback in `building_mask` is an edge-energy cue, which is a fine
    seed for a human to edit but is NOT a building outline.
    """
    return _segmenter() is not None


def has_canny() -> bool:
    """Whether real Canny is available, so the UI can label the stage honestly."""
    try:
        import cv2  # noqa: F401

        return True
    except ImportError:
        return False
