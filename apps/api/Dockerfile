# API do Atlas (ADR-058). Contexto de build: raiz do monorepo.
#   docker build -f apps/api/Dockerfile -t atlas-api .
FROM node:22-alpine AS build
WORKDIR /repo
COPY . .
# CA extra opcional (proxy com TLS interceptado): `--secret id=ca_bundle,src=<arquivo>`.
RUN --mount=type=secret,id=ca_bundle,required=false \
    if [ -f /run/secrets/ca_bundle ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_bundle; fi \
 && corepack enable && pnpm install --frozen-lockfile --filter @atlas/api... \
 && pnpm --filter @atlas/api build \
 && pnpm --filter @atlas/api deploy --legacy --prod /out

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/packages/db/drizzle ./drizzle
COPY --from=build /repo/apps/api/package.json ./package.json
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3001/api/v1/health >/dev/null || exit 1
CMD ["node", "dist/server.js"]
