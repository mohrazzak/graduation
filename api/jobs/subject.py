"""Isolate the damaged building before it is uploaded for 3D reconstruction.

Tripo's `image_to_model` picks ONE dominant subject by itself, and the pinned
`v2.5-20250123` exposes no flag to disable or steer that choice. Uploading a
wide street photo therefore reconstructs whatever Tripo judges most
object-like — a lamp post, a parked truck, a hallucinated blob — instead of the
building. The only lever left is the image we hand it, so the detector boxes and
the building mask are applied HERE, before the upload.

Everything in this module is local and quota-free: it is the same segmenter the
mask stage already runs, reused as a matte rather than as a drawing surface.
"""

from __future__ import annotations

from io import BytesIO

import numpy as np
from PIL import Image, ImageFilter

from jobs import stages
from predict.damage_classes import Box

# Detector boxes hug the facade; a little air keeps eaves and rubble in frame.
BOX_PAD_RATIO = 0.05

# Tripo's own guidance is that a pre-isolated subject must be centered and fill
# more than 70% of the width or height, so the margin stays deliberately thin.
CANVAS_MARGIN_RATIO = 0.06

# A matte is only trustworthy in the middle of this band. Above it the mask is
# effectively all-white and mattes nothing, so the crop alone is more honest.
#
# The floor is set by total collapse: on `sample-TD.jpg` the segmenter labels
# most of the rubble field as ground and keeps 0.185, which would upload a
# fragment of the site instead of the site. Every other measured case sits at
# 0.49 or above, so 0.30 rejects that failure and only that failure.
MIN_MATTE_COVERAGE = 0.30
MAX_MATTE_COVERAGE = 0.95

# Tripo accepts far larger, but a bigger upload buys no detail on a 4-8 MP photo.
MAX_SUBJECT_SIDE = 2048

_MATTE_FEATHER_RADIUS = 1.0


class SubjectPreparationError(RuntimeError):
    """Raised when the source image cannot be turned into a subject cut-out."""


def union_box(boxes: list[Box]) -> Box | None:
    """The smallest box containing every given box, or None when there are none.

    A union is used rather than the most-severe detection because a building can
    be split across several boxes: keeping only one would crop away structure the
    detector did find.
    """
    if not boxes:
        return None
    return Box(
        x1=min(box.x1 for box in boxes),
        y1=min(box.y1 for box in boxes),
        x2=max(box.x2 for box in boxes),
        y2=max(box.y2 for box in boxes),
    )


def parse_boxes(raw: object) -> list[Box]:
    """Read normalized boxes from decoded JSON, dropping any that are malformed.

    A bad box means a worse crop, never a failed reconstruction, so this filters
    instead of raising: the run still happens on the full frame.
    """
    if not isinstance(raw, list):
        return []
    boxes: list[Box] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        try:
            boxes.append(
                Box(
                    x1=float(entry["x1"]),
                    y1=float(entry["y1"]),
                    x2=float(entry["x2"]),
                    y2=float(entry["y2"]),
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return [box for box in boxes if box.x2 > box.x1 and box.y2 > box.y1]


def _padded_crop(size: tuple[int, int], box: Box | None) -> tuple[int, int, int, int]:
    """Pixel crop rectangle for a normalized box, padded and clamped to the image."""
    width, height = size
    if box is None:
        return (0, 0, width, height)
    pad_x = (box.x2 - box.x1) * BOX_PAD_RATIO
    pad_y = (box.y2 - box.y1) * BOX_PAD_RATIO
    left = int(max(0.0, box.x1 - pad_x) * width)
    top = int(max(0.0, box.y1 - pad_y) * height)
    right = int(min(1.0, box.x2 + pad_x) * width)
    bottom = int(min(1.0, box.y2 + pad_y) * height)
    if right - left < 2 or bottom - top < 2:
        return (0, 0, width, height)
    return (left, top, right, bottom)


def _matte_for(crop: Image.Image, selection: Image.Image | None) -> Image.Image | None:
    """The alpha to cut the subject out with, or None when none is trustworthy.

    A selection the user drew is authoritative; it arrives already cropped to the
    same window as `crop`. Otherwise the segmenter runs, and only a mask inside
    the coverage band is used: `building_mask` degrades to an edge-energy cue
    when transformers is missing, and that cue is a texture map, not a
    silhouette — it would punch holes through flat facades.
    """
    if selection is not None:
        mask = selection
    elif stages.has_segmenter():
        mask = stages.building_mask(crop)
    else:
        return None

    coverage = float((np.array(mask) > 127).mean())
    if not MIN_MATTE_COVERAGE <= coverage <= MAX_MATTE_COVERAGE:
        return None
    return mask


def _tighten(crop: Image.Image, matte: Image.Image) -> tuple[Image.Image, Image.Image]:
    """Trim both image and matte to the matte's own bounding box."""
    rows, columns = np.where(np.array(matte) > 127)
    if rows.size == 0:
        return crop, matte
    window = (
        int(columns.min()),
        int(rows.min()),
        int(columns.max()) + 1,
        int(rows.max()) + 1,
    )
    return crop.crop(window), matte.crop(window)


def prepare_subject(
    image_bytes: bytes,
    boxes: list[Box] | None = None,
    selection_png: bytes | None = None,
) -> bytes:
    """Return an RGBA PNG holding only the building, centered on a clear ground.

    Args:
        image_bytes: the source photo, or a repaired render of the same frame.
        boxes: detector boxes in the source frame; their union bounds the crop.
        selection_png: an optional user-drawn mask, which overrides the segmenter.

    Raises:
        SubjectPreparationError: the source could not be decoded.
    """
    try:
        image = stages.load_rgb(image_bytes)
    except Exception as exc:  # noqa: BLE001 - any decode failure is the same story
        raise SubjectPreparationError("invalid_image") from exc

    selection: Image.Image | None = None
    if selection_png:
        try:
            with Image.open(BytesIO(selection_png)) as opened:
                candidate = opened.convert("L")
        except Exception:  # noqa: BLE001 - an unreadable selection is simply absent
            candidate = None
        # A selection is drawn over the whole photo, so a differently sized one
        # cannot be aligned: resizing it would matte the wrong pixels entirely.
        selection = candidate if candidate and candidate.size == image.size else None

    window = _padded_crop(image.size, union_box(boxes or []))
    crop = image.crop(window)
    # The selection is cropped with the SAME window, never resized to the crop:
    # its origin is the photo's corner, not the box's.
    matte = _matte_for(crop, selection.crop(window) if selection else None)
    if matte is None:
        # No trustworthy silhouette: the crop alone is still a better subject
        # than the full frame, and it never invents a hole in the building.
        matte = Image.new("L", crop.size, 255)
    else:
        crop, matte = _tighten(crop, matte)
        matte = matte.filter(ImageFilter.GaussianBlur(_MATTE_FEATHER_RADIUS))

    # White under the transparency, so a consumer that flattens the alpha still
    # sees a clean studio background rather than black fringing.
    margin = 1.0 + 2.0 * CANVAS_MARGIN_RATIO
    canvas_size = (int(crop.width * margin), int(crop.height * margin))
    canvas = Image.new("RGB", canvas_size, (255, 255, 255))
    alpha = Image.new("L", canvas_size, 0)
    offset = (
        (canvas_size[0] - crop.width) // 2,
        (canvas_size[1] - crop.height) // 2,
    )
    canvas.paste(crop, offset, matte)
    alpha.paste(matte, offset)

    subject = canvas.convert("RGBA")
    subject.putalpha(alpha)
    if max(subject.size) > MAX_SUBJECT_SIDE:
        subject.thumbnail((MAX_SUBJECT_SIDE, MAX_SUBJECT_SIDE), Image.LANCZOS)

    buffer = BytesIO()
    subject.save(buffer, format="PNG")
    return buffer.getvalue()
