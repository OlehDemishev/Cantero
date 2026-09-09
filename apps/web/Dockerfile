# syntax=docker/dockerfile:1.7
#
# Build context must be the repo root (not apps/web/), since this needs packages/shared too:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api .

FROM node:20-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ---- deps: resolve the whole workspace graph ----
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile

# ---- build: compile shared, build the next app ----
FROM deps AS build
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, not read at runtime —
# this has to be a build ARG, not an ordinary env var passed to the running container.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @cantero/shared build
RUN pnpm --filter web build

# ---- runtime: lean final image, standalone Next.js server ----
FROM node:20-bookworm-slim AS runtime
RUN groupadd --system app && useradd --system --gid app app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
# outputFileTracingRoot (see apps/web/next.config.ts) points at the monorepo root, so the
# standalone output preserves apps/web's relative path rather than flattening to the root.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
RUN chown -R app:app /app
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
