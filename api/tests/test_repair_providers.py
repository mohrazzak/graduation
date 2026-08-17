"""Provider selection keeps local ControlNet optional and Gemini compatible."""

import io
import json
import struct
import subprocess
import zlib
from pathlib import Path

import pytest
from PIL import Image

from jobs.local_controlnet import generate_local
from jobs.repair_providers import RepairUnavailable, generate_with, parse_backend

PNG = b"\x89PNG\r\n\x1a\nprovider-test"


def _jpeg() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (7, 5), (25, 50, 75)).save(buffer, format="JPEG")
    return buffer.getvalue()


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


def _malformed_local_result() -> bytes:
    def runner(command: list[str], **kwargs: object) -> subprocess.CompletedProcess[bytes]:
        request = json.loads(Path(command[-1]).read_text())
        Path(request["output_path"]).write_bytes(_incomplete_png())
        return subprocess.CompletedProcess(command, 0, b"", b"")

    return generate_local(_jpeg(), Image.new("L", (7, 5)), "GC", "repair", runner=runner)


def test_auto_uses_local_first() -> None:
    """A working local provider prevents an unnecessary Gemini request."""
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
    """An unavailable local generation does not make auto mode unavailable."""
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


def test_auto_falls_back_after_malformed_local_worker_output() -> None:
    """Malformed worker bytes are normalized before auto mode selects Gemini."""
    result = generate_with(
        "auto",
        local=_malformed_local_result,
        gemini=lambda: PNG,
        local_ready=lambda: True,
    )
    assert result == PNG


def test_forced_local_never_falls_back() -> None:
    """Explicit local mode returns its usable failure key to the caller."""
    with pytest.raises(RepairUnavailable, match="local_gpu_unavailable"):
        generate_with(
            "local-controlnet",
            local=lambda: (_ for _ in ()).throw(
                RepairUnavailable("local_gpu_unavailable")
            ),
            gemini=lambda: pytest.fail("must not fall back"),
            local_ready=lambda: False,
        )


def test_gemini_mode_never_tries_local() -> None:
    """Gemini-only deployments retain their existing request path."""
    result = generate_with(
        "gemini",
        local=lambda: pytest.fail("must not try local"),
        gemini=lambda: PNG,
        local_ready=lambda: pytest.fail("must not probe local"),
    )
    assert result == PNG


def test_auto_uses_gemini_when_local_is_unready() -> None:
    """A failed readiness probe is not a terminal error in auto mode."""
    result = generate_with(
        "auto",
        local=lambda: pytest.fail("must not generate locally"),
        gemini=lambda: PNG,
        local_ready=lambda: False,
    )
    assert result == PNG


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (None, "auto"),
        ("auto", "auto"),
        ("local-controlnet", "local-controlnet"),
        ("gemini", "gemini"),
    ],
)
def test_parse_backend_accepts_the_documented_values(
    raw: str | None, expected: str
) -> None:
    """Only documented backend selections may reach generation."""
    assert parse_backend(raw) == expected


def test_parse_backend_rejects_invalid_configuration() -> None:
    """A typo must not silently redirect a repair request to another provider."""
    with pytest.raises(RepairUnavailable, match="invalid_repair_backend") as error:
        parse_backend("controlnet")
    assert error.value.reason == "invalid_repair_backend"
