# Local ControlNet Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the team's Stable Diffusion inpainting plus Canny ControlNet model as an isolated local GPU repair backend, with Gemini fallback and no change to the job, auto-save, 3D, or History contracts.

**Architecture:** FastAPI keeps orchestration and artifact storage while a dedicated CUDA Python subprocess owns Diffusers and GPU memory. Pure image functions derive the tier mask, Canny control image, deterministic seed, and final composite; a provider coordinator selects `auto`, `local-controlnet`, or `gemini` and returns the same PNG bytes the existing pipeline already publishes.

**Tech Stack:** Python 3.12, FastAPI, Pillow, NumPy, OpenCV, PyTorch 2.12 CUDA 13.0, Diffusers 0.39.0, Accelerate 1.14.0, Transformers 5.12.1, pytest, Next.js/next-intl.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-18-local-controlnet-repair-design.md` exactly.
- Preserve route names, four public stage keys, artifact names/MIME types, `from_job`, automatic persistence, and the complete History result.
- Never import Diffusers from the FastAPI process; only the worker interpreter imports it.
- Never use `shell=True`; request values must not become executable command text.
- The local worker accepts only trusted temporary files written by the API and emits one validated PNG.
- `REPAIR_BACKEND=auto` is local-first with Gemini fallback; forced local never falls back.
- The base API/Docker dependency set remains lightweight; local generation stays optional.
- Both English and Arabic receive identical new message leaves.
- All behavior changes follow red-green-refactor and small commits.

## File Structure

- Create `api/jobs/repair_errors.py`: shared stable repair failure.
- Create `api/jobs/repair_gemini.py`: behavior-preserving Gemini extraction.
- Create `api/jobs/repair_providers.py`: backend parsing and selection.
- Create `api/jobs/local_controlnet.py`: safe subprocess adapter and output validation.
- Create `api/repair/controlnet_core.py`: pure mask, edge, seed, and composite functions.
- Create `api/repair/controlnet_worker.py`: CUDA/Diffusers probe and CLI.
- Create `api/requirements-repair.txt`: optional exact dependencies.
- Create tests for each production module and update the job contract tests.
- Modify `.env.example` and both locale catalogs.
- Update ignored `HANDOFF.md` and the user's dirty `CLAUDE.md` only after integration.

---

### Task 1: Provider Contract and Gemini Extraction

**Files:**
- Create: `api/jobs/repair_errors.py`
- Create: `api/jobs/repair_gemini.py`
- Create: `api/jobs/repair_providers.py`
- Modify: `api/jobs/repair.py`
- Create: `api/tests/test_repair_providers.py`
- Modify: `api/tests/test_jobs.py`

**Interfaces:**
- Produces: `RepairUnavailable(reason: str)` with `.reason`.
- Produces: `parse_backend(raw: str | None) -> Literal["auto", "local-controlnet", "gemini"]`.
- Produces: `generate_repaired(image_bytes: bytes, building_mask: Image.Image, tier: TierCode, prompt: str) -> bytes`.
- Consumes later: `generate_local(...)` and `local_available()`.

- [ ] **Step 1: Write provider-selection failures first**

Add injected behavior tests:

```python
def test_auto_uses_local_first() -> None:
    calls: list[str] = []
    result = generate_with(
        "auto",
        local=lambda: calls.append("local") or PNG,
        gemini=lambda: calls.append("gemini") or b"wrong",
        local_ready=lambda: True,
    )
    assert result == PNG
    assert calls == ["local"]


def test_auto_falls_back_to_gemini_after_local_failure() -> None:
    calls: list[str] = []
    result = generate_with(
        "auto",
        local=lambda: (_ for _ in ()).throw(
            RepairUnavailable("local_generation_failed")
        ),
        gemini=lambda: calls.append("gemini") or PNG,
        local_ready=lambda: True,
    )
    assert result == PNG
    assert calls == ["gemini"]


def test_forced_local_never_falls_back() -> None:
    with pytest.raises(RepairUnavailable, match="local_gpu_unavailable"):
        generate_with(
            "local-controlnet",
            local=lambda: (_ for _ in ()).throw(
                RepairUnavailable("local_gpu_unavailable")
            ),
            gemini=lambda: pytest.fail("must not fall back"),
            local_ready=lambda: False,
        )
```

Also cover Gemini-only, local-unready auto, and invalid `REPAIR_BACKEND`.

- [ ] **Step 2: Run RED**

```bash
cd api
/home/mohrazzak/projects/grad_proj/api/.venv/bin/pytest tests/test_repair_providers.py -q
```

Expected: collection fails because `jobs.repair_providers` is absent.

- [ ] **Step 3: Implement the minimum provider seam**

Move the current Gemini constants, request, response parser, and error mapping unchanged into `repair_gemini.py`. Implement the injected `generate_with()` decision function. Read and validate `REPAIR_BACKEND` in `generate_repaired()`.

Until Task 3 creates `jobs.local_controlnet`, catch its `ImportError` at this
lazy boundary: `auto` treats it as local-unready and reaches Gemini, while
forced local raises `local_dependency_missing`. Do not create a fake local
implementation in production.

Change `repair.run()` to:

```python
repaired = generate_repaired(
    image_bytes=image_bytes,
    building_mask=mask,
    tier=tier,
    prompt=prompt or build_prompt(tier),
)
```

Keep the catch at the same stage and pass `exc.reason` to `store.fail()`.

- [ ] **Step 4: Update job tests at the new seam**

Monkeypatch `jobs.repair.generate_repaired`, assert it receives the raw Pillow mask and tier, and preserve the existing success/failure artifact assertions.

- [ ] **Step 5: Run GREEN and Ruff**

```bash
cd api
ENABLED_MODELS=mock GEMINI_API_KEY= TRIPO_API_KEY= \
  /home/mohrazzak/projects/grad_proj/api/.venv/bin/pytest \
  tests/test_repair_providers.py tests/test_jobs.py -q
/home/mohrazzak/projects/grad_proj/api/.venv/bin/ruff check \
  jobs/repair.py jobs/repair_errors.py jobs/repair_gemini.py \
  jobs/repair_providers.py tests/test_repair_providers.py tests/test_jobs.py
```

- [ ] **Step 6: Commit**

```bash
git add api/jobs/repair.py api/jobs/repair_errors.py api/jobs/repair_gemini.py \
  api/jobs/repair_providers.py api/tests/test_jobs.py \
  api/tests/test_repair_providers.py
git commit -m "refactor(api): add selectable repair providers"
```

---

### Task 2: Pure ControlNet Image Preparation

**Files:**
- Create: `api/repair/controlnet_core.py`
- Create: `api/tests/test_controlnet_core.py`

**Interfaces:**
- Produces: `repair_mask(building_mask, tier, size=(512, 512)) -> Image.Image`.
- Produces: `control_edges(image, mask, size=(512, 512)) -> Image.Image`.
- Produces: `generation_seed(image_bytes, tier, prompt) -> int`.
- Produces: `composite_generated(original, generated, mask) -> Image.Image`.

- [ ] **Step 1: Write deterministic image behavior tests**

```python
def test_gc_uses_the_full_building_mask() -> None:
    building = Image.new("L", (10, 10), 255)
    assert np.array(repair_mask(building, "GC", (10, 10))).min() == 255


def test_pc_intersects_the_reference_window() -> None:
    actual = np.array(repair_mask(Image.new("L", (10, 10), 255), "PC", (10, 10)))
    assert actual[:, :2].max() == 0
    assert actual[:8, 2:8].min() == 255
    assert actual[9:, :].max() == 0


def test_control_edges_are_blank_inside_the_repair_mask() -> None:
    assert np.array(
        control_edges(checkerboard_rgb(32), Image.new("L", (32, 32), 255), (32, 32))
    ).max() == 0


def test_composite_preserves_pixels_outside_the_mask() -> None:
    result = composite_generated(
        Image.new("RGB", (16, 16), "red"),
        Image.new("RGB", (16, 16), "blue"),
        left_half_mask(16),
    )
    assert result.getpixel((15, 8)) == (255, 0, 0)
```

Also prove seed stability and sensitivity to input, tier, and prompt.

- [ ] **Step 2: Run RED**

```bash
cd api
/home/mohrazzak/projects/grad_proj/api/.venv/bin/pytest tests/test_controlnet_core.py -q
```

Expected: collection fails because `repair.controlnet_core` is absent.

- [ ] **Step 3: Implement pure transformations**

Use Pillow/NumPy/OpenCV only. PC/NC use x 20-80% and y 2-85% intersected with the building mask; GC uses the full mask. Canny thresholds are 100/200 and pixels inside the repair mask are zero. Feather only the final composite. Derive the seed from the first eight SHA-256 bytes modulo `2**31`.

- [ ] **Step 4: Run GREEN, Ruff, and commit**

```bash
cd api
/home/mohrazzak/projects/grad_proj/api/.venv/bin/pytest tests/test_controlnet_core.py -q
/home/mohrazzak/projects/grad_proj/api/.venv/bin/ruff check \
  repair/controlnet_core.py tests/test_controlnet_core.py
git add api/repair/controlnet_core.py api/tests/test_controlnet_core.py
git commit -m "feat(api): prepare ControlNet repair inputs"
```

---

### Task 3: Safe Local Worker Boundary

**Files:**
- Create: `api/jobs/local_controlnet.py`
- Create: `api/tests/test_local_controlnet.py`
- Modify: `api/jobs/repair_providers.py`

**Interfaces:**
- Produces: `local_available() -> bool`.
- Produces: `generate_local(image_bytes, building_mask, tier, prompt) -> bytes`.
- Invokes: `python -m repair.controlnet_worker --request <absolute-json>`.

- [ ] **Step 1: Write subprocess behavior tests**

Inject a runner callable and prove the command is an argument list with no shell; JSON contains exact tier/prompt and absolute temp paths; input/mask decode correctly; timeouts and missing interpreter map to stable reasons; non-zero exit, missing/empty/non-image/JPEG/oversized output fail; valid PNG returns byte-for-byte.

- [ ] **Step 2: Run RED**

```bash
cd api
/home/mohrazzak/projects/grad_proj/api/.venv/bin/pytest tests/test_local_controlnet.py -q
```

Expected: collection fails because `jobs.local_controlnet` is absent.

- [ ] **Step 3: Implement the adapter**

Resolve the default interpreter relative to the API root. Parse timeout as an integer in `[30, 3600]`, default 900. Write normalized PNG inputs and request JSON to `TemporaryDirectory`. Use `subprocess.run(..., shell=False, timeout=..., capture_output=True)`.

Validate output at at most 25 MiB with Pillow `verify()`, reopen it, require PNG and positive dimensions, then return its original bytes. Bound logged stderr. Probe with 30 seconds, caching only success so environment repairs remain discoverable.

- [ ] **Step 4: Wire and run GREEN**

```bash
cd api
/home/mohrazzak/projects/grad_proj/api/.venv/bin/pytest \
  tests/test_local_controlnet.py tests/test_repair_providers.py tests/test_jobs.py -q
/home/mohrazzak/projects/grad_proj/api/.venv/bin/ruff check \
  jobs/local_controlnet.py jobs/repair_providers.py tests/test_local_controlnet.py
git add api/jobs/local_controlnet.py api/jobs/repair_providers.py \
  api/tests/test_local_controlnet.py
git commit -m "feat(api): invoke isolated local repair worker"
```

---

### Task 4: CUDA Diffusers Worker

**Files:**
- Create: `api/repair/controlnet_worker.py`
- Create: `api/requirements-repair.txt`
- Create: `api/tests/test_controlnet_worker.py`

**Interfaces:**
- `python -m repair.controlnet_worker --probe` exits 0 only with CUDA and packages.
- `python -m repair.controlnet_worker --request /absolute/request.json` emits one PNG or a bounded diagnostic.

- [ ] **Step 1: Write worker tests without loading weights**

Inject a fake loader/pipeline into `run_request()`. Prove relative/malformed/out-of-directory paths fail; pinned model identifiers reach the loader; all three images are 512 square; 30 steps, guidance 9.5, ControlNet scale 0.5, negative prompt, and deterministic seed reach the pipeline; the result is composited at original size and saved as PNG; a safety-checker flag fails closed.

- [ ] **Step 2: Run RED**

```bash
cd api
/home/mohrazzak/projects/grad_proj/api/.venv/bin/pytest tests/test_controlnet_worker.py -q
```

Expected: collection fails because `repair.controlnet_worker` is absent.

- [ ] **Step 3: Implement the worker**

Keep all Torch/Diffusers/Accelerate imports inside worker functions. Load:

```python
ControlNetModel.from_pretrained(
    CONTROLNET_MODEL_ID,
    revision=CONTROLNET_REVISION,
    torch_dtype=torch.float16,
    use_safetensors=True,
)
StableDiffusionControlNetInpaintPipeline.from_pretrained(
    INPAINT_MODEL_ID,
    revision=INPAINT_REVISION,
    controlnet=controlnet,
    torch_dtype=torch.float16,
    variant="fp16",
    use_safetensors=True,
)
```

Call `enable_model_cpu_offload()` before inference and keep the safety checker enabled. Never move the full pipeline to CUDA first.

- [ ] **Step 4: Add exact optional dependencies**

```text
# Requires torch==2.12.0+cu130 from the PyTorch CUDA 13.0 index.
diffusers==0.39.0
accelerate==1.14.0
transformers==5.12.1
safetensors==0.8.0
opencv-python==4.13.0.92
numpy==2.4.6
pillow==12.2.0
```

- [ ] **Step 5: Run GREEN and commit**

```bash
cd api
/home/mohrazzak/projects/grad_proj/api/.venv/bin/pytest \
  tests/test_controlnet_worker.py tests/test_controlnet_core.py -q
/home/mohrazzak/projects/grad_proj/api/.venv/bin/python \
  -m repair.controlnet_worker --probe
/home/mohrazzak/projects/grad_proj/api/.venv/bin/ruff check \
  repair/controlnet_worker.py tests/test_controlnet_worker.py
git add api/repair/controlnet_worker.py api/requirements-repair.txt \
  api/tests/test_controlnet_worker.py
git commit -m "feat(api): add CUDA ControlNet repair worker"
```

The base API venv probe must fail promptly with `local_gpu_unavailable` and must not download weights.

---

### Task 5: Configuration and Localized Errors

**Files:**
- Modify: `.env.example`
- Modify: `web/messages/en.json`
- Modify: `web/messages/ar.json`
- Modify: `api/tests/test_jobs.py`

**Interfaces:**
- Documents `REPAIR_BACKEND`, `LOCAL_REPAIR_PYTHON`, and `LOCAL_REPAIR_TIMEOUT_SECONDS`.
- Adds all five local reason keys beneath `repair.errors`.

- [ ] **Step 1: Write forced-local job failures**

Parametrize all five local reasons. Assert failure retains `mask` and `edges`, omits `repaired`, and returns the exact stable detail.

- [ ] **Step 2: Run RED**

```bash
cd api
/home/mohrazzak/projects/grad_proj/api/.venv/bin/pytest \
  tests/test_jobs.py -k local_controlnet -q
```

- [ ] **Step 3: Add configuration and matching locale copy**

English leaves:

```json
"local_dependency_missing": "The local repair model is not installed on this server. Configure its GPU environment, then retry.",
"local_gpu_unavailable": "The local repair model needs a CUDA GPU, but none is available on this server.",
"local_model_unavailable": "The local repair weights could not be loaded. Check the model cache or connection, then retry.",
"local_timed_out": "The local repair model exceeded its time limit. Retry once or switch the repair backend.",
"local_generation_failed": "The local repair model could not produce a valid image. Retry with the same photo."
```

Add semantically equivalent Arabic under identical keys.

- [ ] **Step 4: Run tests, locale parity, typecheck, lint, and commit**

```bash
cd api
ENABLED_MODELS=mock GEMINI_API_KEY= TRIPO_API_KEY= \
  /home/mohrazzak/projects/grad_proj/api/.venv/bin/pytest tests/test_jobs.py -q
cd ../web
npm test
npx tsc --noEmit
npm run lint
node -e 'const e=require("./messages/en.json"),a=require("./messages/ar.json"); const w=(o,p="")=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==="object"&&!Array.isArray(v)?w(v,p?`${p}.${k}`:k):[p?`${p}.${k}`:k]); const x=w(e),y=w(a); if(JSON.stringify(x)!==JSON.stringify(y))process.exit(1); console.log(`locale parity: ${x.length}`)'
git add ../.env.example messages/en.json messages/ar.json ../api/tests/test_jobs.py
git commit -m "docs: configure local ControlNet repair"
```

---

### Task 6: Real CUDA Execution and Final Integration

**Files:**
- Runtime only: `/home/mohrazzak/projects/graduation/.venv`
- Generated proof: a temporary directory outside Git
- After merge only: ignored `HANDOFF.md` and existing dirty `CLAUDE.md`

**Interfaces:**
- Worker interpreter: `/home/mohrazzak/projects/graduation/.venv/bin/python`.
- Input: `web/public/samples/sample-PC.jpg`.
- Output: a non-empty Pillow-verified PNG from the pinned local model.

- [ ] **Step 1: Install optional packages without changing API Torch**

```bash
cd api
/home/mohrazzak/projects/graduation/.venv/bin/python -m pip install \
  -r requirements-repair.txt
```

- [ ] **Step 2: Prove worker readiness**

```bash
cd api
/home/mohrazzak/projects/graduation/.venv/bin/python \
  -m repair.controlnet_worker --probe
```

Expected: exit 0 and bounded `ready`; no weight download during probe.

- [ ] **Step 3: Generate and validate one real PC repair**

Build a temporary request using `sample-PC.jpg` and the API raw building mask, invoke the worker, and validate:

```bash
python -c 'from PIL import Image; import sys; image=Image.open(sys.argv[1]); image.verify(); assert image.format=="PNG" and min(image.size)>0; print(image.size)' /tmp/<generated>/repaired.png
```

Record elapsed time, dimensions, bytes, and peak GPU memory. Do not commit the image unless it is explicitly labeled as a pre-generated example.

- [ ] **Step 4: Run complete feature-tree gates**

```bash
cd api
ENABLED_MODELS=mock GEMINI_API_KEY= TRIPO_API_KEY= \
  /home/mohrazzak/projects/grad_proj/api/.venv/bin/pytest -q
/home/mohrazzak/projects/grad_proj/api/.venv/bin/ruff check .
cd ../web
npm test
npx tsc --noEmit
npm run lint
npm run build
cd ..
git diff --check
```

Expected: all API tests pass including YOLO; all web unit tests pass with only the credential-gated Supabase test skipped; all static/build gates exit zero.

- [ ] **Step 5: Independent review**

Request a read-only review over `dcd36fa..HEAD`, covering both automatic artifact persistence and local repair. Fix every Critical/Important finding through a new failing test and request one re-review.

- [ ] **Step 6: Fast-forward and hand off**

Fast-forward `feat/three-tier-pipeline` only after fresh merged-tree verification. Preserve the main checkout's existing `.gitignore`, `CLAUDE.md`, `.claude/`, both reference repositories, `demo/`, and `session-recover.yaml`.

Patch the user's existing `CLAUDE.md` with local backend/runtime facts without replacing YOLO notes. Rebuild ignored `HANDOFF.md` from current Git and evidence. State which proof used the real local model and that Tripo remains credit-dependent.

Do not push or delete the isolated worktree; the user will continue in Claude.
