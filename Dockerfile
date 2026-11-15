# The K: web portal (Next.js) + API (NestJS) in ONE container, for a single Render web service.
# Render settings: Language = Docker, Root Directory = (empty), Dockerfile Path = ./Dockerfile.
# Inside the container:
#   router  :$PORT  public port. /graphql (HTTP + WebSocket), /health, /statement.pdf, /integrations/* → API, the rest → web
#   API     :4000   127.0.0.1 only
#   web     :3000   127.0.0.1 only
# The separate apps/api/Dockerfile (API only) still works as before.

# ---- API build (full Debian image: python3/make/g++ for native modules such as argon2)
FROM node:22.11-bookworm AS api
WORKDIR /app/apps/api
COPY apps/api/package*.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY apps/api/ ./
RUN npm run build

# ---- Web build
FROM node:22.11-bookworm AS web
WORKDIR /app/apps/web
COPY apps/web/package*.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY apps/web/ ./
# The public URL of this service (e.g. https://tradewithkuber.onrender.com). Render passes service env vars as
# build args. Leave it empty to use the page's own origin.
ARG NEXT_PUBLIC_API_URL=
# Render supplies these as build arguments. Next.js needs them during `next build`,
# not only when the final container starts. These are public Firebase app settings;
# never add the private FIREBASE_SERVICE_ACCOUNT_JSON credential here.
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_VAPID_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_FIREBASE_VAPID_KEY=$NEXT_PUBLIC_FIREBASE_VAPID_KEY \
    NEXT_TELEMETRY_DISABLED=1
RUN node scripts/check-firebase-build.cjs \
    && npm run build \
    && node scripts/check-firebase-build.cjs --verify-bundle \
    && npm prune --omit=dev --no-audit --no-fund

# ---- Runtime
FROM node:22.11-bookworm-slim
ENV NEXT_TELEMETRY_DISABLED=1
RUN useradd --system --uid 10001 app
WORKDIR /app
# API keeps dev dependencies on purpose: its start script runs the TypeScript migration/seed scripts with ts-node.
COPY --from=api --chown=app /app/apps/api /app/apps/api
COPY --from=web --chown=app /app/apps/web /app/apps/web
COPY --chown=app deploy/single /app/deploy/single
USER app
EXPOSE 10000
CMD ["bash", "/app/deploy/single/start.sh"]
