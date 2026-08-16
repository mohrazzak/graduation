"""Stage A (local) — zero-shot damage severity with CLIP. No API, no labels.

Robust to everything that blocked the API routes: runs locally, so no geo-block,
no billing, no provider availability. CLIP (a pretrained vision-language model)
scores the photo against a text description of each damage level and returns the
best match as a 0-5 level, a confidence, and the full six-class probability
vector — i.e. exactly the ``Prediction`` shape the app's predict() seam expects,
so this can drop into predict/model.py and replace the mock (MOCK_MODE=false).

    python -m repair.assess_clip <image.jpg>
"""

from __future__ import annotations

import functools
from io import BytesIO

from predict.interface import Prediction

# ViT-B/32 is small enough to run quickly on CPU while still classifying the
# coarse damage distinctions well. Swap to clip-vit-large-patch14 for more accuracy.
MODEL_ID = "openai/clip-vit-base-patch32"

# A prompt ENSEMBLE per damage level (0-5): averaging several phrasings per class
# makes zero-shot CLIP markedly more stable than any single template.
_LEVEL_PROMPTS: dict[int, list[str]] = {
    0: ["an intact undamaged building", "a building in good condition with no damage"],
    1: ["a building with minor damage", "a building with small cracks and a few broken windows"],
    2: [
        "a building with moderate damage",
        "a damaged building with several broken windows and cracked walls",
    ],
    3: ["a severely damaged building", "a building with large holes and heavy structural damage"],
    4: ["a partially collapsed building", "a building with a collapsed floor or section"],
    5: ["a completely destroyed building reduced to rubble", "the rubble of a demolished building"],
}


def _flatten() -> tuple[list[str], list[int]]:
    """All ensemble phrases and the damage level each one belongs to."""
    phrases: list[str] = []
    owners: list[int] = []
    for level, options in _LEVEL_PROMPTS.items():
        phrases.extend(options)
        owners.extend([level] * len(options))
    return phrases, owners


@functools.lru_cache(maxsize=1)
def _pipe():  # noqa: ANN202 - returns a heavyweight transformers pipeline
    """Load the zero-shot image-classification pipeline once (version-robust)."""
    from transformers import pipeline

    return pipeline("zero-shot-image-classification", model=MODEL_ID)


def classify(image_bytes: bytes) -> Prediction:
    """Zero-shot classify building damage into a 0-5 Prediction (heatmap=None).

    The pipeline softmaxes over every ensemble phrase; summing the phrases that
    belong to a level marginalizes them into that level's probability.
    """
    from PIL import Image

    phrases, owners = _flatten()
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    results = _pipe()(image, candidate_labels=phrases)

    score_by_phrase = {r["label"]: r["score"] for r in results}
    probabilities = [0.0] * 6
    for phrase, level in zip(phrases, owners, strict=True):
        probabilities[level] += score_by_phrase.get(phrase, 0.0)

    total = sum(probabilities) or 1.0
    probabilities = [p / total for p in probabilities]
    level = max(range(6), key=probabilities.__getitem__)
    return Prediction(
        level=level,
        confidence=probabilities[level],
        probabilities=probabilities,
        heatmap_base64=None,
    )


def _main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Zero-shot CLIP damage classifier.")
    parser.add_argument("image", help="path to the building photo")
    args = parser.parse_args()

    with open(args.image, "rb") as f:
        pred = classify(f.read())
    print(f"level {pred.level}  (confidence {pred.confidence:.0%})")
    print("probabilities:", [f"{p:.2f}" for p in pred.probabilities])


if __name__ == "__main__":
    _main()
