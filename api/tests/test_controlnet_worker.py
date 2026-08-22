"""The optional CUDA worker validates requests before crossing into Diffusers."""

from __future__ import annotations

import json
import multiprocessing
import os
import stat
import subprocess
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace
from typing import Any

import pytest
from PIL import Image

from repair.controlnet_worker import (
    RuntimePolicy,
    WorkerError,
    _load_pipeline,
    main,
    run_request,
    runtime_policy,
)


def _hold_gpu_lock(lock_path: str, acquired: object, release: object) -> None:
    """Child-process target used to prove the lock coordinates separate workers."""
    from repair.controlnet_worker import _gpu_lock

    with _gpu_lock(Path(lock_path)):
        acquired.set()
        release.wait(5)


class FakeGenerator:
    def __init__(self, seed: int) -> None:
        self.seed = seed


class FakePipeline:
    def __init__(self, *, safety_flags: object = (False,)) -> None:
        self.safety_checker = object()
        self.safety_flags = safety_flags
        self.offload_enabled = False
        self.events: list[str] = []
        self.calls: list[dict[str, Any]] = []

    def enable_model_cpu_offload(self) -> None:
        self.offload_enabled = True
        self.events.append("model_cpu_offload")

    def enable_sequential_cpu_offload(self) -> None:
        self.offload_enabled = True
        self.events.append("sequential_cpu_offload")

    def enable_attention_slicing(self) -> None:
        self.events.append("attention_slicing")

    def __call__(self, **kwargs: Any) -> SimpleNamespace:
        assert self.offload_enabled, "inference ran before CPU offload was enabled"
        self.events.append("inference")
        self.calls.append(kwargs)
        return SimpleNamespace(
            images=[Image.new("RGB", (512, 512), "blue")],
            nsfw_content_detected=self.safety_flags,
        )


def write_request(
    directory: Path,
    *,
    input_path: Path | None = None,
    mask_path: Path | None = None,
    output_path: Path | None = None,
) -> Path:
    source = input_path or directory / "input.png"
    mask = mask_path or directory / "mask.png"
    output = output_path or directory / "repaired.png"
    if input_path is None:
        Image.new("RGB", (14, 10), "red").save(source, format="PNG")
    if mask_path is None:
        building = Image.new("L", (14, 10), 0)
        building.paste(255, (0, 0, 7, 10))
        building.save(mask, format="PNG")
    request = directory / "request.json"
    request.write_text(
        json.dumps(
            {
                "input_path": str(source),
                "mask_path": str(mask),
                "output_path": str(output),
                "class_code": "TD",
                "prompt": "restore the concrete facade",
                "seed": 1_234_567,
            }
        ),
        encoding="utf-8",
    )
    return request


def test_module_import_does_not_import_torch_or_diffusers() -> None:
    """Importing the worker in FastAPI must not activate either heavyweight stack."""
    completed = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import sys; import repair.controlnet_worker; "
                "assert 'torch' not in sys.modules; "
                "assert 'diffusers' not in sys.modules"
            ),
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 0, completed.stderr


def test_gtx_16xx_capability_75_uses_the_finite_fp32_policy() -> None:
    """The affected GPU family must not use the fp16 path that produces NaNs."""
    assert runtime_policy("NVIDIA GeForce GTX 1650 Ti", (7, 5)) == RuntimePolicy(
        precision="float32",
        offload="sequential",
        attention_slicing=True,
    )
    assert runtime_policy("NVIDIA GeForce RTX 3060", (8, 6)) == RuntimePolicy(
        precision="float16",
        offload="model",
        attention_slicing=False,
    )


def test_gtx_policy_reaches_model_dtype_and_runtime_setup(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A correct selector is insufficient unless loading and inference honor it."""
    dtype_calls: list[tuple[str, object]] = []
    pipeline = FakePipeline()

    class FakeCuda:
        @staticmethod
        def get_device_name() -> str:
            return "NVIDIA GeForce GTX 1650 Ti"

        @staticmethod
        def get_device_capability() -> tuple[int, int]:
            return (7, 5)

    fake_torch = SimpleNamespace(
        cuda=FakeCuda(),
        float16=object(),
        float32=object(),
        Generator=lambda **kwargs: SimpleNamespace(manual_seed=lambda seed: seed),
    )

    class FakeControlNetModel:
        @classmethod
        def from_pretrained(cls, *args: object, **kwargs: object) -> object:
            dtype_calls.append(("controlnet", kwargs["torch_dtype"]))
            return object()

    class FakeDiffusersPipeline:
        @classmethod
        def from_pretrained(cls, *args: object, **kwargs: object) -> FakePipeline:
            dtype_calls.append(("pipeline", kwargs["torch_dtype"]))
            return pipeline

    fake_diffusers = ModuleType("diffusers")
    fake_diffusers.ControlNetModel = FakeControlNetModel
    fake_diffusers.StableDiffusionControlNetInpaintPipeline = FakeDiffusersPipeline
    monkeypatch.setitem(sys.modules, "torch", fake_torch)
    monkeypatch.setitem(sys.modules, "diffusers", fake_diffusers)

    loaded_pipeline, generator, policy = _load_pipeline(
        controlnet_model_id="controlnet",
        controlnet_revision="controlnet-revision",
        inpaint_model_id="inpaint",
        inpaint_revision="inpaint-revision",
    )

    assert dtype_calls == [
        ("controlnet", fake_torch.float32),
        ("pipeline", fake_torch.float32),
    ]
    request = write_request(tmp_path)
    run_request(
        request,
        loader=lambda **kwargs: (loaded_pipeline, generator, policy),
    )
    assert pipeline.events == [
        "attention_slicing",
        "sequential_cpu_offload",
        "inference",
    ]


def test_gpu_lock_serializes_processes_and_uses_owner_only_permissions(
    tmp_path: Path,
) -> None:
    """Two worker processes must never hold the GPU/model region concurrently."""
    import repair.controlnet_worker as worker

    assert hasattr(worker, "_gpu_lock")
    lock_path = tmp_path / "gpu.lock"
    context = multiprocessing.get_context("fork")
    first_acquired = context.Event()
    release_first = context.Event()
    second_acquired = context.Event()
    release_second = context.Event()
    release_second.set()
    first = context.Process(
        target=_hold_gpu_lock,
        args=(str(lock_path), first_acquired, release_first),
    )
    second = context.Process(
        target=_hold_gpu_lock,
        args=(str(lock_path), second_acquired, release_second),
    )
    try:
        first.start()
        assert first_acquired.wait(2), "first worker never acquired the GPU lock"
        metadata = lock_path.stat()
        assert metadata.st_uid == os.geteuid()
        assert stat.S_IMODE(metadata.st_mode) == 0o600

        second.start()
        assert not second_acquired.wait(0.25), "workers overlapped inside the GPU lock"
        release_first.set()
        assert second_acquired.wait(2), "second worker did not acquire after release"
    finally:
        release_first.set()
        release_second.set()
        first.join(2)
        second.join(2)
        if first.is_alive():
            first.terminate()
            first.join(2)
        if second.is_alive():
            second.terminate()
            second.join(2)
    assert first.exitcode == 0
    assert second.exitcode == 0


def test_cli_request_prepares_generation_and_writes_composited_png(tmp_path: Path) -> None:
    """Wrong model settings, image preparation, or output handling breaks repair fidelity."""
    request = write_request(tmp_path)
    payload = json.loads(request.read_text(encoding="utf-8"))
    payload.update(
        {
            "controlnet_model_id": "attacker/unreviewed-controlnet",
            "controlnet_revision": "main",
            "inpaint_model_id": "attacker/unreviewed-inpaint",
            "inpaint_revision": "main",
        }
    )
    request.write_text(json.dumps(payload), encoding="utf-8")
    pipeline = FakePipeline()
    loaded: dict[str, str] = {}

    def loader(**identifiers: str) -> tuple[FakePipeline, Any, RuntimePolicy]:
        loaded.update(identifiers)
        return pipeline, FakeGenerator, RuntimePolicy("float16", "model", False)

    assert main(["--request", str(request)], loader=loader) == 0

    assert loaded == {
        "controlnet_model_id": "lllyasviel/sd-controlnet-canny",
        "controlnet_revision": "7f2f69197050967007f6bbd23ab5e52f0384162a",
        "inpaint_model_id": "stable-diffusion-v1-5/stable-diffusion-inpainting",
        "inpaint_revision": "8a4288a76071f7280aedbdb3253bdb9e9d5d84bb",
    }
    assert len(pipeline.calls) == 1
    call = pipeline.calls[0]
    assert call["prompt"] == "restore the concrete facade"
    assert call["negative_prompt"] == (
        "sloped roof, slanted roof, broken roof, ruins, cracks, damage, debris, "
        "hole, distorted architecture, blurry, transparent"
    )
    assert call["num_inference_steps"] == 30
    assert call["guidance_scale"] == 9.5
    assert call["controlnet_conditioning_scale"] == 0.5
    assert call["height"] == 512
    assert call["width"] == 512
    assert call["generator"].seed == 1_234_567
    for key in ("image", "mask_image", "control_image"):
        assert call[key].size == (512, 512)

    with Image.open(tmp_path / "repaired.png") as repaired:
        assert repaired.format == "PNG"
        assert repaired.mode == "RGB"
        assert repaired.size == (14, 10)
        assert repaired.getpixel((0, 5)) == (0, 0, 255)
        assert repaired.getpixel((13, 5)) == (255, 0, 0)


@pytest.mark.parametrize("field", ["input_path", "mask_path", "output_path"])
def test_request_rejects_paths_outside_its_directory(tmp_path: Path, field: str) -> None:
    """A crafted request must not read or overwrite files outside its owned directory."""
    request_dir = tmp_path / "request"
    request_dir.mkdir()
    outside = tmp_path / f"outside-{field}.png"
    if field != "output_path":
        Image.new("RGB", (2, 2), "black").save(outside, format="PNG")
    request = write_request(request_dir)
    payload = json.loads(request.read_text(encoding="utf-8"))
    payload[field] = str(outside)
    request.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(WorkerError, match="local_generation_failed"):
        run_request(request, loader=lambda **kwargs: pytest.fail("must not load models"))


def test_request_rejects_a_relative_file_path(tmp_path: Path) -> None:
    """Relative file paths could resolve differently from the API-owned request directory."""
    request = write_request(tmp_path)
    payload = json.loads(request.read_text(encoding="utf-8"))
    payload["input_path"] = "input.png"
    request.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(WorkerError, match="local_generation_failed"):
        run_request(request, loader=lambda **kwargs: pytest.fail("must not load models"))


def test_request_rejects_a_relative_request_path(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The CLI boundary requires an unambiguous absolute request location."""
    write_request(tmp_path)
    monkeypatch.chdir(tmp_path)

    with pytest.raises(WorkerError, match="local_generation_failed"):
        run_request(Path("request.json"), loader=lambda **kwargs: pytest.fail("must not load"))


def test_cli_bounds_an_embedded_nul_owned_path(tmp_path: Path) -> None:
    """A malformed absolute path must not escape the CLI as a traceback."""
    request = write_request(tmp_path)
    payload = json.loads(request.read_text(encoding="utf-8"))
    payload["input_path"] = f"{tmp_path}/bad\0.png"
    request.write_text(json.dumps(payload), encoding="utf-8")

    completed = subprocess.run(
        [sys.executable, "-m", "repair.controlnet_worker", "--request", str(request)],
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 1
    assert completed.stdout == ""
    assert completed.stderr == "local_generation_failed\n"
    assert not (tmp_path / "repaired.png").exists()


def test_cli_bounds_missing_opencv_during_control_preparation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """An unavailable Canny dependency must not escape before model loading."""
    request = write_request(tmp_path)
    monkeypatch.setitem(sys.modules, "cv2", None)

    returncode = main(
        ["--request", str(request)],
        loader=lambda **kwargs: pytest.fail("must not load models"),
    )

    captured = capsys.readouterr()
    assert returncode == 1
    assert captured.out == ""
    assert captured.err == "local_generation_failed\n"
    assert not (tmp_path / "repaired.png").exists()


@pytest.mark.parametrize(
    "contents",
    [
        "{not-json",
        "[]",
        json.dumps({"input_path": 7}),
    ],
)
def test_request_rejects_malformed_json(tmp_path: Path, contents: str) -> None:
    """Malformed worker input must become a bounded failure before model loading."""
    request = tmp_path / "request.json"
    request.write_text(contents, encoding="utf-8")

    with pytest.raises(WorkerError, match="local_generation_failed"):
        run_request(request, loader=lambda **kwargs: pytest.fail("must not load models"))


@pytest.mark.parametrize("flags", [[True], None, [], [False, False]])
def test_safety_result_fails_closed(tmp_path: Path, flags: object) -> None:
    """Missing, ambiguous, or unsafe checker results must never produce an artifact."""
    request = write_request(tmp_path)
    pipeline = FakePipeline(safety_flags=flags)

    with pytest.raises(WorkerError, match="local_generation_failed"):
        run_request(
            request,
            loader=lambda **kwargs: (
                pipeline,
                FakeGenerator,
                RuntimePolicy("float16", "model", False),
            ),
        )

    assert not (tmp_path / "repaired.png").exists()


def test_base_environment_probe_fails_promptly_without_loading_weights() -> None:
    """The CPU-only API venv reports GPU unavailability before touching Diffusers."""
    completed = subprocess.run(
        [sys.executable, "-m", "repair.controlnet_worker", "--probe"],
        check=False,
        capture_output=True,
        text=True,
        timeout=10,
    )

    assert completed.returncode != 0
    assert completed.stdout == ""
    assert completed.stderr.strip() == "local_gpu_unavailable"
