# Status

## 2026-10-07 — local setup on the new Mac

Done: Postgres/Redis from `docker-compose.yml`, migrations applied (no schema drift), seed run,
API on :4000 and web on :3000 answering. pnpm pinned to 9.15.0 via `packageManager` (pnpm 12 ignores
`pnpm.overrides` and fails the frozen install). `prisma:seed` now builds `@cantero/shared` first.
E2E (one worker): 26 passed; sepa-autopay passes after adding STRIPE_CONNECT_WEBHOOK_SECRET to the
local `.env`; 2 skipped — gobd-anchor (no GOBD_TSA_URL), semantic-search
(SEMANTIC_SEARCH_ENABLED=false, kept off on purpose: the model needs ~1.7 GB).

Left: `apps/api/.env` still
lacks the optional integration keys from `.env.example` (left as they are on purpose).

## 2026-10-08 — CI stability (PR #2, branch fix/ci-stability)

Job timeouts (Docker 40, E2E 20, API 15, Web 10 min); apt in the Docker job's Install tools
step retries (`Acquire::Retries=3`, `http::Timeout=30`) under a 5-minute step timeout; the
flaky permissions check in `apps/e2e/tests/restricted-lists.spec.ts` now uses `expect.poll`.

All four jobs passed on the PR. The Docker job took 22.5 min there (previous max 19), hence 40.

Left: merge PR #2 (the user merges it). Watch the Docker job's duration; the e2e fix has one
green CI run so far.

## 2026-10-08 — dev start/stop scripts (branch chore/dev-scripts)

`scripts/dev-up.sh`: checks Docker and pnpm 9.15.0, `docker compose up -d`, waits for Postgres,
`prisma migrate deploy` + `generate` (no seed), builds `@cantero/shared` once, starts API (:4000)
and web (:3000) in their own process groups with logs in `.dev/logs/` and PIDs in `.dev/`, waits
for `/api/health` and the web root, prints URLs and demo logins. Re-running only reports status;
a port held by a foreign process is an error. `scripts/dev-down.sh`: kills each process group
(TERM, KILL after 15 s), then `docker compose stop`. `.dev/` is gitignored; README mentions both.

Verified: up (~14 s warm), second up (no duplicates), down (no leftover processes or listeners),
up again (no pending migrations, data kept), down. Docker-unavailable path exits 1 with a message.

Left: merge the PR (the user merges it).
