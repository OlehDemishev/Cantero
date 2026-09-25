# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the NestJS API inside the pnpm workspace. `packages/shared` must be built
# before the api itself (it's a compile-time dependency, not just a runtime one). The `deploy`
# stage exists because a plain `COPY --from=build /app/apps/api/node_modules` would carry pnpm's
# symlinked workspace tree into a stage where the symlink targets don't exist — `pnpm deploy`
# materializes the api package's prod dependency graph (including `@cantero/shared`) as real
# files instead, which is what a Docker `COPY --from=` needs.

FROM node:20-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ---- deps: resolve the whole workspace graph ----
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

# ---- build: compile shared, generate the prisma client, compile the nest app ----
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @cantero/shared build
RUN pnpm --filter api prisma:generate
RUN pnpm --filter api build

# ---- deploy: self-contained, non-symlinked prod subset of just the api package ----
FROM build AS deploy
RUN pnpm --filter=api --prod deploy --ignore-scripts /out/api
# prisma generate writes engine binaries + client code straight into node_modules, bypassing
# pnpm's store entirely — `deploy` has no way to carry that over into the fresh node_modules it
# just materialized, so regenerate once more in place against the schema `deploy` already copied.
RUN cd /out/api && node_modules/.bin/prisma generate

# ---- runtime: lean final image ----
FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app && useradd --system --gid app app
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deploy /out/api ./
# `pnpm deploy` already copies dist/ and prisma/ as part of the package directory (verified: it
# copies whatever's on disk, not filtered by .gitignore/"files") — these two lines are
# belt-and-suspenders in case that ever changes, not compensating for a real gap today.
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/prisma ./prisma
COPY apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
# uploads/ and .models/ exist in the image so a named volume mounted over either starts out owned
# by `app` (Docker copies the image directory's ownership into a fresh volume) rather than root.
RUN mkdir -p ./uploads ./.models && chmod +x ./docker-entrypoint.sh && chown -R app:app /app
USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/src/main"]
