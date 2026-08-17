# syntax=docker/dockerfile:1

# ---- build ----------------------------------------------------------------
FROM node:20-bookworm-slim AS build
WORKDIR /app

RUN corepack enable

# Manifests first so dependency install caches independently of source edits.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter server build && pnpm --filter web build

# Re-resolve with dev dependencies stripped. Doing this in the build stage
# keeps pnpm (and its store) out of the runtime image entirely.
RUN pnpm --filter server --prod deploy /app/server-runtime

# ---- runtime --------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

# ffmpeg is not optional — every pipeline stage shells out to it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=8787
ENV WEB_DIST_DIR=/app/web/dist

COPY --from=build /app/server-runtime/node_modules ./server/node_modules
COPY --from=build /app/server-runtime/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist

# Runtime working directories. All contents are disposable — the job store is
# in memory, so anything on disk is already orphaned after a restart, and the
# hourly sweep clears the rest. No volume required.
RUN mkdir -p server/uploads server/frames server/outputs server/apply-work server/assets/fonts-cache \
  && chown -R node:node /app

USER node
EXPOSE 8787

# The platform's probe hits this unauthenticated; a 401 here would restart-loop.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
