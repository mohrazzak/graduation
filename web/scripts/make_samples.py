"""Generate the six demo sample JPEGs (web/public/samples/level-{0..5}.jpg).

Each file is a 640x480 concrete-toned placeholder whose damage cues scale with
its level, and — critically — whose exact bytes are verified to land on that
level when run through the mock predictor. SampleStrip fetches these exact
bytes and POSTs them to /predict, so demo-day samples must classify as labeled.

Usage (must run with the api venv so Pillow + the predictor match production):

    cd api && .venv/bin/python ../web/scripts/make_samples.py
"""

import io
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

_SCRIPT = Path(__file__).resolve()
_REPO_ROOT = _SCRIPT.parents[2]
# The mock predictor imports "predict.interface", so the api dir itself (the
# package parent) must be importable regardless of the caller's cwd.
sys.path.insert(0, str(_REPO_ROOT / "api"))

from predict.mock import predict  # noqa: E402

WIDTH, HEIGHT = 640, 480
OUT_DIR = _REPO_ROOT / "web" / "public" / "samples"
JPEG_QUALITY = 90
# Levels are uniform 1/6 per distinct byte stream, so ~6 attempts on average;
# this bound exists only to fail loudly instead of looping forever.
MAX_ATTEMPTS = 100_000


def build_base(level: int) -> Image.Image:
    """Draw the level's placeholder: concrete base, cracks/rubble scaled by level."""
    rng = random.Random(level)  # deterministic art per level (salt handles bytes)
    shade = 64 - level * 4  # heavier damage reads darker and dustier
    image = Image.new("RGB", (WIDTH, HEIGHT), (shade, shade, shade + 2))
    draw = ImageDraw.Draw(image)

    # Speckle noise so the surface reads as concrete, not flat fill.
    for _ in range(4000):
        x, y = rng.randrange(WIDTH), rng.randrange(HEIGHT)
        g = rng.randint(shade - 12, shade + 14)
        draw.point((x, y), fill=(g, g, g + 2))

    # Faint panel joints — a precast facade grid.
    for x in range(0, WIDTH, 160):
        draw.line([(x, 0), (x, HEIGHT)], fill=(shade - 16, shade - 16, shade - 14), width=2)
    for y in range(0, HEIGHT, 120):
        draw.line([(0, y), (WIDTH, y)], fill=(shade - 16, shade - 16, shade - 14), width=2)

    # Jagged cracks: count and width grow with level (level 0 stays intact).
    for _ in range(level * 4):
        x, y = rng.randrange(WIDTH), rng.randrange(HEIGHT // 3)
        points = [(x, y)]
        for _ in range(rng.randint(6, 12)):
            x += rng.randint(-30, 30)
            y += rng.randint(10, 50)
            points.append((x, y))
        draw.line(points, fill=(24, 24, 26), width=1 + level // 2)

    # Rubble blotches along the bottom for the collapse levels (3+).
    for _ in range(max(0, level - 2) * 12):
        x = rng.randrange(WIDTH)
        y = rng.randrange(HEIGHT // 2, HEIGHT)
        r = rng.randint(6, 24)
        g = rng.randint(28, 52)
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(g, g - 2, g - 2))

    label = f"L{level}"
    font = ImageFont.load_default(size=48)
    draw.text((26, 26), label, font=font, fill=(20, 20, 22))  # offset shadow
    draw.text((24, 24), label, font=font, fill=(237, 237, 239))
    return image


def encode_with_salt(base: Image.Image, salt: int) -> bytes:
    """Encode to JPEG with a salt-derived corner patch perturbing the bytes.

    A 6x6 block (not one pixel) so JPEG quantization cannot erase the change
    between attempts.
    """
    salted = base.copy()
    draw = ImageDraw.Draw(salted)
    color = ((salt * 7) % 256, (salt * 13) % 256, (salt * 29) % 256)
    draw.rectangle((WIDTH - 7, HEIGHT - 7, WIDTH - 2, HEIGHT - 2), fill=color)
    buffer = io.BytesIO()
    salted.save(buffer, format="JPEG", quality=JPEG_QUALITY)
    return buffer.getvalue()


def make_sample(level: int) -> Path:
    """Search salts until the encoded bytes classify as `level`, then save."""
    base = build_base(level)
    for salt in range(MAX_ATTEMPTS):
        data = encode_with_salt(base, salt)
        if predict(data).level == level:
            path = OUT_DIR / f"level-{level}.jpg"
            path.write_bytes(data)
            # Re-verify the exact bytes that landed on disk — what the
            # SampleStrip will fetch and POST on demo day.
            saved_level = predict(path.read_bytes()).level
            if saved_level != level:
                raise RuntimeError(f"{path.name}: saved bytes classify as {saved_level}")
            print(f"{path.name}: verified level {saved_level} (salt {salt})")
            return path
    raise RuntimeError(f"level {level}: no salt found in {MAX_ATTEMPTS} attempts")


def main() -> None:
    """Generate and verify all six samples."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for level in range(6):
        make_sample(level)


if __name__ == "__main__":
    main()
