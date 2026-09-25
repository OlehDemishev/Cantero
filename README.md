# Cantero

Cantero is a B2B construction management SaaS: estimating, project and crew scheduling, materials
and equipment tracking, job costing, invoicing/billing, and compliance — for general contractors,
specialty trades, and remodelers — plus client, subcontractor, and supplier portals.

## Stack

- **API** (`apps/api`) — NestJS 10, Prisma 5 / PostgreSQL, Redis + BullMQ for background jobs, Zod
  for request validation.
- **Web** (`apps/web`) — Next.js 16 (App Router), React 19, next-intl (5 locales: en, de, es, pl,
  uk), Tailwind.
- **Shared** (`packages/shared`) — Zod schemas and types shared between API and web.
- **E2E** (`apps/e2e`) — Playwright, one critical-path smoke test run against real running
  servers.

A pnpm workspace monorepo (`pnpm-workspace.yaml`); Node >= 20.

## Local development

Prerequisites: Node 20+, pnpm, Docker (for Postgres/Redis).

```bash
pnpm install

# Postgres + Redis, exposed on their default ports
docker compose up -d

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# Defaults in apps/api/.env.example work out of the box against the docker compose services above.
# Anything left unset (Stripe, Twilio, SMTP, S3, Sentry, VAPID) degrades gracefully — see that
# file's own comments for what each does when left blank.

pnpm --filter api prisma:migrate
pnpm --filter api prisma:seed
```

Then, in separate terminals:

```bash
pnpm dev:api   # http://localhost:4000/api
pnpm dev:web   # http://localhost:3000
```

The seed script prints its own demo logins on completion — three companies (EU/metric/EUR, US/imperial/USD,
UA/metric/EUR with the fullest demo data set), same password for all. Re-run `pnpm --filter api prisma:seed`
any time; it skips companies that already exist.

### Running the full stack in Docker locally

To run api/web/postgres/redis/caddy exactly as they run in production, but with ports published
on localhost instead of real domains:

```bash
cp .env.example .env                    # Compose-substitution vars (POSTGRES_*, NEXT_PUBLIC_API_URL)
cp apps/api/.env.example .env.prod      # Runtime secrets for the api container
# Edit both for local values — NEXT_PUBLIC_API_URL should point at http://localhost:4001/api.
docker compose -f docker-compose.prod.yml -f docker-compose.local.yml up -d --build
```

Web on `http://localhost:3001`, API on `http://localhost:4001/api` — see
`docker-compose.local.yml`'s own comment.

## Tests

```bash
pnpm test              # every workspace package's unit tests (apps/api: 2000+ Jest tests)
pnpm --filter api test # API only
```

E2E (needs both servers actually running — see `apps/e2e/README.md` for the full setup):

```bash
cd apps/e2e
pnpm exec playwright install --with-deps chromium   # first time only
pnpm e2e
```

## Production deployment

Single VPS, Docker Compose, Caddy for automatic HTTPS — see `docker-compose.prod.yml`'s own header
comment for the full picture. In short:

1. Point DNS A records at the VPS for both hostnames you'll use, then edit `Caddyfile` to match.
2. `cp .env.example .env` and fill in `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` /
   `NEXT_PUBLIC_API_URL` — Compose reads this one for YAML substitution (Postgres container env,
   the web image's build arg), not container runtime env. Never put real secrets in it.
3. `cp apps/api/.env.example .env.prod` and fill in the rest — this is what
   `docker-compose.prod.yml` injects into the `api` container as runtime secrets.
4. `docker compose -f docker-compose.prod.yml build && docker compose -f docker-compose.prod.yml up -d`

In production the API refuses to start without `DATA_ENCRYPTION_KEY` (encrypts stored integration
tokens and 2FA secrets), `S3_BUCKET` (uploads) and an explicit `TRUST_PROXY_HOPS`
(`docker-compose.prod.yml` sets it to 1 for Caddy). Clients' online invoice payments go to each
company's own Stripe account via Stripe Connect — enable Connect in the Stripe dashboard and add the
second webhook endpoint described next to `STRIPE_CONNECT_WEBHOOK_SECRET` in `apps/api/.env.example`.

Database backups: `scripts/backup-db.sh` (daily `pg_dump` → gzip → age encryption to a public key →
S3-compatible bucket, 14-day rolling retention) — install it as a cron job per the script's own
header comment, which also covers restoring.

## CI

`.github/workflows/ci.yml` runs on every push/PR to `main`: API typecheck + Jest, web typecheck +
lint, and the E2E smoke test against real Postgres/Redis service containers.
