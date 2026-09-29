# DECISIONS: Atlas

ADRs numeradas. Nunca editar uma ADR antiga: criar outra que a substitui (`Substitui: ADR-NNN`).
Formato: contexto, decisão, consequências. Status: `aceita` | `substituída por ADR-NNN`.

---

## ADR-001: Stack e arquitetura base
- **Status:** aceita
- **Contexto:** PROMPT_MESTRE Parte 3 já decide a stack.
- **Decisão:** TypeScript estrito; pnpm + Turborepo; Next.js (App Router) + Tailwind + shadcn/ui + TanStack Query + Zustand + RHF; Fastify + Zod + `fastify-type-provider-zod`; PostgreSQL 16 + Drizzle; pg-boss; auth própria (cookie + `sessions` + argon2id); Anthropic SDK; pino; Vitest + Testcontainers + Playwright; Docker Compose. Monólito modular com cálculos em `packages/core`.
- **Consequências:** detalhes em `ARCHITECTURE.md`. Deploy decidido por ADR na Fase 8.

## ADR-002: Fluxo híbrido chat + Claude Code
- **Status:** aceita
- **Contexto:** PROMPT_MESTRE 0.1.
- **Decisão:** Claude Code é o ambiente principal; o chat produz decisões e deltas de especificação, incorporados aos docs (via `/delta`) antes de qualquer código.
- **Consequências:** nenhum código de produção vem do chat.

## ADR-003: Cálculo determinístico, linguagem pela IA
- **Status:** aceita
- **Contexto:** PROMPT_MESTRE 1.3 e 10.1.
- **Decisão:** números exibidos (kcal, macros, volume, e1RM, metas) só vêm de `packages/core`. LLM extrai estrutura e redige.
- **Consequências:** o sistema funciona sem IA; avaliações checam ausência de números inventados.

## ADR-004: Multiusuário desde o dia 1
- **Status:** aceita
- **Contexto:** PROMPT_MESTRE 2.4 e 3.4.
- **Decisão:** toda tabela de dados do usuário tem `user_id`; todo repository exige `userId`; testes de isolamento A × B por recurso.

## ADR-005: Branch de trabalho no ambiente remoto
- **Status:** aceita
- **Contexto:** a convenção é branch por fase (`phase/NN-nome`), mas a sessão remota do Claude Code recebe uma branch designada e não pode criar outras sem permissão.
- **Decisão:** quando a sessão tiver branch designada, a fase é desenvolvida nela; o nome da fase fica no título do PR. Fora disso, vale `phase/NN-nome`.
- **Consequências:** o merge na main continua exigindo tudo verde.
