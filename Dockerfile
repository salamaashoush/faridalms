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
