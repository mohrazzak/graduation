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
# caller's roster is captured BEFORE sourcing and reapplied after.
caller_models="${ENABLED_MODELS:-}"

if [[ -f "$repo_root/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$repo_root/.env"
  set +a
fi

# Both trained runs are offered on the host demo; roster order makes the
# yolov8s detector the default selection and the segment run an opt-in compare.
export ENABLED_MODELS="${caller_models:-raed,raed-seg}"

# The CUDA-enabled training venv doubles as the isolated repair worker; the API
# venv is deliberately CPU-only (see CLAUDE.md on the segfault-safe torch pin).
export LOCAL_REPAIR_PYTHON="${LOCAL_REPAIR_PYTHON:-/home/mohrazzak/projects/graduation/.venv/bin/python}"
export REPAIR_BACKEND="${REPAIR_BACKEND:-auto}"

for weights_var in RAED_WEIGHTS_PATH RAED_SEG_WEIGHTS_PATH; do
  weights_path="${!weights_var:-}"
  if [[ -n "$weights_path" && ! -f "$weights_path" ]]; then
    echo "$weights_var does not exist: $weights_path" >&2
    echo "That model will report weights_missing and its /predict will 503." >&2
  fi
done

echo "roster=${ENABLED_MODELS:-mock}  repair=${REPAIR_BACKEND}"
echo "  raed     = ${RAED_WEIGHTS_PATH:-<unset>}"
echo "  raed-seg = ${RAED_SEG_WEIGHTS_PATH:-<unset>}"
exec ./.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 "$@"
