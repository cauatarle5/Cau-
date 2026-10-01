# Web do Atlas (ADR-058). Contexto de build: raiz do monorepo.
#   docker build -f apps/web/Dockerfile -t atlas-web .
FROM node:22-alpine AS build
WORKDIR /repo
COPY . .
# O rewrite /api/v1 é gravado no build; em produção o Caddy já manda /api direto para a API.
ARG API_URL=http://api:3001
ENV API_URL=$API_URL NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
# CA extra opcional (proxy com TLS interceptado): `--secret id=ca_bundle,src=<arquivo>`.
RUN --mount=type=secret,id=ca_bundle,required=false \
    if [ -f /run/secrets/ca_bundle ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_bundle; fi \
 && corepack enable && pnpm install --frozen-lockfile --filter @atlas/web... \
 && pnpm --filter @atlas/web build

FROM node:22-alpine
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/offline >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
