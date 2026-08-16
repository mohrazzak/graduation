"""Stage B (alternate backend) — repair via Hugging Face instruction editing.

A free-token alternative to the Gemini backend in ``generate.py``. Uses
FLUX.1-Kontext-dev (instruction image editing) through the HF Inference router.

Two caveats learned the hard way, both worth stating at the defense:
  * HF free accounts get only a small monthly inference credit (~3-4 edits);
    past that the router returns 402 Payment Required (the model runs on a paid
    provider). Set HF_TOKEN and use sparingly, or fund a few dollars of credit.
  * Kontext is conservative — excellent for MODERATE damage (cracks, broken
    windows, debris) but it will not reconstruct a near-totally-collapsed
    building. For severe levels (4-5) prefer the Gemini backend.

Run:  HF_TOKEN=hf_... python -m repair.generate_hf <input.jpg> <output.png>
"""

from __future__ import annotations

import os
from io import BytesIO

MODEL = "black-forest-labs/FLUX.1-Kontext-dev"

# Directive, result-focused instruction. The "matte / muted / not glossy" tail is
# what keeps the output looking like a real photograph instead of a shiny render.
DEFAULT_PROMPT = (
    "Completely repair this damaged building into a fully intact, undamaged "
    "version of itself. Rebuild broken and collapsed brick walls flush and solid, "
    "fit every window opening with clean intact glass, restore the roof and "
    "balconies, and clear all rubble and debris from the ground. Keep the same "
    "building footprint, the same brick and plaster materials, the same camera "
    "angle and the same soft natural daylight. Realistic documentary photograph, "
    "matte surfaces, muted natural color — not glossy, not glowing, not "
    "oversaturated, not a 3D render."
)


def repair_image_hf(
    image_bytes: bytes,
    *,
    prompt: str = DEFAULT_PROMPT,
    guidance_scale: float = 4.0,
    steps: int = 30,
) -> bytes:
    """Return PNG bytes of the repaired building via FLUX.1-Kontext on HF.

    Raises:
        RuntimeError: if HF_TOKEN is unset.
    """
    token = os.environ.get("HF_TOKEN", "").strip()
    if not token:
        raise RuntimeError(
            "HF_TOKEN is not set. Create a free token at "
            "https://huggingface.co/settings/tokens and export HF_TOKEN=..."
        )

    from huggingface_hub import InferenceClient

    client = InferenceClient(api_key=token)
    result = client.image_to_image(
        image_bytes,
        prompt=prompt,
        model=MODEL,
        guidance_scale=guidance_scale,
        num_inference_steps=steps,
    )
    buffer = BytesIO()
    result.save(buffer, format="PNG")
    return buffer.getvalue()


def _main() -> None:
    """CLI: HF_TOKEN=... python -m repair.generate_hf <input> <output>."""
    import argparse

    parser = argparse.ArgumentParser(description="Repair a building via HF FLUX Kontext.")
    parser.add_argument("input", help="path to the damaged-building photo")
    parser.add_argument("output", help="path to write the repaired PNG")
    parser.add_argument("--guidance", type=float, default=4.0)
    parser.add_argument("--steps", type=int, default=30)
    args = parser.parse_args()

    with open(args.input, "rb") as f:
        repaired = repair_image_hf(f.read(), guidance_scale=args.guidance, steps=args.steps)
    with open(args.output, "wb") as f:
        f.write(repaired)
    print(f"Repaired image written to {args.output}")


if __name__ == "__main__":
    _main()
