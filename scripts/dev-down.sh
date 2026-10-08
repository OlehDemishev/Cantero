#!/usr/bin/env bash
# Stop what scripts/dev-up.sh started: API and web (by PID file), then `docker compose stop`.
# Volumes are kept, so the database survives.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
DEV_DIR="$ROOT/.dev"

log() { echo "==> $*"; }

# dev-up starts each service as a process-group leader, so signalling -PID reaches pnpm and its children.
stop_service() {
  local name="$1" f="$DEV_DIR/$1.pid" pid
  if [ ! -f "$f" ]; then log "$name: not running (no PID file)"; return; fi
  pid="$(cat "$f")"
  if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
    log "$name: not running (stale PID file removed)"
    rm -f "$f"; return
  fi
  log "Stopping $name (pid $pid)"
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
  for _ in $(seq 1 15); do
    kill -0 "$pid" 2>/dev/null || pgrep -g "$pid" >/dev/null 2>&1 || break
    sleep 1
  done
  if kill -0 "$pid" 2>/dev/null || pgrep -g "$pid" >/dev/null 2>&1; then
    log "$name did not exit in 15s, sending SIGKILL"
    kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null
  fi
  rm -f "$f"
}

stop_service web
stop_service api

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  log "docker compose stop (data volumes kept)"
  docker compose stop
else
  echo "dev-down: Docker is not running; skipping docker compose stop" >&2
fi
