# DamageScale web (Next.js). Three stages so the runtime image carries only
# the standalone server — no source tree, no full node_modules.

# Stage 1 — deps: copy ONLY the manifests so the npm ci layer stays cached
# until package-lock.json actually changes.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2 — build. The three NEXT_PUBLIC_* values MUST be env vars during
# `next build`: Next.js inlines NEXT_PUBLIC_* into the client bundle AT BUILD
# TIME — runtime env cannot change them, so changing them means rebuilding
# this image. Defaults mirror the web/.env.local placeholders: the app builds
# and runs pre-Supabase, degrading to translated "not configured" errors.
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 3 — runner: non-root user serving the standalone output.
FROM node:22-alpine AS runner
WORKDIR /app
# HOSTNAME=0.0.0.0 so server.js binds the container interface, not loopback —
# otherwise the published port would connect to nothing.
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
# `output: "standalone"` emits server.js + a pruned node_modules but
# intentionally omits static assets and public/ — they must ride alongside.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
