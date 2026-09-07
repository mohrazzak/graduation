#!/usr/bin/env bash
# One command that brings the whole DamageScale demo up: the local Supabase
# stack, the FastAPI backend on the real Trained Model, and the Next.js app.
#
# Why the web app is BUILT AND SERVED ON THE HOST instead of `docker compose up
# web`: inside that container `127.0.0.1:54321` resolves to the container
# itself, so every server-side Supabase call is refused and a logged-in user
# opening /analyze or /history is bounced to /login. The container is stopped
# here because it can only hold port 3000, never serve the demo.
#
# Usage:
#   scripts/dev-all.sh [start] [--dev] [--no-build] [--port N] [--mock]
#   scripts/dev-all.sh stop | restart | status | logs [web|api]
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
run_dir="$repo_root/.run"
web_port=3000
api_port=8000
supabase_port=54321
studio_port=54323
build=1
mode=prod
roster=""

cmd=start
log_target=web
if [[ $# -gt 0 && "$1" != -* ]]; then cmd="$1"; shift; fi
if [[ "$cmd" == logs && $# -gt 0 && "$1" != -* ]]; then log_target="$1"; shift; fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev)      mode=dev; build=0 ;;
    --no-build) build=0 ;;
    --mock)     roster=mock ;;
    --port)     web_port="$2"; shift ;;
    --port=*)   web_port="${1#*=}" ;;
    -h|--help)  awk 'NR>1 && /^#/ {sub(/^# ?/,""); print; next} NR>1 {exit}' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)          echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

mkdir -p "$run_dir"

# --- small helpers -----------------------------------------------------------

port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# Empty when the port is free OR held by another user (root, e.g. a container).
port_pid() { ss -ltnp "sport = :$1" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1 || true; }

http_code() { curl -s -o /dev/null -m 5 -w '%{http_code}' "$1" 2>/dev/null || echo 000; }

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33m !\033[0m %s\n' "$*" >&2; }

wait_for() { # wait_for <label> <seconds> <command...>
  local label="$1" deadline=$(( SECONDS + $2 )); shift 2
  until "$@" >/dev/null 2>&1; do
    if (( SECONDS >= deadline )); then warn "$label did not come up in time"; return 1; fi
    sleep 1
  done
  say "$label is up"
}

api_ready() { curl -sf -m 5 "http://127.0.0.1:$api_port/health" | grep -q '"status":"ok"'; }
web_ready() { [[ "$(http_code "http://127.0.0.1:$web_port/")" =~ ^(200|307|308)$ ]]; }

pid_alive() { [[ -n "${1:-}" ]] && kill -0 "$1" 2>/dev/null; }
read_pid() { [[ -f "$run_dir/$1.pid" ]] && cat "$run_dir/$1.pid" || true; }

# Every service is launched with setsid, so the whole process group dies
# together — `next start` spawns workers that a bare `kill $pid` would orphan.
stop_service() {
  local name="$1" port="$2" pid; pid="$(read_pid "$name")"
  # A server started outside this script (an earlier session, a bare uvicorn)
  # has no pidfile, and `restart` would otherwise silently leave it running.
  if ! pid_alive "$pid"; then pid="$(port_pid "$port")"; fi
  if pid_alive "$pid"; then
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    for _ in {1..10}; do pid_alive "$pid" || break; sleep 1; done
    pid_alive "$pid" && kill -KILL -- "-$pid" 2>/dev/null || true
    say "stopped $name (pid $pid)"
  elif port_open "$port"; then
    warn "$name is still listening on :$port under a process this script cannot stop (a container?)"
  fi
  rm -f "$run_dir/$name.pid"
}

# --- services ----------------------------------------------------------------

start_supabase() {
  if port_open "$supabase_port"; then say "supabase already up on :$supabase_port"; return; fi
  say "starting the local supabase stack (this can take a minute)"
  if ! (cd "$repo_root" && npx --yes supabase start >>"$run_dir/supabase.log" 2>&1); then
    warn "supabase start failed — see $run_dir/supabase.log; auth and history will not work"
    return
  fi
  wait_for "supabase" 120 port_open "$supabase_port" || true
}

start_api() {
  if api_ready; then
    say "api already up on :$api_port ($(curl -s "http://127.0.0.1:$api_port/health"))"
    if [[ "$web_port" != "3000" ]]; then
      warn "the running api was started elsewhere; if /predict is blocked by CORS on :$web_port, run '$0 restart --port $web_port'"
    fi
    return
  fi
  if port_open "$api_port"; then warn "port $api_port is busy but /health does not answer"; return; fi

  # dev-api.sh re-exports a caller-supplied roster and CORS list after sourcing
  # the shared .env, which is why setting them here survives.
  local env=()
  if [[ -n "$roster" ]]; then env+=("ENABLED_MODELS=$roster"); fi
  if [[ "$web_port" != "3000" ]]; then
    env+=("CORS_ORIGINS=http://localhost:$web_port,http://127.0.0.1:$web_port,http://localhost:3000")
  fi
  say "starting the api on :$api_port"
  setsid nohup env "${env[@]}" "$repo_root/scripts/dev-api.sh" >"$run_dir/api.log" 2>&1 </dev/null &
  echo $! >"$run_dir/api.pid"
  wait_for "api" 180 api_ready || warn "see $run_dir/api.log"
}

free_web_port() {
  port_open "$web_port" || return 0
  # The compose web container is the usual squatter on 3000.
  if (cd "$repo_root" && docker compose ps --services --filter status=running 2>/dev/null | grep -qx web); then
    say "stopping the compose web container (it cannot reach the local supabase stack)"
    (cd "$repo_root" && docker compose stop web >/dev/null 2>&1) || true
  fi
  local pid; pid="$(port_pid "$web_port")"
  if pid_alive "$pid"; then
    say "replacing the server already on :$web_port (pid $pid)"
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    for _ in {1..10}; do port_open "$web_port" || break; sleep 1; done
  fi
  if port_open "$web_port"; then
    warn "port $web_port is still held by a process this script cannot stop"
  fi
  return 0
}

start_web() {
  free_web_port
  if (( build )); then
    say "building the web app"
    (cd "$repo_root/web" && npm run build)
  fi
  # next.config sets output:"standalone" for the Docker image, so `next start`
  # prints a warning telling you to run .next/standalone/server.js. Ignore it:
  # the standalone bundle does not serve .next/static or public/ unless the
  # Dockerfile copies them in, and `next start` serves the demo correctly.
  say "starting the web app on :$web_port ($mode)"
  if [[ "$mode" == dev ]]; then
    setsid nohup npm --prefix "$repo_root/web" run dev -- -p "$web_port" >"$run_dir/web.log" 2>&1 </dev/null &
  else
    setsid nohup npm --prefix "$repo_root/web" run start -- -p "$web_port" >"$run_dir/web.log" 2>&1 </dev/null &
  fi
  echo $! >"$run_dir/web.pid"
  wait_for "web" 120 web_ready || warn "see $run_dir/web.log"
}

status() {
  local api_pid web_pid; api_pid="$(read_pid api)"; web_pid="$(read_pid web)"
  printf '%-10s %-24s %s\n' service url state
  printf '%-10s %-24s %s\n' supabase "http://127.0.0.1:$supabase_port" \
    "$(port_open "$supabase_port" && echo up || echo down)"
  printf '%-10s %-24s %s\n' studio "http://127.0.0.1:$studio_port" \
    "$(port_open "$studio_port" && echo up || echo down)"
  printf '%-10s %-24s %s\n' api "http://localhost:$api_port" \
    "$(api_ready && echo "up $(curl -s "http://127.0.0.1:$api_port/health")" || echo down)$(pid_alive "$api_pid" && echo " (pid $api_pid)" || true)"
  printf '%-10s %-24s %s\n' web "http://localhost:$web_port" \
    "$(web_ready && echo up || echo down)$(pid_alive "$web_pid" && echo " (pid $web_pid)" || true)"
}

case "$cmd" in
  start)
    start_supabase
    start_api
    start_web
    echo
    status
    echo
    say "logs: $run_dir/{web,api}.log   stop: $0 stop"
    ;;
  stop)
    stop_service web "$web_port"
    stop_service api "$api_port"
    say "the supabase stack and its containers were left running (npx supabase stop to drop them)"
    ;;
  restart)
    stop_service web "$web_port"; stop_service api "$api_port"
    start_supabase; start_api; start_web; echo; status
    ;;
  status) status ;;
  logs)   tail -n 60 -f "$run_dir/$log_target.log" ;;
  *)      echo "usage: $0 [start|stop|restart|status|logs] [options]" >&2; exit 2 ;;
esac
