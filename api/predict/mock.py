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
        heatmap_base64=_heatmap_png_base64(rng),
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


def _heatmap_png_base64(rng: random.Random) -> str:
    """Render a soft radial blob (red core -> yellow -> transparent) as a base64 PNG."""
    image = Image.new("RGBA", (_HEATMAP_SIZE, _HEATMAP_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    # Jitter the center within the middle third so heatmaps differ per image
    # while staying plausibly "on the building".
    third = _HEATMAP_SIZE // 3
    center_x = rng.randint(third, 2 * third)
    center_y = rng.randint(third, 2 * third)
    radius = rng.randint(60, 90)
    # Concentric 1px rings from transparent yellow rim to opaque red core;
    # the Gaussian blur then melts the steps into a smooth radial falloff.
    for r in range(radius, 0, -1):
        t = r / radius
        color = (255, int(200 * t), 0, int(220 * (1.0 - t)))
        draw.ellipse((center_x - r, center_y - r, center_x + r, center_y + r), fill=color)
    image = image.filter(ImageFilter.GaussianBlur(radius=6))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")
