# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS build
WORKDIR /app

# Optional Debian mirror, e.g. --build-arg APT_MIRROR=mirrors.ustc.edu.cn.
# The default (empty) keeps the image's own deb.debian.org.
ARG APT_MIRROR=
RUN if [ -n "$APT_MIRROR" ]; then \
    sed -i "s|deb.debian.org|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources; \
  fi

# better-sqlite3 ships a native addon; install a toolchain so npm ci can build it
# even when a prebuilt binary is unavailable for the current Node ABI.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY . .

# Official Node images ship the matching headers in /usr/local/include/node.
# Building from source avoids prebuild-install reaching out to GitHub during image builds.
RUN npm_config_build_from_source=true npm_config_nodedir=/usr/local npm ci
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/app/data/open-simple-mail.db
ENV ATTACHMENT_DIR=/app/data/attachments

ARG APT_MIRROR=
RUN if [ -n "$APT_MIRROR" ]; then \
    sed -i "s|deb.debian.org|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources; \
  fi

# gosu lets the entrypoint drop from root to `node` without a shell in between,
# so signals and the exit code still reach the server process.
RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /app/data \
  && chown -R node:node /app

# No USER directive on purpose: the entrypoint starts as root, fixes the
# ownership of /app/data (which is usually a bind mount) and re-executes the
# server as `node`.
VOLUME ["/app/data"]
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "apps/server/dist/main.js"]
