"""Compose must forward the repair-provider selection into the API service."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize("compose_file", ["docker-compose.yml", "docker-compose.prod.yml"])
def test_compose_exposes_local_repair_configuration(compose_file: str) -> None:
    """Rendered dev/prod stacks preserve all three documented repair settings."""
    environment = {
        **os.environ,
        "REPAIR_BACKEND": "local-controlnet",
        "LOCAL_REPAIR_PYTHON": "/opt/damagescale/venvs/repair/bin/python",
        "LOCAL_REPAIR_TIMEOUT_SECONDS": "321",
        "NEXT_PUBLIC_SUPABASE_URL": "https://example.supabase.co",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY": "public-anon-test-value",
        "NEXT_PUBLIC_API_URL": "https://api.example.test",
        "CORS_ORIGINS": "https://web.example.test",
        "DOMAIN_WEB": "web.example.test",
        "DOMAIN_API": "api.example.test",
    }
    completed = subprocess.run(
        ["docker", "compose", "-f", compose_file, "config", "--format", "json"],
        cwd=ROOT,
        env=environment,
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert completed.returncode == 0, completed.stderr
    config = json.loads(completed.stdout)
    api_environment = config["services"]["api"]["environment"]
    assert api_environment["REPAIR_BACKEND"] == "local-controlnet"
    assert (
        api_environment["LOCAL_REPAIR_PYTHON"]
        == "/opt/damagescale/venvs/repair/bin/python"
    )
    assert api_environment["LOCAL_REPAIR_TIMEOUT_SECONDS"] == "321"
