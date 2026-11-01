# syntax=docker/dockerfile:1
FROM oven/bun:1.4.4 AS build
WORKDIR /app
ENV CI=true
COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile
RUN bun run build
RUN bun build scripts/migrate.ts --target=bun --outdir=dist-migrate

FROM oven/bun:1.4.4-slim AS api
WORKDIR /app
ENV NODE_ENV=production API_PORT=3001
COPY --from=build --chown=bun:bun /app/LICENSE ./LICENSE
COPY --from=build --chown=bun:bun /app/apps/api/dist ./dist
COPY --from=build --chown=bun:bun /app/apps/api/vendor/python ./vendor/python
COPY --from=build --chown=bun:bun /app/apps/api/vendor/scratch ./vendor/scratch
COPY --from=build --chown=bun:bun /app/apps/api/vendor/p5 ./vendor/p5
COPY --from=build --chown=bun:bun /app/apps/api/vendor/makecode ./vendor/makecode
# A named volume mounted here takes this owner on first use.
RUN mkdir -p /data/files && chown bun:bun /data/files
USER bun
EXPOSE 3001 3003
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 CMD bun -e "fetch('http://127.0.0.1:3001/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "dist/index.js"]

FROM oven/bun:1.4.4-slim AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
COPY --from=build --chown=bun:bun /app/LICENSE ./LICENSE
COPY --from=build --chown=bun:bun /app/apps/web/.output ./.output
USER bun
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 CMD bun -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", ".output/server/index.mjs"]

# One-shot: provisions roles, creates missing databases and applies pending
# migrations. It carries no seed and nothing that drops data.
FROM oven/bun:1.4.4-slim AS migrate
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=bun:bun /app/LICENSE ./LICENSE
COPY --from=build --chown=bun:bun /app/dist-migrate/migrate.js ./migrate.js
COPY --from=build --chown=bun:bun /app/packages/database/migrations ./packages/database/migrations
USER bun
CMD ["bun", "migrate.js", "migrate"]

FROM oven/bun:1.4.4-slim AS collab
WORKDIR /app
ENV NODE_ENV=production COLLAB_PORT=3002
COPY --from=build --chown=bun:bun /app/LICENSE ./LICENSE
COPY --from=build --chown=bun:bun /app/apps/collab/dist ./dist
USER bun
EXPOSE 3002
CMD ["bun", "dist/index.js"]

FROM oven/bun:1.4.4-slim AS ops
WORKDIR /app
ENV NODE_ENV=production PORT=3004 HOST=0.0.0.0
COPY --from=build --chown=bun:bun /app/LICENSE ./LICENSE
COPY --from=build --chown=bun:bun /app/apps/ops/.output ./.output
USER bun
EXPOSE 3004
CMD ["bun", ".output/server/index.mjs"]

FROM rust:1.99-slim-trixie AS media-build
WORKDIR /app/apps/media
# aws-lc, which the store's and the API's TLS stand on, builds with cmake.
RUN apt-get update && apt-get install -y --no-install-recommends cmake && rm -rf /var/lib/apt/lists/*
COPY apps/media/Cargo.toml apps/media/Cargo.lock ./
COPY apps/media/src ./src
RUN --mount=type=cache,target=/usr/local/cargo/registry --mount=type=cache,target=/app/apps/media/target cargo build --release --locked && cp target/release/farida-media /farida-media

FROM debian:trixie-slim AS media
WORKDIR /app
ENV MEDIA_HOST=0.0.0.0 MEDIA_PORT=3104
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/* && useradd --system --uid 1000 --create-home media
COPY --chown=media:media LICENSE ./LICENSE
COPY --from=media-build /farida-media /usr/local/bin/farida-media
USER media
EXPOSE 3104
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/3104 && printf "GET /health HTTP/1.0\r\n\r\n" >&3 && grep -q ok <&3'
CMD ["farida-media"]

# The edge: Caddy with the Cloudflare DNS module, which the platform's
# wildcard certificates are issued through (DNS-01). The routing travels with
# the image, so a rollback to an older tag rolls the routing back with it.
FROM caddy:2.11.7-builder AS edge-build
RUN xcaddy build v2.11.7 --with github.com/caddy-dns/cloudflare@v0.2.4 --output /caddy

FROM caddy:2.11.7 AS edge
COPY --from=edge-build /caddy /usr/bin/caddy
COPY deploy/single-server/Caddyfile /etc/caddy/Caddyfile
RUN PORTAL_DOMAIN=example.com SITES_DOMAIN=example.net CLOUDFLARE_API_TOKEN=0000000000000000000000000000000000000000 caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:2019/config/ || exit 1

# Nightly dumps of the cell and the directory and a copy of the file buckets,
# to a bucket at another provider. pg_dump must be at least the server's
# major version, so this image follows the database's.
FROM rclone/rclone:1.75.2 AS rclone

FROM postgres:18.6-trixie AS backup
COPY --from=rclone /usr/local/bin/rclone /usr/local/bin/rclone
COPY --chmod=0755 deploy/single-server/backup.sh /usr/local/bin/farida-backup
USER postgres
WORKDIR /tmp
ENTRYPOINT ["farida-backup"]
CMD ["schedule"]
