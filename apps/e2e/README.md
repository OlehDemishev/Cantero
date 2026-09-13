# E2E smoke tests

One critical-path test — login → create project → estimate → approve → invoice → send → get paid
— run against a real, running `api` + `web` (see the root README/`.claude/launch.json` for how to
start both locally). This is the one thing this repo had zero automated coverage of before: the
frontend has no test suite at all, and the API's 2000+ tests never exercise it through the actual
UI end to end.

## Running locally

1. Start both servers (`pnpm dev:api` and `pnpm dev:web` in separate terminals, or via the
   `.claude/launch.json` preview configs).
2. From this directory:
   ```
   pnpm install
   pnpm exec playwright install --with-deps chromium   # first time only
   pnpm e2e
   ```

Runs against `demo-eu@cantero.dev` (seeded by `apps/api/prisma/seed.ts`) by default. Override with
`E2E_WEB_URL` / `E2E_API_URL` / `DATABASE_URL` env vars to point at a different environment.

## What it does to the database

`global-setup.ts` pins the demo company's locale to English before the run (its selectors are
English button text, and the locale is a user-editable setting that earlier manual testing can
leave on anything). `global-teardown.ts` deletes every project this run created — matched by the
`"E2E Smoke "` name prefix the test generates — which cascades to the estimates/invoices/lines it
made along the way. Both connect to `DATABASE_URL` directly; neither touches seeded demo data or
anything not created by this suite.
