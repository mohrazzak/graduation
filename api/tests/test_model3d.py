"""Tripo downloads are bounded streams and must be structurally valid GLB files."""

from __future__ import annotations

import io
import struct
from typing import Any

import pytest

from jobs import model3d
from jobs.model3d import Model3DUnavailable

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def _padded_json(value: bytes) -> bytes:
    return value + b" " * (-len(value) % 4)


def _glb_body(body: bytes) -> bytes:
    return b"glTF" + struct.pack("<II", 2, 12 + len(body)) + body


def _glb_chunks(*chunks: tuple[int, bytes]) -> bytes:
    return _glb_body(
        b"".join(
            struct.pack("<II", len(payload), chunk_type) + payload
            for chunk_type, payload in chunks
        )
    )


def valid_glb(*, with_bin: bool = False) -> bytes:
    chunks = [(JSON_CHUNK, _padded_json(b'{"asset":{"version":"2.0"}}'))]
    if with_bin:
        chunks.append((BIN_CHUNK, b"\x01\x02\x03\x00"))
    return _glb_chunks(*chunks)


class DownloadResponse:
    def __init__(
        self,
        data: bytes = b"",
        *,
        content_length: int | None = None,
        generated_bytes: int = 0,
    ) -> None:
        self.headers = (
            {} if content_length is None else {"content-length": str(content_length)}
        )
        self._stream = io.BytesIO(data)
        self._generated_bytes = generated_bytes
        self.read_calls: list[int] = []

    def __enter__(self) -> DownloadResponse:
        return self

    def __exit__(self, *_args: object) -> None:
        self._stream.close()

    def read(self, size: int = -1) -> bytes:
        self.read_calls.append(size)
        if self._generated_bytes > 0:
            amount = self._generated_bytes if size < 0 else min(size, self._generated_bytes)
            self._generated_bytes -= amount
            return b"x" * amount
        return self._stream.read(size)


def install_download(
    monkeypatch: pytest.MonkeyPatch, response: DownloadResponse
) -> None:
    monkeypatch.setattr(
        model3d.urllib.request,
        "urlopen",
        lambda *_args, **_kwargs: response,
    )


def test_download_glb_streams_and_returns_valid_bytes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    expected = valid_glb()
    response = DownloadResponse(expected, content_length=len(expected))
    install_download(monkeypatch, response)

    assert model3d._download_glb("https://models.example/result.glb") == expected
    assert response.read_calls
    assert all(0 < size <= 64 * 1024 for size in response.read_calls)


@pytest.mark.parametrize("with_bin", (False, True), ids=("json-only", "json-then-bin"))
def test_download_glb_accepts_the_permitted_v2_chunk_order(
    monkeypatch: pytest.MonkeyPatch,
    with_bin: bool,
) -> None:
    expected = valid_glb(with_bin=with_bin)
    install_download(monkeypatch, DownloadResponse(expected))

    assert model3d._download_glb("https://models.example/result.glb") == expected


@pytest.mark.parametrize(
    ("_description", "payload"),
    [
        ("header only", _glb_body(b"")),
        (
            "truncated chunk header",
            _glb_body(
                struct.pack("<II", 4, JSON_CHUNK) + b"{}  " + b"\x00\x00\x00\x00"
            ),
        ),
        ("chunk data overrun", _glb_body(struct.pack("<II", 8, JSON_CHUNK) + b"{}  ")),
        ("unaligned chunk", _glb_body(struct.pack("<II", 3, JSON_CHUNK) + b"{} ")),
        ("invalid UTF-8 JSON", _glb_chunks((JSON_CHUNK, b'"\xff" '))),
        ("invalid JSON", _glb_chunks((JSON_CHUNK, b"{]  "))),
        (
            "BIN before JSON",
            _glb_chunks(
                (BIN_CHUNK, b"\x00\x00\x00\x00"),
                (JSON_CHUNK, _padded_json(b"{}")),
            ),
        ),
        (
            "duplicate JSON",
            _glb_chunks(
                (JSON_CHUNK, _padded_json(b"{}")),
                (JSON_CHUNK, _padded_json(b"{}")),
            ),
        ),
        (
            "unknown chunk",
            _glb_chunks(
                (JSON_CHUNK, _padded_json(b"{}")),
                (0x12345678, b"\x00\x00\x00\x00"),
            ),
        ),
        (
            "extra BIN chunk",
            _glb_chunks(
                (JSON_CHUNK, _padded_json(b"{}")),
                (BIN_CHUNK, b"\x00\x00\x00\x00"),
                (BIN_CHUNK, b"\x00\x00\x00\x00"),
            ),
        ),
    ],
)
def test_download_glb_rejects_invalid_v2_container_structure(
    monkeypatch: pytest.MonkeyPatch,
    _description: str,
    payload: bytes,
) -> None:
    install_download(monkeypatch, DownloadResponse(payload))

    with pytest.raises(Model3DUnavailable, match="backend_error"):
        model3d._download_glb("https://models.example/result.glb")


def test_download_glb_rejects_an_oversized_content_length_before_reading(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    response = DownloadResponse(valid_glb(), content_length=32 * 1024 * 1024 + 1)
    install_download(monkeypatch, response)

    with pytest.raises(Model3DUnavailable, match="backend_error"):
        model3d._download_glb("https://models.example/result.glb")
    assert response.read_calls == []


def test_download_glb_rejects_an_oversized_stream_without_a_length_header(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    response = DownloadResponse(generated_bytes=32 * 1024 * 1024 + 1)
    install_download(monkeypatch, response)

    with pytest.raises(Model3DUnavailable, match="backend_error"):
        model3d._download_glb("https://models.example/result.glb")
    assert response._generated_bytes == 0


@pytest.mark.parametrize(
    "mutate",
    [
        lambda data: b"not a glb",
        lambda data: b"BAD!" + data[4:],
        lambda data: data[:4] + struct.pack("<I", 1) + data[8:],
        lambda data: data[:8] + struct.pack("<I", len(data) + 4) + data[12:],
    ],
)
def test_download_glb_rejects_wrong_or_corrupt_structure(
    monkeypatch: pytest.MonkeyPatch,
    mutate: Any,
) -> None:
    response = DownloadResponse(mutate(valid_glb()))
    install_download(monkeypatch, response)

    with pytest.raises(Model3DUnavailable, match="backend_error"):
        model3d._download_glb("https://models.example/result.glb")
