"""The job API: creation, gating, polling, artifacts, and honest failure."""

import io
import json
import struct
import subprocess
import threading
import time
import zlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from jobs import model3d, repair
from jobs.local_controlnet import generate_local
from jobs.repair_errors import RepairUnavailable
from jobs.store import store
from main import create_app


@pytest.fixture(autouse=True)
def _mock_roster(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENABLED_MODELS", "mock")


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


def _jpeg() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (160, 120), (110, 105, 100)).save(buffer, format="JPEG")
    return buffer.getvalue()


def _png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (160, 120), (110, 105, 100)).save(buffer, format="PNG")
    return buffer.getvalue()


def _files():
    return {"file": ("b.jpg", _jpeg(), "image/jpeg")}


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


def _malformed_local_generation(**kwargs: object) -> bytes:
    def runner(command: list[str], **run_kwargs: object) -> subprocess.CompletedProcess[bytes]:
        request = json.loads(Path(command[-1]).read_text())
        Path(request["output_path"]).write_bytes(_incomplete_png())
        return subprocess.CompletedProcess(command, 0, b"", b"")

    return generate_local(
        kwargs["image_bytes"],
        kwargs["building_mask"],
        kwargs["tier"],
        kwargs["prompt"],
        runner=runner,
    )


def _wait(client: TestClient, job_id: str, timeout: float = 120.0) -> dict:
    """Poll until the job settles, mirroring what the browser client does."""
    deadline = time.monotonic() + timeout
    body: dict = {}
    while time.monotonic() < deadline:
        body = client.get(f"/jobs/{job_id}").json()
        if body["status"] in ("done", "error"):
            return body
        time.sleep(0.4)
    return body


def test_repair_requires_a_tier(client: TestClient) -> None:
    """Restoration is gated on classification — no tier, no job."""
    response = client.post("/jobs/repair", files=_files())
    assert response.status_code == 400


def test_repair_rejects_a_non_tier_value(client: TestClient) -> None:
    response = client.post("/jobs/repair", files=_files(), data={"tier": "LEVEL_4"})
    assert response.status_code == 400
    assert "NC" in response.json()["detail"]


def test_repair_passes_the_raw_mask_and_tier_to_the_selected_provider(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The provider receives the Pillow mask, while local artifacts remain public.

    They are what the interactive canvas shows, so they cannot depend on quota.
    """
    seen: dict[str, object] = {}

    def generate_repaired(**kwargs: object) -> bytes:
        seen.update(kwargs)
        return _png()

    monkeypatch.setattr(repair, "generate_repaired", generate_repaired)
    started = client.post("/jobs/repair", files=_files(), data={"tier": "PC"})
    assert started.status_code == 200
    job_id = started.json()["job_id"]

    body = _wait(client, job_id)
    assert body["status"] == "done"
    assert "mask" in body["artifacts"]
    assert "edges" in body["artifacts"]
    assert "repaired" in body["artifacts"]
    assert seen["image_bytes"] == _jpeg()
    assert seen["tier"] == "PC"
    assert seen["prompt"]
    assert isinstance(seen["building_mask"], Image.Image)
    assert seen["building_mask"].mode == "L"
    assert seen["building_mask"].size == (160, 120)

    for name in ("mask", "edges", "repaired"):
        artifact = client.get(f"/jobs/{job_id}/artifact/{name}")
        assert artifact.status_code == 200
        assert artifact.headers["content-type"] == "image/png"
        assert Image.open(io.BytesIO(artifact.content)).format == "PNG"


def test_repair_reports_a_named_reason_when_generation_cannot_run(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A missing key is a named cause, not a stack trace."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    job_id = client.post(
        "/jobs/repair", files=_files(), data={"tier": "GC"}
    ).json()["job_id"]
    body = _wait(client, job_id)
    assert body["status"] == "error"
    assert body["detail"] == "no_api_key"


def test_repair_reports_named_local_failure_for_malformed_worker_output(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A local validation error must not be downgraded to an unexpected job crash."""
    monkeypatch.setattr(repair, "generate_repaired", _malformed_local_generation)
    job_id = client.post(
        "/jobs/repair", files=_files(), data={"tier": "GC"}
    ).json()["job_id"]

    body = _wait(client, job_id)

    assert body["status"] == "error"
    assert body["detail"] == "local_generation_failed"


def test_invalid_repair_backend_is_a_stable_job_error(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A deployment typo must fail closed without losing preparation artifacts."""
    monkeypatch.setenv("REPAIR_BACKEND", "controlnet")
    job_id = client.post(
        "/jobs/repair", files=_files(), data={"tier": "GC"}
    ).json()["job_id"]

    body = _wait(client, job_id)

    assert body["status"] == "error"
    assert body["detail"] == "invalid_repair_backend"
    assert "mask" in body["artifacts"]
    assert "edges" in body["artifacts"]
    assert "repaired" not in body["artifacts"]


@pytest.mark.parametrize(
    "reason",
    (
        "local_dependency_missing",
        "local_gpu_unavailable",
        "local_model_unavailable",
        "local_timed_out",
        "local_generation_failed",
    ),
)
def test_local_controlnet_failure_keeps_preparation_artifacts_and_reason(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, reason: str
) -> None:
    """Forced local failures keep the useful local artifacts and their stable key."""
    monkeypatch.setenv("REPAIR_BACKEND", "local-controlnet")

    def unavailable(*_args: object, **_kwargs: object) -> bytes:
        raise RepairUnavailable(reason)

    monkeypatch.setattr("jobs.local_controlnet.generate_local", unavailable)
    job_id = client.post(
        "/jobs/repair", files=_files(), data={"tier": "GC"}
    ).json()["job_id"]

    body = _wait(client, job_id)

    assert body["status"] == "error"
    assert body["detail"] == reason
    assert "mask" in body["artifacts"]
    assert "edges" in body["artifacts"]
    assert "repaired" not in body["artifacts"]


def test_model3d_without_a_key_fails_with_a_reason(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("TRIPO_API_KEY", raising=False)
    job_id = client.post("/jobs/model3d", files=_files()).json()["job_id"]
    body = _wait(client, job_id, timeout=60)
    assert body["status"] == "error"
    assert body["detail"] == "no_api_key"
    assert body["timing"]["elapsed_ms"] >= 0
    # Credential validation happens before the first reconstruction stage, so
    # the API truthfully reports no stage rather than inventing one.
    assert body["timing"]["stages"] == []


def test_model3d_rejects_an_unknown_source_job(client: TestClient) -> None:
    response = client.post("/jobs/model3d", data={"from_job": "does-not-exist"})
    assert response.status_code == 400


def test_model3d_from_job_receives_the_exact_repaired_png_bytes(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The repair-to-3D API path must not re-encode or otherwise alter its source."""
    buffer = io.BytesIO()
    Image.new("RGBA", (3, 2), (10, 20, 30, 40)).save(buffer, format="PNG")
    expected = buffer.getvalue()
    repair_job = store.create("repair", stage_total=len(repair.STAGE_KEYS))
    store.add_artifact(repair_job.id, "repaired", expected, "image/png")
    store.finish(repair_job.id)
    received: dict[str, bytes] = {}
    completed = threading.Event()

    def capture_input(_job_id: str, image_bytes: bytes) -> None:
        received["image_bytes"] = image_bytes
        completed.set()

    monkeypatch.setattr(model3d, "run", capture_input)
    response = client.post("/jobs/model3d", data={"from_job": repair_job.id})

    assert response.status_code == 200
    assert completed.wait(2)
    assert received["image_bytes"] == expected


def test_unknown_job_is_404(client: TestClient) -> None:
    assert client.get("/jobs/nope").status_code == 404
    assert client.get("/jobs/nope/artifact/mask").status_code == 404


def test_missing_artifact_is_404(client: TestClient) -> None:
    job_id = client.post(
        "/jobs/repair", files=_files(), data={"tier": "NC"}
    ).json()["job_id"]
    _wait(client, job_id)
    assert client.get(f"/jobs/{job_id}/artifact/not-a-thing").status_code == 404


def test_stage_reporting_never_exceeds_the_declared_total(client: TestClient) -> None:
    """The client renders index/total; a stage past the end would break it."""
    job_id = client.post(
        "/jobs/repair", files=_files(), data={"tier": "PC"}
    ).json()["job_id"]
    seen = []
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        body = client.get(f"/jobs/{job_id}").json()
        if body.get("stage"):
            seen.append((body["stage"]["index"], body["stage"]["total"]))
        if body["status"] in ("done", "error"):
            break
        time.sleep(0.2)
    assert all(0 < index <= total for index, total in seen)
