# syntax=docker/dockerfile:1
FROM oven/bun:1.4.2 AS build
WORKDIR /app
ENV CI=true
COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile
RUN bun run build

FROM oven/bun:1.4.2-slim AS api
WORKDIR /app
ENV NODE_ENV=production API_PORT=3001
COPY --from=build --chown=bun:bun /app/LICENSE ./LICENSE
COPY --from=build --chown=bun:bun /app/apps/api/dist ./dist
COPY --from=build --chown=bun:bun /app/apps/api/vendor/python ./vendor/python
COPY --from=build --chown=bun:bun /app/apps/api/vendor/scratch ./vendor/scratch
COPY --from=build --chown=bun:bun /app/apps/api/vendor/p5 ./vendor/p5
COPY --from=build --chown=bun:bun /app/apps/api/vendor/makecode ./vendor/makecode
COPY --from=build --chown=bun:bun /app/apps/api/studio ./studio
USER bun
EXPOSE 3001 3003
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 CMD bun -e "fetch('http://127.0.0.1:3001/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "dist/index.js"]

FROM oven/bun:1.4.2-slim AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
COPY --from=build --chown=bun:bun /app/LICENSE ./LICENSE
COPY --from=build --chown=bun:bun /app/apps/web/.output ./.output
USER bun
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 CMD bun -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", ".output/server/index.mjs"]

FROM rust:1.98-slim-trixie AS media-build
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
