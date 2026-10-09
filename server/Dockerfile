# API server image for Fly.io.
#
# Build context must be the REPO ROOT (fly.toml sets this up), because the server
# reads ../prompts at runtime and imports types from ../shared.
#   fly deploy            (from the repo root)
#   docker build -f server/Dockerfile .   (to test locally)

FROM node:22-slim

WORKDIR /app/server

# Install dependencies first so Docker caches them between code changes.
COPY server/package.json server/package-lock.json ./
RUN npm ci

COPY shared /app/shared
COPY prompts /app/prompts
COPY server ./

# Fail the image build on type errors, then drop dev-only packages (tsx stays: it runs the app).
RUN npm run typecheck && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
