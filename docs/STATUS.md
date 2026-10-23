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

## 2026-10-23 — UI, design code and security audit (branch claude/kind-allen-sjrtoq)

Report: `docs/audit/2026-10-23-ui-audit.md` (Russian). Static review of apps/web (design system, a11y,
i18n, frontend security) and apps/api security, plus a live Playwright walk of all 82 routes as owner,
worker, logged out and portal users (en/de/pl, desktop and 390 px). No code changed.

Most urgent: `RolesGuard` ignores `@Public()`, so NPS/eNPS/service-feedback submissions always 403 (L1);
the API crashes on boot with the placeholder VAPID keys from `.env.example` (L2). Security highs: OAuth
`state` accepts any access JWT (S1), client signing tokens returned to staff (S2), any API key has SCIM
write (S3), project guard checks only the first projectId (S4).

Left: everything in the report. Section 8 lists the order, one session per item, starting with L1+L2.
## 2026-10-23 — dashboard widget permissions; optional numeric query params

Dashboard widgets now ask for the same capability as the endpoint they mirror:
`DASHBOARD_WIDGET_PERMISSIONS` + `canViewDashboardWidget` / `visibleDashboardWidgetTypes` in
`packages/shared/src/dashboard.ts` (a spec checks each entry against the endpoint's @Requires).
`DashboardService` takes the AuthUser: create is a 403 for a type the member lacks (custom_report
also needs a report of the member's company, 400/404 otherwise); list/reorder/exportPdf leave out
widgets the member can no longer see; project-scoped reports get the viewer like their endpoints.
`AppValidationPipe` (main.ts) keeps an absent numeric query param undefined — Nest 10 turned it
into NaN, so every optional `OptionalIntPipe` param (e.g. `GET /job-costing/history` without
`months`, default 12) answered 400.

The web's add-widget menu now uses `visibleDashboardWidgetTypes` (merge commit 41fed3f).

## 2026-10-23 — audit fixes, all 12 plan items (branch claude/kind-allen-sjrtoq, not merged)

Every item of section 8 in `docs/audit/2026-10-23-ui-audit.md` is done; section 9 there maps
findings to commits. Security S1–S11 + low items, L1/L2, logout/SSO code exchange, kiosk token,
report/company scoping, SSO domain DNS proof, SSRF; web: (app) route-group layout + MeProvider,
semantic tokens + system theme, Dialog/useConfirm, useApi + ErrorState/Skeleton, Badge/Alert/
Field/PageHeader + Zod on 6 forms, a11y (axe 0 serious/critical on 324 views, scanner 0
unlabeled), i18n (Accept-Language, company locale on public pages, formatCurrency everywhere),
lazy project/settings tabs, split oversized components. Migrations (hand-written, never run
against a real DB except the local one): session companyId, SSO login codes + portal token
version, scheduled report creator, SSO domain verification.

Not run: the e2e suite (CI runs only on PRs to main / pushes to main — open a PR to get it).
Behaviour changes to know: IdP-initiated SSO refused; scheduled reports without a recorded author
skip restricted projects until re-saved; stored-file URLs download instead of opening inline;
SSO domains need a TXT record (existing ones grandfathered); portal sign-out signs the holder out
on every device; portal tokens last 7 days.

Left (not in the plan): magic-byte checks on uploads; a device account for the kiosk; per-user
calendar feeds; portal magic-link verify fires twice in dev StrictMode (L5); focusable scroll
areas have no own name; canvas/Gantt dragging is mouse-only; existing buttons still use .btn-*
classes rather than <Button>; ~25 label patterns not moved to Field; "pcs" unit in starter data.
Local-only: apps/api/.env has EXPO_ACCESS_TOKEN="" which fails one push.service spec locally.

## 2026-10-23 — E2E fixes for PR #4 (drawing-set upload hang, SSO one-time-code test)

`TimeTrackingPanel` defaulted the not-yet-loaded workers to a new `[]` each render, so the effect
keeping the worker pick re-ran and re-set the form forever until /workers answered; a file chosen
in that window (Documents tab) made the loop synchronous and froze the page. Now a stable
`NO_WORKERS` plus a guard against re-setting the same pick. The sso-saml "one-time code" test now
reads the code from the ACS redirect (`route.fetch({ maxRedirects: 0 })`): Playwright never routes
redirect hops, so its route on /sso/callback never matched. Local e2e: both specs pass; full suite
29 passed, 1 skipped (gobd-anchor), semantic-search fails only locally (model download blocked).
