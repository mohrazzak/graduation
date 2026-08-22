"""Checked subprocess boundary for the optional local ControlNet worker.

This module deliberately contains no Diffusers or CUDA imports.  FastAPI owns
only validated request files and receives only validated PNG bytes back.
"""

from __future__ import annotations

import io
import json
import logging
import os
import subprocess
import warnings
from collections.abc import Callable
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image

from jobs.repair_errors import RepairUnavailable
from predict.damage_classes import DamageCode
from repair.controlnet_core import generation_seed

_API_ROOT = Path(__file__).resolve().parents[1]
_DEFAULT_PYTHON = _API_ROOT / ".venv-repair" / "bin" / "python"
_DEFAULT_TIMEOUT_SECONDS = 900
_PROBE_TIMEOUT_SECONDS = 30
_MIN_TIMEOUT_SECONDS = 30
_MAX_TIMEOUT_SECONDS = 3600
_MAX_OUTPUT_BYTES = 25 * 1024 * 1024
_MAX_LOGGED_STDERR_CHARS = 2048
_MAX_WORKER_REASON_BYTES = 128
_WORKER_REASONS = frozenset(
    (
        "local_dependency_missing",
        "local_gpu_unavailable",
        "local_model_unavailable",
        "local_generation_failed",
    )
)

logger = logging.getLogger(__name__)
Runner = Callable[..., subprocess.CompletedProcess[bytes]]
_successful_probe = False


def _worker_python() -> str:
    raw = os.environ.get("LOCAL_REPAIR_PYTHON")
    if raw is None or not raw.strip():
        return str(_DEFAULT_PYTHON)
    path = Path(raw.strip())
    if not path.is_absolute():
        raise RepairUnavailable("local_dependency_missing")
    return str(path)


def _timeout_seconds() -> int:
    raw = os.environ.get("LOCAL_REPAIR_TIMEOUT_SECONDS")
    if raw is None:
        return _DEFAULT_TIMEOUT_SECONDS
    try:
        timeout = int(raw)
    except ValueError as exc:
        raise RepairUnavailable("local_generation_failed") from exc
    if not _MIN_TIMEOUT_SECONDS <= timeout <= _MAX_TIMEOUT_SECONDS:
        raise RepairUnavailable("local_generation_failed")
    return timeout


def _log_worker_stderr(stderr: bytes | str | None) -> None:
    if not stderr:
        return
    if isinstance(stderr, bytes):
        stderr = stderr.decode("utf-8", errors="replace")
    logger.warning("local ControlNet worker failed: %s", stderr[:_MAX_LOGGED_STDERR_CHARS])


def _worker_failure_reason(stderr: bytes | str | None) -> str:
    """Return only one exact, bounded worker reason from the public whitelist."""
    if stderr is None:
        return "local_generation_failed"
    encoded = stderr if isinstance(stderr, bytes) else stderr.encode("utf-8", errors="replace")
    if len(encoded) > _MAX_WORKER_REASON_BYTES:
        return "local_generation_failed"
    try:
        candidate = encoded.decode("ascii")
    except UnicodeDecodeError:
        return "local_generation_failed"
    if candidate.endswith("\r\n"):
        candidate = candidate[:-2]
    elif candidate.endswith("\n"):
        candidate = candidate[:-1]
    return candidate if candidate in _WORKER_REASONS else "local_generation_failed"


def _save_normalized_png(image: Image.Image, path: Path, mode: str) -> None:
    image.convert(mode).save(path, format="PNG")


def _validated_output(output_path: Path) -> bytes:
    try:
        if not output_path.is_file() or output_path.stat().st_size == 0:
            raise ValueError("missing or empty output")
        if output_path.stat().st_size > _MAX_OUTPUT_BYTES:
            raise ValueError("output too large")
        output = output_path.read_bytes()
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(output)) as candidate:
                candidate.verify()
            with Image.open(io.BytesIO(output)) as candidate:
                if candidate.format != "PNG" or min(candidate.size) <= 0:
                    raise ValueError("output is not a non-empty PNG")
    except Exception as exc:  # noqa: BLE001 - malformed output must never escape this boundary
        raise RepairUnavailable("local_generation_failed") from exc
    return output


def generate_local(
    image_bytes: bytes,
    selection_mask: Image.Image,
    class_code: DamageCode,
    prompt: str,
    *,
    runner: Runner | None = None,
    python: str | None = None,
) -> bytes:
    """Generate through the isolated worker and accept only a valid PNG result."""
    run = runner or subprocess.run
    worker_python = python or _worker_python()
    if not Path(worker_python).is_absolute():
        raise RepairUnavailable("local_dependency_missing")
    with TemporaryDirectory(prefix="controlnet-") as directory:
        work_dir = Path(directory)
        input_path = work_dir / "input.png"
        mask_path = work_dir / "mask.png"
        output_path = work_dir / "repaired.png"
        request_path = work_dir / "request.json"
        try:
            with Image.open(io.BytesIO(image_bytes)) as source:
                _save_normalized_png(source, input_path, "RGB")
            _save_normalized_png(selection_mask, mask_path, "L")
        except (Image.DecompressionBombError, OSError, ValueError) as exc:
            raise RepairUnavailable("local_generation_failed") from exc

        try:
            request_path.write_text(
                json.dumps(
                    {
                        "input_path": str(input_path.resolve()),
                        "mask_path": str(mask_path.resolve()),
                        "output_path": str(output_path.resolve()),
                        "class_code": class_code,
                        "prompt": prompt,
                        "seed": generation_seed(image_bytes, class_code, prompt),
                    }
                ),
                encoding="utf-8",
            )
        except (OSError, RuntimeError, UnicodeError, ValueError) as exc:
            raise RepairUnavailable("local_generation_failed") from exc
        command = [
            worker_python,
            "-m",
            "repair.controlnet_worker",
            "--request",
            str(request_path.resolve()),
        ]
        try:
            completed = run(
                command,
                shell=False,
                timeout=_timeout_seconds(),
                capture_output=True,
            )
        except subprocess.TimeoutExpired as exc:
            raise RepairUnavailable("local_timed_out") from exc
        except FileNotFoundError as exc:
            raise RepairUnavailable("local_dependency_missing") from exc
        except OSError as exc:
            raise RepairUnavailable("local_generation_failed") from exc
        if completed.returncode != 0:
            _log_worker_stderr(completed.stderr)
            raise RepairUnavailable(_worker_failure_reason(completed.stderr))
        return _validated_output(output_path)


def local_available(*, runner: Runner | None = None) -> bool:
    """Probe the worker without importing its optional dependencies in FastAPI."""
    global _successful_probe
    if _successful_probe:
        return True
    run = runner or subprocess.run
    try:
        worker_python = _worker_python()
        completed = run(
            [worker_python, "-m", "repair.controlnet_worker", "--probe"],
            shell=False,
            timeout=_PROBE_TIMEOUT_SECONDS,
            capture_output=True,
        )
    except (RepairUnavailable, FileNotFoundError, OSError, subprocess.TimeoutExpired):
        return False
    if completed.returncode == 0:
        _successful_probe = True
        return True
    _log_worker_stderr(completed.stderr)
    return False
