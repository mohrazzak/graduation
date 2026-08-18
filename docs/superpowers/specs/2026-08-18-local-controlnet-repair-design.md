# Local ControlNet Repair Design

**Date:** 2026-08-18
**Status:** Approved
**Source:** `A-Smart-Site-For-Rehabilitating-Damaged-Buildings/ai/final.py`

## Goal

Use the team's Stable Diffusion inpainting plus Canny ControlNet implementation
as DamageScale's local building-repair generator, while retaining Gemini as a
fallback and preserving the existing job, 3D, persistence, and History
contracts.

## Source Findings

The reference script combines
`StableDiffusionControlNetInpaintPipeline`,
`runwayml/stable-diffusion-inpainting`, and
`lllyasviel/sd-controlnet-canny`. It is a restoration visualizer, not a damage
classifier. Its useful behavior is the model combination, Canny conditioning,
tier-independent repair prompt, masked compositing, and low-VRAM intent.

The script itself is not production-callable: it executes at import time, uses
a hard-coded Windows input path, writes fixed filenames in the current working
directory, uses a fixed rectangular mask, and does not pin dependencies or
model revisions. DamageScale will adapt the model behavior behind a bounded
bytes-in/PNG-bytes-out interface rather than importing or shelling out to that
script.

## Architecture

### Process isolation

The local generator runs as a subprocess in a dedicated CUDA-capable Python
environment. It must not load Diffusers in the FastAPI classifier process.
This preserves the documented TensorFlow/Ultralytics import order, avoids
sharing the API venv's CPU-only Torch build, and contains GPU memory after each
job.

The API invokes a checked worker command with a temporary directory. The
temporary directory contains only:

- `input.png`: decoded source normalized to RGB PNG;
- `mask.png`: the raw building mask already produced by the repair pipeline;
- `request.json`: prompt, tier, seed, and output path;
- `repaired.png`: the worker's only required output.

Pinned model identifiers and revisions are deliberately absent from
`request.json`. They are hardcoded only inside the isolated worker, so neither
the browser-facing request nor the FastAPI adapter can redirect model loading
to unreviewed weights.

No untrusted request value becomes a shell command. The adapter uses
`subprocess.run()` with an argument list, a timeout, captured output, and no
shell. Temporary files are deleted when the call returns.

### Provider selection

`REPAIR_BACKEND` accepts exactly:

- `auto` (default): try local ControlNet when its probe succeeds, then fall back
  to Gemini for local availability or generation failures;
- `local-controlnet`: require the local worker and return a named local error;
- `gemini`: preserve the existing Gemini-only behavior.

`LOCAL_REPAIR_PYTHON` selects the worker interpreter and defaults to
`api/.venv-repair/bin/python`. `LOCAL_REPAIR_TIMEOUT_SECONDS` defaults to 900.
Invalid configuration fails closed with a named backend error rather than
silently choosing a different provider.

The provider returns PNG bytes. The existing `repaired` artifact remains
`image/png`; the job route and frontend do not learn which provider ran.

### Worker model contract

The worker hardcodes these immutable model revisions inside its isolated module:

- inpainting:
  `stable-diffusion-v1-5/stable-diffusion-inpainting@8a4288a76071f7280aedbdb3253bdb9e9d5d84bb`;
- Canny ControlNet:
  `lllyasviel/sd-controlnet-canny@7f2f69197050967007f6bbd23ab5e52f0384162a`.

It requests safetensors and the fp16 variants where available. On CUDA it uses
`enable_model_cpu_offload()` so the 4 GB GTX 1650 Ti is the supported local
target. CPU execution is rejected by the readiness probe because it is not a
credible interactive demo path.

Generation is deterministic for the same input, tier, and prompt. The seed is
derived from SHA-256 of those values. The reference settings remain the
starting contract: 512 by 512, 30 inference steps, guidance scale 9.5, and
ControlNet conditioning scale 0.5.

### Mask and edge semantics

DamageScale reuses its existing SegFormer/classical building mask; it does not
re-run the reference repository's preparation pipeline.

- `GC`: the full building mask is the inpainting mask, expressing the existing
  full-reconstruction rule literally.
- `PC`: the mask is intersected with the reference implementation's central
  repair window (x 20-80%, y 2-85%).
- `NC`: the same bounded window is used for direct API calls, though the current
  UI does not offer 2D restoration for NC.

Canny edges use thresholds 100/200. Edges inside the inpainting mask are
removed so ControlNet preserves standing structure outside the repair region.
The reference script's hard-coded horizontal roof line is omitted because a
fixed 10% line is wrong for arbitrary viewpoints.

After generation, the 512-pixel result is resized to the original dimensions
and blended into the original only through a feathered version of the repair
mask. The surroundings and unmasked structure therefore remain from the
uploaded photo.

## Existing Flow Preserved

The public sequence remains:

1. `POST /jobs/repair` creates a four-stage job.
2. `isolating` publishes the existing mask preview.
3. `edges` publishes the existing edge artifact.
4. `generating` calls the selected provider.
5. `composing` publishes the optional diff and completes the job.
6. The web client automatically persists `repaired` to the originating
   analysis.
7. `POST /jobs/model3d` may use `from_job` and its GLB is automatically
   persisted to the same analysis.
8. History renders the original assessment, before/after repair, and 3D model
   as one result.

No route, stage key, artifact name, MIME type, or database column changes.

## Error Handling

Forced local mode maps failures to stable UI keys:

- `local_dependency_missing`: interpreter or required package missing;
- `local_gpu_unavailable`: CUDA is unavailable;
- `local_model_unavailable`: pinned weights cannot be loaded;
- `local_timed_out`: worker exceeds the configured deadline;
- `local_generation_failed`: worker fails or produces an invalid output.

`auto` records the local failure in server logs and attempts Gemini. If Gemini
also fails, the existing Gemini reason is returned because it is the final
provider the user can act on. Mask and edge artifacts remain available on every
generation failure.

Worker stderr is bounded before logging and never sent directly to the browser.
Output is accepted only when it exists, is non-empty, decodes with Pillow, and
has PNG format.

## Dependencies and Operations

Optional local dependencies live in `api/requirements-repair.txt`, separate
from the base API and classifier requirements:

- `diffusers==0.39.0`;
- `accelerate==1.14.0`;
- `transformers==5.12.1`;
- `safetensors==0.8.0`;
- `opencv-python==4.13.0.92`;
- `numpy==2.4.6`;
- `pillow==12.2.0`.

The environment also requires CUDA Torch 2.12.0. The setup documentation uses
the PyTorch CUDA 13.0 wheel source already proven by the graduation environment.
The base Docker image remains unchanged and therefore continues using Gemini or
its honest failure path.

The first local run downloads several gigabytes. Model use is governed by the
CreativeML OpenRAIL-M/OpenRAIL terms recorded by the two model cards. The
reference repository itself has no license file, so the implementation is an
adaptation of its architecture and constants, with source attribution, rather
than a wholesale copy.

## Testing

TDD coverage must prove:

- exact backend parsing and invalid-value rejection;
- `auto` local-first selection and Gemini fallback;
- forced-local errors never fall back;
- subprocess invocation uses no shell, receives the raw mask/tier/prompt, and
  enforces timeout/output validation;
- PC/NC bounded masks and GC full-building masks;
- Canny control edges are removed inside the repair mask;
- deterministic seed and PNG compositing;
- job success still publishes `mask`, `edges`, `repaired`, and optional `diff`;
- failure retains `mask` and `edges` with a named detail;
- the existing 3D `from_job` path consumes the local repaired bytes;
- all API, web persistence, type, lint, build, and localization parity gates.

A final runtime check must use the CUDA environment to generate one real sample
and validate the output as a non-empty PNG. Because service quotas are external,
the live local generation is the required repair proof; Tripo remains separately
quota-dependent.

## Security Note

The reference repository contains a hard-coded Tripo credential in
`ai/generate_3d_fast.py`. DamageScale does not import that file or credential.
The credential must be rotated by its owner; it will never be copied into this
repository, tests, logs, or handoff.
