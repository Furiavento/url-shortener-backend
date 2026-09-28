# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
WORKDIR /app
# Uses the pnpm version pinned in package.json#packageManager.
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
RUN pnpm install --prod --frozen-lockfile && pnpm store prune
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1
# Apply pending migrations, then replace the shell with the API so it receives SIGTERM.
CMD ["sh", "-c", "node dist/scripts/migrate.js && exec node dist/main"]
