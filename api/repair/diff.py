"""Stage D — the 'draw': what changed between destruction and repair.

Given the original damaged photo and the repaired one, highlight the regions the
repair touched (rebuilt walls, replaced windows, cleared rubble) so the demo can
show *where* the work is, not just a before/after pair. Pure Pillow, no key.

    change_overlay  -> original with repaired regions tinted in the hazard color
    triptych        -> before | after | change-overlay, side by side (one slide)
"""

from __future__ import annotations

from io import BytesIO

from PIL import Image, ImageChops, ImageOps

# Hazard accent from the design system (CLAUDE.md palette) so the highlight reads
# as "inspection markup" and matches the rest of the instrument.
_HAZARD = (255, 176, 0)


def _load(image_bytes: bytes) -> Image.Image:
    """Decode bytes to RGB."""
    return Image.open(BytesIO(image_bytes)).convert("RGB")


def _change_mask(original: Image.Image, repaired: Image.Image) -> Image.Image:
    """Grayscale magnitude-of-change mask (bright = more repaired)."""
    aligned = repaired.resize(original.size)
    diff = ImageChops.difference(original, aligned).convert("L")
    # Stretch contrast so faint-but-real edits register and JPEG noise stays dark.
    return ImageOps.autocontrast(diff, cutoff=2)


def _to_png(image: Image.Image) -> bytes:
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def change_overlay(original_bytes: bytes, repaired_bytes: bytes) -> bytes:
    """Return PNG of the original with repaired regions tinted in hazard color."""
    original = _load(original_bytes)
    repaired = _load(repaired_bytes)
    mask = _change_mask(original, repaired)

    tint = Image.new("RGB", original.size, _HAZARD)
    # Half-strength tint, applied only where the mask says something changed.
    tinted = Image.blend(original, tint, 0.5)
    return _to_png(Image.composite(tinted, original, mask))


def triptych(original_bytes: bytes, repaired_bytes: bytes, gap: int = 8) -> bytes:
    """Return PNG of before | after | change-overlay laid out for one slide."""
    original = _load(original_bytes)
    repaired = _load(repaired_bytes).resize(original.size)
    overlay = _load(change_overlay(original_bytes, repaired_bytes))

    w, h = original.size
    canvas = Image.new("RGB", (w * 3 + gap * 2, h), (12, 12, 14))  # bg #0C0C0E
    for i, panel in enumerate((original, repaired, overlay)):
        canvas.paste(panel, ((w + gap) * i, 0))
    return _to_png(canvas)
