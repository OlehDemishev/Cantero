# Cantero

B2B construction management SaaS. Stack, setup and test commands: `README.md`. Read only the part you need.

- `apps/api`: NestJS + Prisma/PostgreSQL + BullMQ. Schema in `apps/api/prisma/schema.prisma`.
- `apps/web`: Next.js App Router, next-intl (en, de, es, pl, uk).
- `apps/desktop`, `apps/mobile`, `apps/e2e`; shared Zod schemas and types in `packages/shared`.

## Keep the context small

Plan limits are the bottleneck, and most of them go to re-reading a long context on every request.

- One task per session. When it is done, add a short dated entry to `docs/STATUS.md` (what changed, what is left; create the file if missing) and stop. The next task starts in a new session from that file.
- Read files in ranges (`offset`/`limit`) or `grep -n` first. Don't read whole large files, and never `schema.prisma` in full; grep for the model.
- Tests: run only the affected spec (`pnpm --filter api test -- <path>`) with `--silent`. The full suite only before a commit.
- Browser and simulator: prefer `get_page_text` / `read_page` over screenshots. If a screenshot is needed, use `scale: 0.5`. One check per change, not a screenshot after every click.
- Delegate wide searches to a subagent that returns only the conclusion.
- Don't paste long logs; tail or grep them.
