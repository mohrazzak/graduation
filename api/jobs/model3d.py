"""3D reconstruction via Tripo AI: image -> textured GLB.

Ported from the team's generate_3d_fast.py. Tripo is already job/poll shaped,
which is why the whole service is modelled that way: upload the image, create a
task, poll until it succeeds, download the GLB.

The alternative in that repo — Depth Anything + Open3D — is NOT a fallback. It
emits a PLY point cloud and opens a desktop window: neither a textured mesh nor
web-renderable.
"""

from __future__ import annotations

import json
import os
import struct
import time
import urllib.error
import urllib.request

API_ROOT = "https://api.tripo3d.ai/v2/openapi"
MODEL_VERSION = "v2.5-20250123"

STAGE_KEYS = ("uploading", "reconstructing", "downloading")

# Tripo's own queue can take minutes; poll gently and give up rather than hang.
_POLL_SECONDS = 3
_MAX_POLL_SECONDS = 300
_MAX_GLB_BYTES = 32 * 1024 * 1024
_DOWNLOAD_CHUNK_BYTES = 64 * 1024


class Model3DUnavailable(RuntimeError):
    """Raised when 3D reconstruction cannot run (no key, quota, or failure)."""


def _download_glb(url: str) -> bytes:
    """Stream one bounded Tripo result and require its GLB v2 header contract."""
    with urllib.request.urlopen(url, timeout=300) as response:
        declared_length = response.headers.get("content-length")
        if declared_length is not None:
            try:
                declared_bytes = int(declared_length)
            except (TypeError, ValueError) as exc:
                raise Model3DUnavailable("backend_error") from exc
            if declared_bytes < 0 or declared_bytes > _MAX_GLB_BYTES:
                raise Model3DUnavailable("backend_error")

        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = response.read(_DOWNLOAD_CHUNK_BYTES)
            if not chunk:
                break
            total += len(chunk)
            if total > _MAX_GLB_BYTES:
                raise Model3DUnavailable("backend_error")
            chunks.append(chunk)

    glb = b"".join(chunks)
    if len(glb) < 12 or glb[:4] != b"glTF":
        raise Model3DUnavailable("backend_error")
    version, encoded_length = struct.unpack_from("<II", glb, 4)
    if version != 2 or encoded_length != len(glb):
        raise Model3DUnavailable("backend_error")
    return glb


def _post_multipart(url: str, key: str, image_bytes: bytes) -> dict:
    """Upload the image as multipart/form-data and return the parsed response."""
    boundary = "----damagescale-tripo-boundary"
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="file"; filename="input.png"\r\n'
        "Content-Type: image/png\r\n\r\n"
    ).encode() + image_bytes + f"\r\n--{boundary}--\r\n".encode()
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.load(response)


def _post_json(url: str, key: str, payload: dict) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        # Tripo reports an empty balance as HTTP 403 with body code 2010 — not
        # 402 — so the status alone would misreport it as a backend fault. This
        # is the error a $0 account actually hits, so it gets named properly.
        detail = exc.read().decode(errors="ignore")
        if exc.code == 403 and '"code":2010' in detail.replace(" ", ""):
            raise Model3DUnavailable("quota_exceeded") from exc
        raise


def account_balance(key: str) -> float | None:
    """Remaining Tripo credit, or None when the endpoint cannot be read.

    Used to tell "out of credit" apart from "broken" before spending a request.
    """
    try:
        data = _get_json(f"{API_ROOT}/user/balance", key)
        return float(data.get("data", {}).get("balance", 0))
    except Exception:  # noqa: BLE001 - a missing balance is not fatal
        return None


def _get_json(url: str, key: str) -> dict:
    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


def generate_glb(image_bytes: bytes, on_stage) -> bytes:  # noqa: ANN001 - callback
    """Reconstruct a textured GLB from one image.

    Args:
        image_bytes: the source photo (original upload, or a repaired render).
        on_stage: called with (stage_key, index) as each stage is reached.

    Raises:
        Model3DUnavailable: no key, or the remote task failed / timed out.
    """
    key = os.environ.get("TRIPO_API_KEY", "").strip()
    if not key:
        raise Model3DUnavailable("no_api_key")

    # A zero balance is the failure a free account actually hits. Checking it
    # first turns a confusing mid-pipeline 403 into an immediate, honest reason.
    balance = account_balance(key)
    if balance is not None and balance <= 0:
        raise Model3DUnavailable("quota_exceeded")

    try:
        on_stage("uploading", 1)
        uploaded = _post_multipart(f"{API_ROOT}/upload", key, image_bytes)
        if uploaded.get("code") != 0:
            raise Model3DUnavailable("upload_failed")
        image_token = uploaded["data"]["image_token"]

        on_stage("reconstructing", 2)
        # The type is set explicitly rather than inferred from a filename: on the
        # from_job path the input is a generated PNG with no name at all.
        task = _post_json(
            f"{API_ROOT}/task",
            key,
            {
                "type": "image_to_model",
                "model_version": MODEL_VERSION,
                "texture": True,
                "pbr": True,
                "file": {"type": "png", "file_token": image_token},
            },
        )
        if task.get("code") != 0:
            raise Model3DUnavailable("task_failed")
        task_id = task["data"]["task_id"]

        deadline = time.monotonic() + _MAX_POLL_SECONDS
        model_url = None
        while time.monotonic() < deadline:
            status = _get_json(f"{API_ROOT}/task/{task_id}", key)
            state = status.get("data", {}).get("status")
            if state == "success":
                output = status["data"]["output"]
                model_url = output.get("pbr_model") or output.get("model")
                break
            if state == "failed":
                raise Model3DUnavailable("generation_failed")
            time.sleep(_POLL_SECONDS)
        if model_url is None:
            raise Model3DUnavailable("timed_out")

        on_stage("downloading", 3)
        return _download_glb(model_url)
    except urllib.error.HTTPError as exc:
        raise Model3DUnavailable(
            "quota_exceeded" if exc.code in (402, 429) else "backend_error"
        ) from exc
    except Model3DUnavailable:
        raise
    except Exception as exc:  # noqa: BLE001
        raise Model3DUnavailable("backend_error") from exc


def run(job_id: str, image_bytes: bytes) -> None:
    """Execute 3D reconstruction on a worker thread, recording stages."""
    from jobs.store import store

    try:
        glb = generate_glb(
            image_bytes, lambda key, index: store.start_stage(job_id, key, index)
        )
        store.add_artifact(job_id, "model", glb, "model/gltf-binary")
        store.finish(job_id)
    except Model3DUnavailable as exc:
        store.fail(job_id, str(exc.args[0] if exc.args else "backend_error"))
    except Exception as exc:  # noqa: BLE001 - a worker thread must never die silently
        store.fail(job_id, f"unexpected: {type(exc).__name__}")
