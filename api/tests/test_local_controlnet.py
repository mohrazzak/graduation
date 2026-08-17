"""The API reaches optional ControlNet only through a checked worker process."""

from __future__ import annotations

import io
import json
import struct
import subprocess
import zlib
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from PIL import Image

from jobs.local_controlnet import generate_local, local_available
from jobs.repair_errors import RepairUnavailable
from jobs.repair_providers import generate_with

Runner = Callable[..., subprocess.CompletedProcess[bytes]]


def _image_bytes(image_format: str = "JPEG") -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (7, 5), (25, 50, 75)).save(buffer, format=image_format)
    return buffer.getvalue()


def _decompression_bomb_header() -> bytes:
    payload = struct.pack(">IIBBBBB", 100_000, 100_000, 8, 2, 0, 0, 0)
    header = b"IHDR" + payload
    end = b"IEND"
    return (
        b"\x89PNG\r\n\x1a\n"
        + struct.pack(">I", len(payload))
        + header
        + struct.pack(">I", zlib.crc32(header) & 0xFFFFFFFF)
        + struct.pack(">I", 0)
        + end
        + struct.pack(">I", zlib.crc32(end) & 0xFFFFFFFF)
    )


def _incomplete_png() -> bytes:
    payload = struct.pack(">IIBBBBB", 7, 5, 8, 2, 0, 0, 0)
    header = b"IHDR" + payload
    end = b"IEND"
    return (
        b"\x89PNG\r\n\x1a\n"
        + struct.pack(">I", len(payload))
        + header
        + struct.pack(">I", zlib.crc32(header) & 0xFFFFFFFF)
        + struct.pack(">I", 0)
        + end
        + struct.pack(">I", zlib.crc32(end) & 0xFFFFFFFF)
    )


def _compressible_large_png() -> bytes:
    width = height = 10_000
    payload = struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)
    header = b"IHDR" + payload
    compressor = zlib.compressobj()
    scanline = b"\x00" * (width + 1)
    compressed = bytearray()
    for _ in range(height):
        compressed.extend(compressor.compress(scanline))
    compressed.extend(compressor.flush())
    data = b"IDAT" + bytes(compressed)
    end = b"IEND"
    return (
        b"\x89PNG\r\n\x1a\n"
        + struct.pack(">I", len(payload))
        + header
        + struct.pack(">I", zlib.crc32(header) & 0xFFFFFFFF)
        + struct.pack(">I", len(compressed))
        + data
        + struct.pack(">I", zlib.crc32(data) & 0xFFFFFFFF)
        + struct.pack(">I", 0)
        + end
        + struct.pack(">I", zlib.crc32(end) & 0xFFFFFFFF)
    )


def _successful_runner(
    seen: dict[str, Any], output: bytes
) -> Runner:
    def run(command: list[str], **kwargs: Any) -> subprocess.CompletedProcess[bytes]:
        request_path = Path(command[-1])
        request = json.loads(request_path.read_text())
        seen["command"] = command
        seen["kwargs"] = kwargs
        seen["request"] = request
        seen["input"] = Image.open(request["input_path"])
        seen["mask"] = Image.open(request["mask_path"])
        Path(request["output_path"]).write_bytes(output)
        return subprocess.CompletedProcess(command, 0, b"", b"")

    return run


def test_generation_uses_checked_absolute_worker_request_and_normalized_pngs() -> None:
    """A shell command or raw uploads would let request data escape the boundary."""
    expected = _image_bytes("PNG")
    source = _image_bytes()
    mask = Image.new("RGBA", (7, 5), (0, 255, 0, 125))
    seen: dict[str, Any] = {}

    result = generate_local(
        source,
        mask,
        "PC",
        "rebuild the facade; do not execute this",
        runner=_successful_runner(seen, expected),
        python="/safe/worker-python",
    )

    assert result == expected
    assert seen["command"][:4] == [
        "/safe/worker-python",
        "-m",
        "repair.controlnet_worker",
        "--request",
    ]
    assert len(seen["command"]) == 5
    assert seen["kwargs"] == {"shell": False, "timeout": 900, "capture_output": True}
    request = seen["request"]
    assert request["tier"] == "PC"
    assert request["prompt"] == "rebuild the facade; do not execute this"
    for key, name in (
        ("input_path", "input.png"),
        ("mask_path", "mask.png"),
        ("output_path", "repaired.png"),
    ):
        assert Path(request[key]).is_absolute()
        assert Path(request[key]).name == name
    assert seen["input"].format == "PNG"
    assert seen["input"].mode == "RGB"
    assert seen["input"].size == (7, 5)
    assert seen["mask"].format == "PNG"
    assert seen["mask"].mode == "L"
    assert seen["mask"].size == (7, 5)


def test_worker_timeout_has_a_stable_reason() -> None:
    """A wedged GPU worker must not leak a subprocess exception to a job."""

    def timeout(*args: Any, **kwargs: Any) -> subprocess.CompletedProcess[bytes]:
        raise subprocess.TimeoutExpired(args[0], kwargs["timeout"])

    with pytest.raises(RepairUnavailable) as error:
        generate_local(_image_bytes(), Image.new("L", (7, 5)), "GC", "repair", runner=timeout)
    assert error.value.reason == "local_timed_out"


def test_missing_worker_interpreter_has_a_stable_reason() -> None:
    """An optional repair environment that is absent is distinguishable from bad output."""

    def missing(*args: Any, **kwargs: Any) -> subprocess.CompletedProcess[bytes]:
        raise FileNotFoundError

    with pytest.raises(RepairUnavailable) as error:
        generate_local(_image_bytes(), Image.new("L", (7, 5)), "GC", "repair", runner=missing)
    assert error.value.reason == "local_dependency_missing"


def test_unsafe_source_image_has_a_stable_reason() -> None:
    """Pillow's decompression guard must not escape the worker boundary."""
    with pytest.raises(RepairUnavailable) as error:
        generate_local(
            _decompression_bomb_header(),
            Image.new("L", (7, 5)),
            "GC",
            "repair",
        )
    assert error.value.reason == "local_generation_failed"


@pytest.mark.parametrize(
    ("description", "returncode", "output"),
    [
        ("worker error", 2, _image_bytes("PNG")),
        ("missing output", 0, None),
        ("empty output", 0, b""),
        ("non-image output", 0, b"not an image"),
        ("jpeg output", 0, _image_bytes("JPEG")),
        ("oversized output", 0, b"x" * (25 * 1024 * 1024 + 1)),
        ("decompression bomb output", 0, _decompression_bomb_header()),
        ("incomplete png output", 0, _incomplete_png()),
    ],
)
def test_invalid_worker_output_has_a_stable_reason(
    description: str, returncode: int, output: bytes | None
) -> None:
    """A non-PNG or untrusted worker result must never reach artifact storage."""

    def run(command: list[str], **kwargs: Any) -> subprocess.CompletedProcess[bytes]:
        request = json.loads(Path(command[-1]).read_text())
        if output is not None:
            Path(request["output_path"]).write_bytes(output)
        return subprocess.CompletedProcess(command, returncode, b"", b"worker diagnostics")

    with pytest.raises(RepairUnavailable) as error:
        generate_local(_image_bytes(), Image.new("L", (7, 5)), "NC", description, runner=run)
    assert error.value.reason == "local_generation_failed"


def test_compressible_large_png_output_has_a_stable_reason() -> None:
    """A small PNG file cannot bypass the output pixel-safety limit."""
    output = _compressible_large_png()
    assert len(output) < 1024 * 1024

    with pytest.raises(RepairUnavailable) as error:
        generate_local(
            _image_bytes(),
            Image.new("L", (7, 5)),
            "NC",
            "repair",
            runner=_successful_runner({}, output),
        )
    assert error.value.reason == "local_generation_failed"


def test_successful_probe_is_cached_but_failed_probe_is_retried(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A repaired worker environment becomes usable without restarting FastAPI."""
    import jobs.local_controlnet as local_controlnet

    monkeypatch.setattr(local_controlnet, "_successful_probe", False)
    calls: list[str] = []

    def unavailable(command: list[str], **kwargs: Any) -> subprocess.CompletedProcess[bytes]:
        calls.append("failed")
        return subprocess.CompletedProcess(command, 1, b"", b"")

    assert local_available(runner=unavailable) is False
    assert local_available(runner=unavailable) is False
    assert calls == ["failed", "failed"]

    def ready(command: list[str], **kwargs: Any) -> subprocess.CompletedProcess[bytes]:
        calls.append("ready")
        assert command[1:] == ["-m", "repair.controlnet_worker", "--probe"]
        assert kwargs == {"shell": False, "timeout": 30, "capture_output": True}
        return subprocess.CompletedProcess(command, 0, b"", b"")

    assert local_available(runner=ready) is True
    assert local_available(runner=lambda *args, **kwargs: pytest.fail("must be cached"))
    assert calls == ["failed", "failed", "ready"]


def test_auto_fallback_records_the_named_local_failure(caplog: pytest.LogCaptureFixture) -> None:
    """Operators can distinguish a local outage from a successful Gemini fallback."""
    with caplog.at_level("WARNING", logger="jobs.repair_providers"):
        result = generate_with(
            "auto",
            local=lambda: (_ for _ in ()).throw(RepairUnavailable("local_gpu_unavailable")),
            gemini=lambda: b"gemini-result",
            local_ready=lambda: True,
    )

    assert result == b"gemini-result"
    assert any("local_gpu_unavailable" in message for message in caplog.messages)
