"""Stage A — damage severity, via Gemini multimodal assessment (no training).

With the local labels dropped, severity comes from a foundation model instead of
a trained CNN: Gemini reads the photo and returns a structured 0-5 assessment plus
a rough building-size estimate, which lets Stage C (cost) run automatically from a
single image. Text/JSON output is on the Gemini FREE tier (only image *generation*
is billed), so this runs at no cost.

    GEMINI_API_KEY=... python -m repair.assess <image.jpg>
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from io import BytesIO

from pydantic import BaseModel

# Text/vision model (free tier); distinct from the billed image-generation model.
MODEL = "gemini-2.5-flash"

# The six-level scale is the project's single source of truth (CLAUDE.md / levels.ts).
_SCALE = (
    "0 = intact (no visible damage); "
    "1 = minor (surface cracks, chipped render, broken glass); "
    "2 = moderate (cracked walls, several broken windows, some debris); "
    "3 = severe (large wall holes, many broken openings, scorch marks); "
    "4 = partial collapse (a section of the structure has fallen); "
    "5 = total destruction (mostly rubble)."
)

_PROMPT = (
    "You are a structural-damage assessor inspecting a building photograph. "
    f"Classify the damage on this 0-5 scale: {_SCALE} "
    "Then roughly estimate the building's size from the image. Respond ONLY with "
    "the requested JSON: the level (0-5), your confidence (0-1), a one-sentence "
    "rationale, the visible number of floors, and the approximate footprint area "
    "in square meters."
)


class _DamageJSON(BaseModel):
    """Schema Gemini fills in (structured output)."""

    level: int
    confidence: float
    rationale: str
    estimated_floors: int
    estimated_footprint_m2: float


@dataclass
class Assessment:
    """A damage assessment plus the derived affected floor area for costing."""

    level: int
    confidence: float
    rationale: str
    affected_area_m2: float

    def summary(self) -> str:
        return f"level {self.level} (conf {self.confidence:.0%}) — {self.rationale}"


def assess_damage(image_bytes: bytes, *, model: str = MODEL) -> Assessment:
    """Assess building damage from a photo. Returns level, confidence and area.

    Raises:
        RuntimeError: if GEMINI_API_KEY is unset.
    """
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set (see repair/generate.py).")

    from google import genai
    from google.genai import types
    from PIL import Image

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=model,
        contents=[_PROMPT, Image.open(BytesIO(image_bytes))],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_DamageJSON,
        ),
    )

    data = response.parsed
    if data is None:  # fall back to raw-text JSON if the SDK didn't auto-parse
        data = _DamageJSON(**json.loads(response.text))

    level = max(0, min(5, data.level))  # clamp to the valid scale
    area = max(1.0, data.estimated_floors * data.estimated_footprint_m2)
    return Assessment(
        level=level,
        confidence=data.confidence,
        rationale=data.rationale,
        affected_area_m2=area,
    )


def _main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Assess building damage from a photo.")
    parser.add_argument("image", help="path to the building photo")
    args = parser.parse_args()

    with open(args.image, "rb") as f:
        a = assess_damage(f.read())
    print(a.summary())
    print(f"affected area ≈ {a.affected_area_m2:,.0f} m²")


if __name__ == "__main__":
    _main()
