"""Stage B — the 'after repair' image.

Edits a damaged-building photo into a plausible *restored* version using
Google's Gemini 2.5 Flash Image model ("Nano Banana"). This is instruction-based
image EDITING, not generation from scratch — the model keeps the same building,
viewpoint and surroundings while removing the damage, which is exactly what an
"after repair" visualization needs (and what a generic text-to-image model gets
wrong by inventing a different building).

No training required. Set GEMINI_API_KEY (free key from https://aistudio.google.com)
and run:  python -m repair.generate <input.jpg> <output.png> [--level 0-5]
"""

from __future__ import annotations

import os
from io import BytesIO

# The Gemini image-editing model. "Nano Banana" is its nickname; keep the id in
# one place so a newer image model is a one-line swap.
MODEL = "gemini-2.5-flash-image"

# Damage level (Stage A output, 0-5) -> how much freedom the edit gets. Light
# damage is a touch-up (preserve almost everything); a collapse is a conceptual
# reconstruction, so the instruction explicitly grants more latitude. This is
# the seam where the classifier feeds the repair — honest to state at the defense.
_LEVEL_GUIDANCE = {
    0: "The building is already intact; only clean minor blemishes.",
    1: "Repair minor surface damage: small cracks, chipped paint, stained walls.",
    2: "Repair moderate damage: cracked walls, a few broken windows, debris on the ground.",
    3: "Repair severe damage: large wall cracks and holes, many broken windows, scorch marks.",
    4: "Reconstruct the partially collapsed sections, rebuilding walls and "
    "floors that are missing.",
    5: "Reconstruct the building from near-total destruction, inferring its "
    "original form from what remains and the surroundings.",
}

_BASE_INSTRUCTION = (
    "You are an architectural restoration visualizer. Edit this photograph of a "
    "war-damaged building to show the SAME building fully repaired and restored. "
    "Rebuild damaged or collapsed walls, replace broken or missing windows and "
    "doors, remove rubble, debris, scorch marks, smoke and graffiti, and return "
    "the facade to a clean, structurally sound condition. Keep the same building, "
    "the same architectural style, the same camera viewpoint, and the same "
    "surroundings and lighting. Produce a single photorealistic image."
)


def build_prompt(level: int | None) -> str:
    """Compose the repair instruction, tailored by damage level when known."""
    if level is None:
        return _BASE_INSTRUCTION
    return f"{_BASE_INSTRUCTION} {_LEVEL_GUIDANCE.get(level, '')}".strip()


def repair_image(image_bytes: bytes, *, level: int | None = None) -> bytes:
    """Return PNG bytes of the repaired building, edited from the input photo.

    Args:
        image_bytes: the original damaged-building photo (jpeg/png/webp).
        level: optional 0-5 damage level from Stage A; tunes the instruction.

    Raises:
        RuntimeError: if GEMINI_API_KEY is unset or the model returns no image.
    """
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com "
            "and export GEMINI_API_KEY=... before running."
        )

    # Imported lazily so the rest of the API (mock mode) never needs this dep.
    from google import genai
    from PIL import Image

    client = genai.Client(api_key=api_key)
    source = Image.open(BytesIO(image_bytes))

    response = client.models.generate_content(
        model=MODEL,
        contents=[build_prompt(level), source],
    )

    for part in response.candidates[0].content.parts:
        if part.inline_data is not None:
            return part.inline_data.data

    # No image part means the model refused or only returned text — surface why.
    text = next(
        (p.text for p in response.candidates[0].content.parts if p.text),
        "(no text returned)",
    )
    raise RuntimeError(f"Gemini returned no image. Model said: {text}")


def _main() -> None:
    """CLI: python -m repair.generate <input> <output> [--level N]."""
    import argparse

    parser = argparse.ArgumentParser(description="Generate a repaired-building image.")
    parser.add_argument("input", help="path to the damaged-building photo")
    parser.add_argument("output", help="path to write the repaired PNG")
    parser.add_argument("--level", type=int, default=None, help="damage level 0-5")
    args = parser.parse_args()

    with open(args.input, "rb") as f:
        repaired = repair_image(f.read(), level=args.level)
    with open(args.output, "wb") as f:
        f.write(repaired)
    print(f"Repaired image written to {args.output}")


if __name__ == "__main__":
    _main()
