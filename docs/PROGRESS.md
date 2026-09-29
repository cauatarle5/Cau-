# PROGRESS: Atlas

## Fase atual
**Fase 0. Fundação: concluída.** Próximo: **Fase 1. Perfil, objetivos e corpo.**

## Feito
### Planejamento
- Docs da Parte 0.2 (SPEC, ARCHITECTURE, DATA_MODEL, DECISIONS, ROADMAP, PROGRESS, OPEN_QUESTIONS) e `CLAUDE.md`.
- Comandos `.claude/commands/` (`/fase`, `/revisar`, `/status`, `/delta`).

### Fase 0
- Monorepo pnpm + Turborepo, TS estrito (~6.0, ADR-011), ESLint estrito (typescript-eslint, import order, react-hooks, next), Prettier.
- `docker-compose.yml` com Postgres 16; `pnpm dev` = `db:up` → `db:migrate` → api (:3001) + web (:3000).
- `packages/core`: `roundTo`, `lbToKg` com testes.
- `packages/schemas`: contratos de auth, erros (códigos estáveis), health; mensagens do Zod em pt.
- `packages/db`: Drizzle (`users`, `sessions`), extensões `citext`, `pg_trgm`, `unaccent`; UUID v7 na aplicação.
- `apps/api`: Fastify 5 + Zod type provider; pino com `request_id` (header `x-request-id`); erros RFC 7807; helmet, CORS restrito, checagem de `Origin` em escrita; rate limit (login 5/min por IP e por e-mail, cadastro 5/min por IP); `/api/v1/health`; auth (`register`, `login`, `logout`, `me`) com argon2id, token de 32 bytes com hash SHA-256, cookie `httpOnly`/`SameSite=Lax`, renovação deslizante; OpenAPI em `/api/docs` (dev).
- `apps/web`: Next 16 + Tailwind 4 + primitivas shadcn; tema claro/escuro; barra inferior (mobile) e lateral (desktop); páginas Hoje, Treino, Nutrição, Progresso, Coach, Perfil com estados vazios; `/cadastro`, `/entrar`, logout; guarda de rota via `/auth/me`.
- Testes: unit (core, schemas), integração da API com Testcontainers (health, auth, rate limit, isolamento entre usuários), E2E Playwright (cadastro → logout → login; senha errada; validação).
- CI GitHub Actions: typecheck, lint, format, testes, build, E2E.

## Pendente (para fases seguintes)
- Botão flutuante de registro rápido (12.1): entra junto com os registros que ele aciona (Fases 1 a 5).
- Exportação/exclusão de conta (LGPD): Fase 8.
- PWA instalável: Fase 8.

## Bugs conhecidos
- Nenhum.

## Notas de ambiente
- Sem Docker: defina `TEST_DATABASE_URL` para os testes de integração (ADR-010).
- Chromium pré-instalado fora do padrão: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/caminho/chrome pnpm test:e2e`.
- `apps/web/AGENTS.md` e `apps/web/CLAUDE.md` são gerados pelo `next dev`: ler a documentação em `node_modules/next/dist/docs/` antes de usar APIs do Next.

## Próximo passo
- `/fase 1`: onboarding, perfil, objetivos, medidas, tendência de peso, TMB/GET/metas no core.
