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
