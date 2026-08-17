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
from collections.abc import Callable
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image

from jobs.repair_errors import RepairUnavailable
from predict.tiers import TierCode
from repair.controlnet_core import generation_seed

_API_ROOT = Path(__file__).resolve().parents[1]
_DEFAULT_PYTHON = _API_ROOT / ".venv-repair" / "bin" / "python"
_DEFAULT_TIMEOUT_SECONDS = 900
_PROBE_TIMEOUT_SECONDS = 30
_MIN_TIMEOUT_SECONDS = 30
_MAX_TIMEOUT_SECONDS = 3600
_MAX_OUTPUT_BYTES = 25 * 1024 * 1024
_MAX_LOGGED_STDERR_CHARS = 2048

logger = logging.getLogger(__name__)
Runner = Callable[..., subprocess.CompletedProcess[bytes]]
_successful_probe = False


def _worker_python() -> str:
    return os.environ.get("LOCAL_REPAIR_PYTHON", str(_DEFAULT_PYTHON))


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


def _save_normalized_png(image: Image.Image, path: Path, mode: str) -> None:
    image.convert(mode).save(path, format="PNG")


def _validated_output(output_path: Path) -> bytes:
    try:
        if not output_path.is_file() or output_path.stat().st_size == 0:
            raise ValueError("missing or empty output")
        if output_path.stat().st_size > _MAX_OUTPUT_BYTES:
            raise ValueError("output too large")
        output = output_path.read_bytes()
        with Image.open(io.BytesIO(output)) as candidate:
            candidate.verify()
        with Image.open(io.BytesIO(output)) as candidate:
            if candidate.format != "PNG" or min(candidate.size) <= 0:
                raise ValueError("output is not a non-empty PNG")
    except (Image.DecompressionBombError, OSError, ValueError) as exc:
        raise RepairUnavailable("local_generation_failed") from exc
    return output


def generate_local(
    image_bytes: bytes,
    building_mask: Image.Image,
    tier: TierCode,
    prompt: str,
    *,
    runner: Runner | None = None,
    python: str | None = None,
) -> bytes:
    """Generate through the isolated worker and accept only a valid PNG result."""
    run = runner or subprocess.run
    with TemporaryDirectory(prefix="controlnet-") as directory:
        work_dir = Path(directory)
        input_path = work_dir / "input.png"
        mask_path = work_dir / "mask.png"
        output_path = work_dir / "repaired.png"
        request_path = work_dir / "request.json"
        try:
            with Image.open(io.BytesIO(image_bytes)) as source:
                _save_normalized_png(source, input_path, "RGB")
            _save_normalized_png(building_mask, mask_path, "L")
        except (Image.DecompressionBombError, OSError, ValueError) as exc:
            raise RepairUnavailable("local_generation_failed") from exc

        request_path.write_text(
            json.dumps(
                {
                    "input_path": str(input_path.resolve()),
                    "mask_path": str(mask_path.resolve()),
                    "output_path": str(output_path.resolve()),
                    "tier": tier,
                    "prompt": prompt,
                    "seed": generation_seed(image_bytes, tier, prompt),
                }
            ),
            encoding="utf-8",
        )
        command = [
            python or _worker_python(),
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
            raise RepairUnavailable("local_generation_failed")
        return _validated_output(output_path)


def local_available(*, runner: Runner | None = None) -> bool:
    """Probe the worker without importing its optional dependencies in FastAPI."""
    global _successful_probe
    if _successful_probe:
        return True
    run = runner or subprocess.run
    try:
        completed = run(
            [_worker_python(), "-m", "repair.controlnet_worker", "--probe"],
            shell=False,
            timeout=_PROBE_TIMEOUT_SECONDS,
            capture_output=True,
        )
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired):
        return False
    if completed.returncode == 0:
        _successful_probe = True
        return True
    _log_worker_stderr(completed.stderr)
    return False
