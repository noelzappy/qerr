# Vesk: one image with the web app, the design engine and Chromium. A Node 22 npm-workspaces monorepo.
# apps/web/package.json has the scripts build, start and migrate; the server listens on PORT and answers GET /healthz.

# ---- Stage 1: install every workspace and build the web app ----
FROM node:22-bookworm-slim AS build
WORKDIR /build
# openssl must be present while Prisma installs, or it fetches its schema engine for the wrong OpenSSL (1.1) and the
# runtime image, which has OpenSSL 3, then tries to download another one at start-up and cannot write to node_modules.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
# The manifests first, so the install layer is cached until a dependency changes.
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY packages/ packages/
COPY apps/ apps/
RUN npm run build

# ---- Stage 2: runtime ----
FROM node:22-bookworm-slim AS runtime

# Chromium from Debian, with only what it needs to run headless. The templates embed Inter and IBM Plex Mono as
# data: URIs, so no font packages beyond a basic fallback are installed. openssl and ca-certificates are for
# Prisma and for outbound HTTPS (Buffer, the bucket, the AI and mail APIs).
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

# Chromium refuses to start its sandbox as a non-root user in a container without user namespaces. The wrapper
# adds --no-sandbox (see deploy/README.md for why that is acceptable here) and --disable-dev-shm-usage
# (Docker's default /dev/shm is 64 MB).
RUN printf '#!/bin/sh\nexec /usr/bin/chromium --no-sandbox --disable-dev-shm-usage "$@"\n' > /usr/local/bin/chromium-container \
 && chmod 755 /usr/local/bin/chromium-container
ENV CHROME_PATH=/usr/local/bin/chromium-container \
    NODE_ENV=production \
    PORT=3000

WORKDIR /srv/vesk

# The workspaces as they are in the repository: the root manifest, the packages (the engine and its design/ folder with
# the templates and fonts; the AI library), the brand packs (brands/, chosen with BRAND_DIR) and the web app. node_modules keeps its @vesk/* links, which are
# relative, and the generated Prisma client; `npm run migrate` needs the Prisma CLI that was installed for the build.
COPY --from=build /build/package.json ./package.json
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/packages ./packages
COPY --from=build /build/apps/web/package.json /build/apps/web/prisma.config.ts ./apps/web/
COPY --from=build /build/apps/web/prisma ./apps/web/prisma
COPY --from=build /build/apps/web/dist ./apps/web/dist
COPY brands/ ./brands/
COPY deploy/entrypoint.sh ./deploy/entrypoint.sh

# Writable places: the render lock and temporary renders (out/), the saved brand written out as a pack (state/brand/), and
# the local storage folder (a deployment with a bucket does not use it). Everything else stays read-only to the app user.
RUN chmod 755 deploy/entrypoint.sh \
 && mkdir -p out state apps/web/.data \
 && chown -R node:node out state apps/web/.data

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/srv/vesk/deploy/entrypoint.sh"]
