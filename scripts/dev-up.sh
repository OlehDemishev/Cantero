#!/usr/bin/env bash
# Start the local dev stack: Postgres/Redis (docker compose), pending migrations, API and web.
# Non-interactive and idempotent: anything already running is left alone and only reported.
# Logs: .dev/logs/{api,web}.log, PIDs: .dev/{api,web}.pid. Stop with scripts/dev-down.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEV_DIR="$ROOT/.dev"
LOG_DIR="$DEV_DIR/logs"
PNPM_VERSION="9.15.0"
API_PORT=4000
WEB_PORT=3000
API_URL="http://localhost:$API_PORT/api"
WEB_URL="http://localhost:$WEB_PORT"

die() { echo "dev-up: $*" >&2; exit 1; }
log() { echo "==> $*"; }

# --- prerequisites --------------------------------------------------------

command -v docker >/dev/null 2>&1 || die "docker not found. Install Docker Desktop."
docker info >/dev/null 2>&1 || die "Docker is not running. Start Docker Desktop and retry."

command -v pnpm >/dev/null 2>&1 || die "pnpm not found. Run: corepack enable && corepack prepare pnpm@$PNPM_VERSION --activate"
[ "$(pnpm -v)" = "$PNPM_VERSION" ] ||
  die "pnpm $(pnpm -v) found, $PNPM_VERSION required (newer pnpm ignores pnpm.overrides). Run: corepack prepare pnpm@$PNPM_VERSION --activate"

[ -d node_modules ] || die "node_modules missing. Run: pnpm install"
[ -f apps/api/.env ] || die "apps/api/.env missing. Run: cp apps/api/.env.example apps/api/.env"
[ -f apps/web/.env.local ] || die "apps/web/.env.local missing. Run: cp apps/web/.env.example apps/web/.env.local"

mkdir -p "$LOG_DIR"

# PID of a running service started by this script, or empty.
running_pid() {
  local f="$DEV_DIR/$1.pid" pid
  [ -f "$f" ] || return 0
  pid="$(cat "$f")"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then echo "$pid"; else rm -f "$f"; fi
}

port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

http_up() { curl -s -o /dev/null --max-time 5 "$1"; }

# --- infrastructure -------------------------------------------------------

log "docker compose up -d (postgres, redis)"
docker compose up -d postgres redis

log "Waiting for Postgres"
for _ in $(seq 1 60); do
  docker compose exec -T postgres pg_isready -q -U baugeld -d baugeld && break
  sleep 1
done
docker compose exec -T postgres pg_isready -q -U baugeld -d baugeld || die "Postgres not ready after 60s (docker compose logs postgres)"

# --- API and web ----------------------------------------------------------

api_pid="$(running_pid api)"
web_pid="$(running_pid web)"

if [ -z "$api_pid" ] && port_busy "$API_PORT"; then die "port $API_PORT is in use by another process (lsof -i :$API_PORT)"; fi
if [ -z "$web_pid" ] && port_busy "$WEB_PORT"; then die "port $WEB_PORT is in use by another process (lsof -i :$WEB_PORT)"; fi

if [ -z "$api_pid" ]; then
  log "prisma migrate deploy"
  pnpm --filter api exec prisma migrate deploy >"$LOG_DIR/migrate.log" 2>&1 ||
    { tail -20 "$LOG_DIR/migrate.log" >&2; die "migrations failed (full log: .dev/logs/migrate.log)"; }
  pnpm --filter api exec prisma generate >>"$LOG_DIR/migrate.log" 2>&1 ||
    { tail -20 "$LOG_DIR/migrate.log" >&2; die "prisma generate failed"; }
fi

if [ -z "$api_pid" ] || [ -z "$web_pid" ]; then
  # Both apps import @cantero/shared from its dist/; build it once here rather than twice in parallel.
  log "Building @cantero/shared"
  pnpm build:shared >"$LOG_DIR/shared.log" 2>&1 ||
    { tail -20 "$LOG_DIR/shared.log" >&2; die "shared build failed"; }
fi

# Each service runs in its own process group (set -m), so dev-down can stop pnpm and its children together.
start_service() {
  local name="$1"; shift
  log "Starting $name (log: .dev/logs/$name.log)"
  set -m
  nohup "$@" >"$LOG_DIR/$name.log" 2>&1 </dev/null &
  echo $! >"$DEV_DIR/$name.pid"
  set +m
}

if [ -n "$api_pid" ]; then log "API already running (pid $api_pid)"; else start_service api pnpm --filter api start:dev; fi
if [ -n "$web_pid" ]; then log "Web already running (pid $web_pid)"; else start_service web pnpm --filter web dev; fi

wait_http() {
  local name="$1" url="$2" timeout="$3" pid
  for _ in $(seq 1 "$timeout"); do
    http_up "$url" && return 0
    pid="$(running_pid "$name")"
    [ -n "$pid" ] || { tail -30 "$LOG_DIR/$name.log" >&2; die "$name exited during startup (log: .dev/logs/$name.log)"; }
    sleep 1
  done
  tail -30 "$LOG_DIR/$name.log" >&2
  die "$name did not answer at $url within ${timeout}s (log: .dev/logs/$name.log)"
}

log "Waiting for API and web"
wait_http api "$API_URL/health" 180
wait_http web "$WEB_URL" 180

cat <<EOF

Cantero dev stack is up
  Web:  $WEB_URL          (pid $(cat "$DEV_DIR/web.pid"))
  API:  $API_URL      (pid $(cat "$DEV_DIR/api.pid"))
  Logs: .dev/logs/api.log, .dev/logs/web.log

Demo logins (same password for all; it is printed by: pnpm --filter api prisma:seed):
  EU (metric/EUR/de):                  demo-eu@cantero.dev
  US (imperial/USD/en):                demo-us@cantero.dev
  UA (metric/EUR/uk, full showcase):   demo-ua@cantero.dev

Stop: scripts/dev-down.sh
EOF
