"""Deterministic mock predictor: hash-seeded RNG so the same photo always
returns the same level, scores, and heatmap (feels real in demos)."""

import base64
import hashlib
import io
import random

from PIL import Image, ImageDraw, ImageFilter

from predict.interface import Prediction

_NUM_LEVELS = 6
_HEATMAP_SIZE = 224
_GRID = 14  # heatmap canvas scored as 14x14 cells (16px each)
_TOP_CELLS = 8  # candidate pool of busiest cells blobs may anchor on
_MIN_EDGE_SCORE = 12  # below this a cell counts as featureless


def predict(data: bytes) -> Prediction:
    """Return a plausible, fully deterministic Prediction for the image bytes."""
    # Hash-derived seed: identical bytes -> identical RNG stream -> identical result.
    seed = int.from_bytes(hashlib.sha256(data).digest()[:8], "big")
    rng = random.Random(seed)
    level = rng.randint(0, _NUM_LEVELS - 1)
    probabilities = _probability_vector(rng, level)
    return Prediction(
        level=level,
        confidence=probabilities[level],
        probabilities=probabilities,
        heatmap_base64=_heatmap_png_base64(rng, data),
    )


def _probability_vector(rng: random.Random, level: int) -> list[float]:
    """Build six probabilities summing to 1.0 with `level` as the dominant class."""
    dominant = rng.uniform(0.6, 0.95)
    # Weight floor keeps every class visibly non-zero and the division safe;
    # each remainder share is <= 0.4, so argmax provably stays at `level`.
    weights = [rng.uniform(0.05, 1.0) for _ in range(_NUM_LEVELS - 1)]
    total = sum(weights)
    remainder = 1.0 - dominant
    shares = iter(remainder * weight / total for weight in weights)
    return [dominant if i == level else next(shares) for i in range(_NUM_LEVELS)]


def _heatmap_png_base64(rng: random.Random, data: bytes) -> str:
    """Render Grad-CAM-style blobs anchored on the photo's busiest regions."""
    image = Image.new("RGBA", (_HEATMAP_SIZE, _HEATMAP_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for center_x, center_y, radius, peak in _blob_params(rng, data):
        # Concentric 1px rings from transparent yellow rim to opaque red core;
        # the Gaussian blur then melts the steps into a smooth radial falloff.
        for r in range(radius, 0, -1):
            t = r / radius
            color = (255, int(200 * t), 0, int(peak * (1.0 - t)))
            draw.ellipse((center_x - r, center_y - r, center_x + r, center_y + r), fill=color)
    image = image.filter(ImageFilter.GaussianBlur(radius=6))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def _blob_params(rng: random.Random, data: bytes) -> list[tuple[int, int, int, int]]:
    """(x, y, radius, peak_alpha) per blob, anchored on edge-dense cells."""
    cells = _busiest_cells(data)
    if cells:
        cell_px = _HEATMAP_SIZE // _GRID
        chosen = rng.sample(cells, min(rng.randint(2, 3), len(cells)))
        return [
            (
                x * cell_px + cell_px // 2 + rng.randint(-4, 4),
                y * cell_px + cell_px // 2 + rng.randint(-4, 4),
                rng.randint(36, 64),
                rng.randint(160, 220),
            )
            for x, y in chosen
        ]
    # Undecodable or featureless photo: fall back to one centered blob so the
    # response shape never changes.
    third = _HEATMAP_SIZE // 3
    center = (rng.randint(third, 2 * third), rng.randint(third, 2 * third))
    return [(*center, rng.randint(60, 90), 220)]


def _busiest_cells(data: bytes) -> list[tuple[int, int]]:
    """Top grid cells by edge energy (raster-stable order); [] if flat/undecodable."""
    try:
        photo = Image.open(io.BytesIO(data)).convert("L")
    except OSError:
        return []
    # Square resize mirrors how the frontend stretches the square heatmap over
    # the photo, so cell coordinates line up with what the user sees on screen.
    # FIND_EDGES runs BEFORE the cell average so fine crack texture survives;
    # its unfiltered 1px border (raw luminance) is cropped or bright photos
    # would score phantom edges along the frame.
    edges = (
        photo.resize((_HEATMAP_SIZE, _HEATMAP_SIZE))
        .filter(ImageFilter.FIND_EDGES)
        .crop((1, 1, _HEATMAP_SIZE - 1, _HEATMAP_SIZE - 1))
    )
    scores = edges.resize((_GRID, _GRID), Image.Resampling.BOX).tobytes()
    ranked = sorted(range(len(scores)), key=lambda i: (-scores[i], i))
    top = [i for i in ranked[:_TOP_CELLS] if scores[i] > _MIN_EDGE_SCORE]
    return [(i % _GRID, i // _GRID) for i in top]
