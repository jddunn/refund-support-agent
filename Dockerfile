# syntax=docker/dockerfile:1

# 1. Install dependencies. Build tools are a fallback in case the native
#    better-sqlite3 module has no prebuilt binary for this platform.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# 2. Build the standalone Next.js server.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3. Minimal runtime image.
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /app/data \
  && chown nextjs:nodejs /app/data

# The standalone server plus the static assets it serves.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Fixtures and schema the server reads at runtime (belt-and-suspenders with the
# output-file tracing in next.config.ts).
COPY --from=build /app/seed ./seed
COPY --from=build /app/src/db/schema.sql ./src/db/schema.sql
COPY --from=build /app/tests/adversarial/cases.json ./tests/adversarial/cases.json

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
