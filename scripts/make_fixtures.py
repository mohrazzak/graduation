"""Regenerate the pre-generated demo fixtures (spec §12).

Fixtures exist so a dead API quota degrades the demo instead of emptying it.
They are REAL outputs of the real services, produced ahead of time — never
mock-ups — and every surface that shows one labels it as pre-generated.

    python3 scripts/make_fixtures.py            # fill in whatever is missing
    python3 scripts/make_fixtures.py --force    # regenerate everything

3D goes through the running API (so it exercises the same code path the app
does); restoration calls Gemini directly, because the API's repair job also runs
the local mask/edge stages that a fixture does not need.

Both services are free-tier and run dry regularly. A service that is out of
credit is reported and skipped — it is never a reason to write a placeholder.
"""

from __future__ import annotations

import argparse
import base64
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "web" / "public" / "samples"
FIXTURES = ROOT / "web" / "public" / "fixtures"
TIERS = ("NC", "PC", "GC")

API = "http://localhost:8000"
GEMINI_MODEL = "gemini-2.5-flash-image"
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)

# Mirrors jobs/repair.py so a fixture looks like what the live path produces.
REPAIR_PROMPT = (
    "You are an architectural restoration visualizer. Edit this photograph of a "
    "damaged building to show the SAME building fully repaired and restored. "
    "Rebuild damaged or collapsed walls, replace broken or missing windows and "
    "doors, remove rubble, debris, scorch marks, smoke and graffiti, and return "
    "the facade to a clean, structurally sound condition. Keep the same building, "
    "the same architectural style, the same camera viewpoint, and the same "
    "surroundings and lighting. Produce a single photorealistic image."
)


def env(name: str) -> str:
    """Read a key from the repo's .env (not the shell) so runs are reproducible."""
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith(f"{name}="):
            return line.split("=", 1)[1].strip()
    return ""


def make_model3d(tier: str) -> str:
    """Generate the 3D fixture for one sample via the running API."""
    photo = SAMPLES / f"sample-{tier}.jpg"
    boundary = "----fixtures"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{photo.name}"\r\n'
        "Content-Type: image/jpeg\r\n\r\n"
    ).encode() + photo.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    request = urllib.request.Request(
        f"{API}/jobs/model3d",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        job_id = json.load(response)["job_id"]

    deadline = time.monotonic() + 480
    while time.monotonic() < deadline:
        with urllib.request.urlopen(f"{API}/jobs/{job_id}", timeout=60) as response:
            state = json.load(response)
        if state["status"] == "done":
            with urllib.request.urlopen(
                f"{API}/jobs/{job_id}/artifact/model", timeout=300
            ) as response:
                glb = response.read()
            (FIXTURES / f"sample-{tier}.glb").write_bytes(glb)
            return f"wrote sample-{tier}.glb ({len(glb) / 1e6:.2f} MB)"
        if state["status"] == "error":
            return f"SKIPPED — service reported {state['detail']}"
        time.sleep(5)
    return "SKIPPED — timed out"


def make_repair(tier: str) -> str:
    """Generate the restoration fixture for one sample via Gemini."""
    key = env("GEMINI_API_KEY")
    if not key:
        return "SKIPPED — no GEMINI_API_KEY"
    photo = SAMPLES / f"sample-{tier}.jpg"
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": REPAIR_PROMPT},
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": base64.b64encode(photo.read_bytes()).decode(),
                        }
                    },
                ]
            }
        ]
    }
    request = urllib.request.Request(
        f"{GEMINI_URL}?key={key}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            data = json.load(response)
    except urllib.error.HTTPError as exc:
        if exc.code == 429:
            return "SKIPPED — quota exhausted (free tier resets daily)"
        return f"SKIPPED — HTTP {exc.code}"

    parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    for part in parts:
        inline = part.get("inlineData") or part.get("inline_data")
        if inline and inline.get("data"):
            image = base64.b64decode(inline["data"])
            (FIXTURES / f"sample-{tier}-repaired.png").write_bytes(image)
            return f"wrote sample-{tier}-repaired.png ({len(image) / 1e6:.2f} MB)"
    return "SKIPPED — model returned no image"


def main() -> int:
    parser = argparse.ArgumentParser(description="Regenerate demo fixtures.")
    parser.add_argument("--force", action="store_true", help="regenerate existing ones")
    parser.add_argument("--only", choices=("3d", "repair"), help="limit to one service")
    args = parser.parse_args()

    FIXTURES.mkdir(parents=True, exist_ok=True)
    jobs: list[tuple[str, str, pathlib.Path]] = []
    for tier in TIERS:
        if args.only != "repair":
            jobs.append(("3d", tier, FIXTURES / f"sample-{tier}.glb"))
        if args.only != "3d":
            jobs.append(("repair", tier, FIXTURES / f"sample-{tier}-repaired.png"))

    for kind, tier, target in jobs:
        if target.exists() and not args.force:
            print(f"  {kind:6} {tier}: present, skipping")
            continue
        print(f"  {kind:6} {tier}: generating...", flush=True)
        try:
            result = make_model3d(tier) if kind == "3d" else make_repair(tier)
        except Exception as exc:  # noqa: BLE001 - one failure must not stop the rest
            result = f"FAILED — {type(exc).__name__}: {exc}"
        print(f"  {kind:6} {tier}: {result}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
