# E2E tests

Run against a real, running `api` + `web` (see the root README/`.claude/launch.json` for how to
start both locally). The API's unit suite mocks its I/O; these specs exercise the flows where the
seams between browser, API, database and a third party are exactly where things break.

| Spec | What it proves |
| --- | --- |
| `critical-path` | login → project → estimate → approve → invoice → send → paid, all through the UI |
| `sepa-autopay` | a SEPA/ACH autopay debit that settles days later via a signed `payment_intent.succeeded` webhook marks the invoice paid exactly once; a redelivered event doesn't pay twice; a failed debit leaves it open; a forged signature is a 400 |
| `portal-signature` | a stranger with no account opens the emailed estimate link, is refused without a drawn signature, then signs and approves; the stored signature is a real PNG |
| `offline-sync` | a field write made offline is queued, flushed once connectivity returns, and not duplicated — including when the first attempt committed but its response was lost (same `Idempotency-Key` on retry) |
| `sso-saml` | SAML sign-in from the real login page through a throwaway IdP: JIT-provisions a worker; rejects a tampered assertion, a foreign signing key, an off-domain email, and a replayed assertion |
| `drawing-set` | a multi-page PDF set (`files/drawing-set.pdf`) is read into per-page sheet numbers/titles for review, a duplicate number blocks the import, the imported sheets' printed references open each other, and a sheet measured in takeoff at its printed 1:100 scale snaps clicks to its line ends (checked to the exact PDF coordinates); counting needs no scale |

Arranging state (a project, an approved estimate, a sent invoice) goes through the API directly
(`api.ts`) rather than the UI, so each spec only drives the part it covers.

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

- `sepa-autopay` signs webhooks with the API's own secret: `E2E_STRIPE_WEBHOOK_SECRET`, or
  `STRIPE_WEBHOOK_SECRET` read from `apps/api/.env`.
- `sso-saml` needs `openssl` on PATH — it generates a fresh IdP key pair per run, so no key is
  ever committed.

## What it does to the database

`global-setup.ts` pins the demo company's locale to English (the selectors are English text).
`global-teardown.ts` deletes every project named `"E2E Smoke …"`, which cascades to everything the
specs made under them. `sso-saml` points the demo company's SSO at its test IdP for the duration
and restores the previous configuration afterwards, then deletes the users it provisioned on the
test-only `e2e-sso.test` domain. Nothing else is touched.
