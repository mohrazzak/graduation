"""Isolated CUDA/Diffusers worker for deterministic ControlNet inpainting.

Torch and Diffusers stay behind function boundaries so importing this module in
the base FastAPI environment cannot initialize either heavyweight runtime.
"""

from __future__ import annotations

import argparse
import importlib
import json
import sys
import warnings
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image

from predict.tiers import TierCode
from repair.controlnet_core import composite_generated, control_edges, repair_mask

CONTROLNET_MODEL_ID = "lllyasviel/sd-controlnet-canny"
CONTROLNET_REVISION = "7f2f69197050967007f6bbd23ab5e52f0384162a"
INPAINT_MODEL_ID = "stable-diffusion-v1-5/stable-diffusion-inpainting"
INPAINT_REVISION = "8a4288a76071f7280aedbdb3253bdb9e9d5d84bb"

_TARGET_SIZE = (512, 512)
_NEGATIVE_PROMPT = (
    "sloped roof, slanted roof, broken roof, ruins, cracks, damage, debris, "
    "hole, distorted architecture, blurry, transparent"
)
_MAX_REQUEST_BYTES = 64 * 1024
_MAX_PROMPT_CHARS = 4_000
_SEED_LIMIT = 2**31
_PROBE_PACKAGES = ("diffusers", "accelerate", "transformers", "safetensors", "cv2")

GeneratorFactory = Callable[[int], Any]
PipelineLoader = Callable[..., tuple[Any, GeneratorFactory]]


class WorkerError(RuntimeError):
    """A bounded worker failure suitable for stderr and subprocess mapping."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class WorkerRequest:
    input_path: Path
    mask_path: Path
    output_path: Path
    tier: TierCode
    prompt: str
    seed: int


def _fail(reason: str = "local_generation_failed") -> WorkerError:
    return WorkerError(reason)


def _owned_path(
    value: object,
    request_dir: Path,
    *,
    must_exist: bool,
) -> Path:
    if not isinstance(value, str) or not value:
        raise _fail()
    candidate = Path(value)
    if not candidate.is_absolute():
        raise _fail()
    try:
        resolved = candidate.resolve(strict=must_exist)
    except (OSError, RuntimeError, ValueError) as exc:
        raise _fail() from exc
    if not resolved.is_relative_to(request_dir):
        raise _fail()
    if must_exist:
        if not resolved.is_file():
            raise _fail()
    elif not resolved.parent.is_dir():
        raise _fail()
    return resolved


def _parse_request(request_path: Path) -> WorkerRequest:
    if not request_path.is_absolute():
        raise _fail()
    try:
        resolved_request = request_path.resolve(strict=True)
        if not resolved_request.is_file() or resolved_request.stat().st_size > _MAX_REQUEST_BYTES:
            raise _fail()
        payload = json.loads(resolved_request.read_text(encoding="utf-8"))
    except WorkerError:
        raise
    except (json.JSONDecodeError, OSError, UnicodeError, ValueError) as exc:
        raise _fail() from exc
    if not isinstance(payload, dict):
        raise _fail()

    request_dir = resolved_request.parent
    input_path = _owned_path(payload.get("input_path"), request_dir, must_exist=True)
    mask_path = _owned_path(payload.get("mask_path"), request_dir, must_exist=True)
    output_path = _owned_path(payload.get("output_path"), request_dir, must_exist=False)
    if len({input_path, mask_path, output_path, resolved_request}) != 4:
        raise _fail()

    tier = payload.get("tier")
    if tier not in ("NC", "PC", "GC"):
        raise _fail()
    prompt = payload.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > _MAX_PROMPT_CHARS:
        raise _fail()
    seed = payload.get("seed")
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed < _SEED_LIMIT:
        raise _fail()

    return WorkerRequest(input_path, mask_path, output_path, tier, prompt, seed)


def _load_png(path: Path, mode: str) -> Image.Image:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(path) as candidate:
                if candidate.format != "PNG":
                    raise _fail()
                candidate.load()
                return candidate.convert(mode)
    except WorkerError:
        raise
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        OSError,
        ValueError,
    ) as exc:
        raise _fail() from exc


def _probe_runtime() -> None:
    try:
        import torch
    except (ImportError, OSError) as exc:
        raise _fail("local_dependency_missing") from exc
    if not torch.cuda.is_available():
        raise _fail("local_gpu_unavailable")
    try:
        for package in _PROBE_PACKAGES:
            importlib.import_module(package)
    except (ImportError, OSError) as exc:
        raise _fail("local_dependency_missing") from exc


def _load_pipeline(
    *,
    controlnet_model_id: str,
    controlnet_revision: str,
    inpaint_model_id: str,
    inpaint_revision: str,
) -> tuple[Any, GeneratorFactory]:
    import torch
    from diffusers import ControlNetModel, StableDiffusionControlNetInpaintPipeline

    controlnet = ControlNetModel.from_pretrained(
        controlnet_model_id,
        revision=controlnet_revision,
        torch_dtype=torch.float16,
        use_safetensors=True,
    )
    pipeline = StableDiffusionControlNetInpaintPipeline.from_pretrained(
        inpaint_model_id,
        revision=inpaint_revision,
        controlnet=controlnet,
        torch_dtype=torch.float16,
        variant="fp16",
        use_safetensors=True,
    )

    def make_generator(seed: int) -> Any:
        return torch.Generator(device="cuda").manual_seed(seed)

    return pipeline, make_generator


def _safe_image(result: object) -> Image.Image:
    flags = getattr(result, "nsfw_content_detected", None)
    if not isinstance(flags, (list, tuple)) or len(flags) != 1 or flags[0] is not False:
        raise _fail()
    images = getattr(result, "images", None)
    if not isinstance(images, (list, tuple)) or len(images) != 1:
        raise _fail()
    image = images[0]
    if not isinstance(image, Image.Image):
        raise _fail()
    return image


def run_request(request_path: Path, *, loader: PipelineLoader | None = None) -> Path:
    """Validate one request, generate once, and save one composited PNG."""
    try:
        request = _parse_request(request_path)
        original = _load_png(request.input_path, "RGB")
        building_mask = _load_png(request.mask_path, "L")
        inpaint_mask = repair_mask(building_mask, request.tier, _TARGET_SIZE)
        init_image = original.resize(_TARGET_SIZE, Image.Resampling.LANCZOS)
        control_image = control_edges(original, inpaint_mask, _TARGET_SIZE)
    except WorkerError:
        raise
    except (OSError, RuntimeError, ValueError) as exc:
        raise _fail() from exc

    if loader is None:
        _probe_runtime()
        loader = _load_pipeline
    try:
        pipeline, make_generator = loader(
            controlnet_model_id=CONTROLNET_MODEL_ID,
            controlnet_revision=CONTROLNET_REVISION,
            inpaint_model_id=INPAINT_MODEL_ID,
            inpaint_revision=INPAINT_REVISION,
        )
    except WorkerError:
        raise
    except Exception as exc:  # noqa: BLE001 - model hub failures become one bounded reason
        raise _fail("local_model_unavailable") from exc
    if getattr(pipeline, "safety_checker", None) is None:
        raise _fail("local_model_unavailable")

    try:
        pipeline.enable_model_cpu_offload()
        result = pipeline(
            prompt=request.prompt,
            negative_prompt=_NEGATIVE_PROMPT,
            image=init_image,
            mask_image=inpaint_mask,
            control_image=control_image,
            height=_TARGET_SIZE[1],
            width=_TARGET_SIZE[0],
            num_inference_steps=30,
            guidance_scale=9.5,
            controlnet_conditioning_scale=0.5,
            generator=make_generator(request.seed),
        )
        generated = _safe_image(result)
        repaired = composite_generated(original, generated, inpaint_mask)
        repaired.save(request.output_path, format="PNG")
    except WorkerError:
        raise
    except Exception as exc:  # noqa: BLE001 - pipeline diagnostics stay inside this process
        raise _fail() from exc
    return request.output_path


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the isolated local repair worker")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--probe", action="store_true")
    action.add_argument("--request", type=Path)
    return parser


def main(argv: Sequence[str] | None = None, *, loader: PipelineLoader | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.probe:
            _probe_runtime()
        else:
            run_request(args.request, loader=loader)
    except WorkerError as exc:
        print(exc.reason, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
