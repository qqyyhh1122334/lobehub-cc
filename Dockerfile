# Build this image in the connected preparation environment. The application
# build itself has no network; runtime never installs packages or pulls models.
ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE} AS build
ARG LOBE_BUILD_HEAP_MB=4400
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm install --global pnpm@10.33.0
COPY . .
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    pnpm install --frozen-lockfile
ENV APP_URL=https://lobehub.internal:8443 \
    DATABASE_DRIVER=node \
    DATABASE_URL=postgresql://postgres:build@127.0.0.1:5432/lobehub \
    AUTH_SECRET=build-placeholder-not-a-runtime-secret \
    KEY_VAULTS_SECRET=bG9iZS1pbnRyYW5ldC1idWlsZC1wbGFjZWhvbGRlciE= \
    LOBE_BUILD_HEAP_MB=${LOBE_BUILD_HEAP_MB} \
    DOCKER=true
RUN --network=none node scripts/intranet/build.cjs all
# Preserve the installed lockfile's complete migration/S3 dependency graph,
# including each pnpm version/peer context; verify outside builder resolution.
RUN --network=none node deploy/intranet/prepare-runtime.cjs

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=127.0.0.1 \
    PORT=3210 \
    NODE_OPTIONS=--require=/app/scripts/intranet/network-guard.cjs
COPY --from=build --chown=node:node /app/.next/standalone /app
COPY --from=build --chown=node:node /app/.next/static /app/.next/static
COPY --from=build --chown=node:node /app/public /app/public
COPY --from=build --chown=node:node /app/packages/database/migrations /app/migrations
COPY --from=build --chown=node:node /app/scripts/migrateServerDB/docker.cjs /app/docker.cjs
COPY --from=build --chown=node:node /app/scripts/migrateServerDB/errorHint.js /app/errorHint.js
COPY --from=build --chown=node:node /app/scripts/intranet /app/scripts/intranet
COPY --from=build --chown=node:node /app/deploy/intranet/start.cjs /app/start.cjs
COPY --from=build --chown=node:node /app/deploy/intranet/validate-env.cjs /app/validate-env.cjs
COPY --from=build --chown=node:node /app/deploy/intranet/migration-check.cjs /app/migration-check.cjs
COPY --from=build --chown=node:node /app/deploy/intranet/probe-deadline.cjs /app/probe-deadline.cjs
COPY --from=build --chown=node:node /app/deploy/intranet/sse-check.cjs /app/sse-check.cjs
USER node
EXPOSE 3210
ENTRYPOINT ["node", "/app/start.cjs"]
