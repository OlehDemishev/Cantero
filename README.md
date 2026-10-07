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
pnpm --filter api prisma:seed   # builds packages/shared first, so it works on a fresh checkout
```

Then, in separate terminals:

```bash
pnpm dev:api   # http://localhost:4000/api
pnpm dev:web   # http://localhost:3000
```

The seed script prints its own demo logins on completion — three companies (EU/metric/EUR, US/imperial/USD,
UA/metric/EUR with the fullest demo data set), same password for all. Re-run `pnpm --filter api prisma:seed`
any time; it skips companies that already exist.

### Running the production stack locally

`docker-compose.local.yml` runs the production stack on this machine exactly as it runs on a
server — same images, production settings — with local stand-ins for what needs a real server:
Caddy's own certificates on `*.localhost`, SeaweedFS for S3, Mailpit for SMTP. CI's "Docker" job runs
this same stack end to end on every push, so it is also the rehearsal for a deploy.

```bash
scripts/local-prod-env.sh   # writes .env and .env.prod with fresh secrets (never overwrites them)
docker compose -f docker-compose.prod.yml -f docker-compose.local.yml up -d --build
```

Web on `https://app.localhost:8443`, API on `https://api.localhost:8443/api` (the browser will ask
you to accept Caddy's local certificate), emails at `http://127.0.0.1:48025`. Building both images
needs about 8 GB of free disk. `down -v` with the same two `-f` flags removes it all again.

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
comment for the full picture. The API image runs as two services: `api` serves HTTP and only puts
jobs on the queues, `worker` runs them (drawing OCR, the search index, reminders, webhook delivery),
so background work never slows requests down. In short:

1. Point DNS A records at the VPS for both hostnames you'll use, then edit `Caddyfile` to match.
2. `cp .env.example .env` and fill in `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` /
   `NEXT_PUBLIC_API_URL` — Compose reads this one for YAML substitution (Postgres container env,
   the web image's build arg), not container runtime env. Never put real secrets in it.
3. `cp apps/api/.env.example .env.prod` and fill in the rest — this is what
   `docker-compose.prod.yml` injects into the `api` container as runtime secrets.
4. `docker compose -f docker-compose.prod.yml build && docker compose -f docker-compose.prod.yml up -d`

In production the API refuses to start while a setting is missing or unsafe, and lists every
problem at once — among them `DATA_ENCRYPTION_KEY` (encrypts stored integration tokens and 2FA
secrets), `S3_BUCKET` (uploads), an explicit `TRUST_PROXY_HOPS` (`docker-compose.prod.yml` sets it
to 1 for Caddy), https origins, SMTP, four distinct JWT secrets and the VAPID key pair for push
(see `apps/api/src/common/config/production-config.ts`). Clients' online invoice payments go to each
company's own Stripe account via Stripe Connect — enable Connect in the Stripe dashboard and add the
second webhook endpoint described next to `STRIPE_CONNECT_WEBHOOK_SECRET` in `apps/api/.env.example`.

Database backups: `scripts/backup-db.sh` (daily `pg_dump` → gzip → age encryption to a public key →
S3-compatible bucket, 14-day rolling retention) — install it as a cron job per the script's own
header comment, which also covers restoring. `scripts/verify-backup.sh <private key>` proves the
newest backup restores: it decrypts it into a throwaway Postgres container and prints what came back
— run it regularly from a machine holding the key, never the server.

## CI

`.github/workflows/ci.yml` runs on every push/PR to `main`: API typecheck + Jest, web typecheck +
lint, the E2E smoke test against real Postgres/Redis service containers, and the production stack
rehearsal: both Docker images built and run with production settings (see "Running the production
stack locally"), checked for migrations, TLS and security headers, the E2E suite through Caddy,
email, uploads, and a backup that restores.
