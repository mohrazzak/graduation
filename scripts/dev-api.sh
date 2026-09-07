#!/usr/bin/env bash
# Start the FastAPI backend the way the demo needs it: real Trained Model,
# generation keys loaded, local ControlNet repair available.
#
# Env comes from the repo-root .env so there is one source of truth shared with
# docker compose. Weights live OUTSIDE the repo (RAED_WEIGHTS_PATH).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root/api"

# .env is shared with docker compose, which must stay on the mock, so the
# caller's roster is captured BEFORE sourcing and reapplied after. The same
# applies to CORS_ORIGINS: serving the web app on any port but 3000 needs that
# origin allowed, or the browser blocks /predict while the API logs a 200.
caller_models="${ENABLED_MODELS:-}"
caller_cors="${CORS_ORIGINS:-}"

if [[ -f "$repo_root/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$repo_root/.env"
  set +a
fi

export ENABLED_MODELS="${caller_models:-raed}"
if [[ -n "$caller_cors" ]]; then export CORS_ORIGINS="$caller_cors"; fi

# The CUDA-enabled training venv doubles as the isolated repair worker; the API
# venv is deliberately CPU-only (see CLAUDE.md on the segfault-safe torch pin).
export LOCAL_REPAIR_PYTHON="${LOCAL_REPAIR_PYTHON:-/home/mohrazzak/projects/graduation/.venv/bin/python}"
export REPAIR_BACKEND="${REPAIR_BACKEND:-auto}"

if [[ -n "${RAED_WEIGHTS_PATH:-}" && ! -f "${RAED_WEIGHTS_PATH}" ]]; then
  echo "RAED_WEIGHTS_PATH does not exist: ${RAED_WEIGHTS_PATH}" >&2
  echo "The roster will report weights_missing and /predict will 503." >&2
fi

echo "roster=${ENABLED_MODELS:-mock}  weights=${RAED_WEIGHTS_PATH:-<unset>}  repair=${REPAIR_BACKEND}"
exec ./.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 "$@"
