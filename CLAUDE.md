# CLAUDE.md: Atlas

Central pessoal de treino, nutrição, composição corporal e performance.
Especificação completa: `PROMPT_MESTRE.md`. Estado atual: `docs/PROGRESS.md`. Decisões: `docs/DECISIONS.md`.

## Antes de qualquer tarefa
1. Ler `docs/PROGRESS.md` e identificar a fase atual.
2. Ler a seção da fase em `docs/ROADMAP.md`.
3. Em dúvida sobre regra ou cálculo, consultar `PROMPT_MESTRE.md` antes de perguntar.

## Regras invioláveis
- Todo cálculo (nutrição, treino, recuperação, unidades) vive em `packages/core`, como função pura e testada.
- Nenhum número exibido ao usuário vem de LLM. LLM extrai estrutura e redige; o core calcula.
- Toda query de dados do usuário filtra por `user_id`. Sem exceção.
- Histórico é imutável: refeições e séries guardam snapshot. Editar alimento não altera o passado.
- Travas nutricionais (PROMPT_MESTRE 5.7) nunca são contornadas.
- Não apagar nem enfraquecer teste para fazê-lo passar.
- Mudança de decisão arquitetural: nova ADR em `docs/DECISIONS.md` antes do código.
- Requisito ausente: escolher o mais simples, registrar ADR, seguir. Sem inventar escopo.

## Stack
pnpm + Turborepo · Next.js (App Router) + Tailwind + shadcn/ui + TanStack Query + Zustand · Fastify + Zod · PostgreSQL 16 + Drizzle · pg-boss · Vitest + Testcontainers + Playwright · Anthropic SDK.

## Estrutura
- `apps/web`: front (features por domínio em `src/features`)
- `apps/api`: back (módulos em `src/modules/<nome>`: routes, service, repository)
- `packages/core`: cálculos puros
- `packages/schemas`: contratos Zod compartilhados
- `packages/db`: schema, migrations, seeds
- `packages/ai`: prompts, ferramentas, parser, avaliações

## Comandos
- `pnpm dev`: sobe web, api e Postgres
- `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm test:e2e`
- `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:seed` · `pnpm db:seed:demo`
- `pnpm ai:eval`: avaliação do parser e do Coach

## Ciclo de trabalho
Plano curto (modo plan) → aprovação → passos pequenos → typecheck + lint + testes → commit → ao fim da fase: suíte completa, revisão, atualizar `PROGRESS.md`, merge.
Se o mesmo erro persistir após duas tentativas: parar, registrar hipóteses em `PROGRESS.md`, propor abordagem diferente.

## Convenções
- Código, tabelas e commits em inglês; interface e textos em pt-BR.
- Conventional Commits. Branch por fase: `phase/NN-nome`.
- Unidades internas: kg, g, ml, cm, kcal, s. Datas em UTC; "dia" pelo fuso do usuário.
- Erros da API em RFC 7807 com `code` estável.
- Migrations geradas pelo drizzle-kit; nunca editar migration aplicada.

## Ao encerrar a sessão
Atualizar `docs/PROGRESS.md`: feito, pendente, bugs conhecidos, próximo passo.
