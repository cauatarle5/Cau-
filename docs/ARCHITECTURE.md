# ARCHITECTURE: Atlas

Condensado de `PROMPT_MESTRE.md` Partes 3, 10.1, 13 e 14.

## 1. Stack (P3.1)

| Camada | Escolha |
|---|---|
| Linguagem | TypeScript estrito (`strict: true`) |
| Monorepo | pnpm workspaces + Turborepo |
| Front | Next.js (App Router) + React, PWA |
| UI | Tailwind CSS + shadcn/ui + lucide-react |
| Estado | TanStack Query (servidor), Zustand (local) |
| Formulários | React Hook Form + Zod |
| Gráficos | Recharts; heatmap muscular em SVG próprio |
| Back | Node.js + Fastify (monólito modular) |
| Contratos | Zod + `fastify-type-provider-zod` + OpenAPI (em `packages/schemas`) |
| Banco | PostgreSQL 16 (`pg_trgm`, `unaccent`, `citext`) |
| ORM | Drizzle ORM + drizzle-kit |
| Jobs | pg-boss |
| Auth | Cookie httpOnly + tabela `sessions` + argon2id |
| IA | Anthropic SDK; modelos por env |
| Logs | pino com `request_id` |
| Testes | Vitest, Testcontainers, Playwright |
| Local | Docker Compose (Postgres) |
| Deploy | Pós-MVP, via ADR |

## 2. Estrutura (P3.2)

```
.
├── CLAUDE.md · PROMPT_MESTRE.md · docker-compose.yml · turbo.json · pnpm-workspace.yaml
├── .claude/commands/      # /fase, /revisar, /status, /delta
├── docs/                  # SPEC, ARCHITECTURE, DATA_MODEL, DECISIONS, ROADMAP, PROGRESS, OPEN_QUESTIONS
├── apps/
│   ├── web/src/{app,features,components,lib,offline}
│   └── api/src/{modules,plugins,jobs,server.ts}
└── packages/
    ├── core/      # funções puras: nutrição, treino, recuperação, unidades, estatística
    ├── schemas/   # Zod: DTOs, enums, contratos
    ├── db/        # schema Drizzle, migrations, seeds
    └── ai/        # prompts, ferramentas, parser, avaliações
```

**Regra central:** todo cálculo vive em `packages/core`, sem banco, rede ou framework. O back persiste resultados oficiais; o front usa o mesmo core para simulações instantâneas.

## 3. Back-end (P3.3)

Cada módulo: `routes.ts` (Fastify + Zod), `service.ts` (orquestração, transações), `repository.ts` (dados, sempre com `userId`), `index.ts`.

Módulos: `auth`, `profile`, `body`, `exercises`, `training`, `activities`, `recovery`, `foods`, `nutrition`, `recipes`, `meal-plans`, `daily-context`, `analytics`, `insights`, `ai`, `integrations`.

Módulos não acessam tabelas uns dos outros: conversam por serviços.

## 4. Autenticação e segurança (P3.4)
- E-mail + senha; argon2id (parâmetros OWASP).
- Sessão: token aleatório de 32 bytes; SHA-256 em `sessions.token_hash`; cookie `httpOnly`, `Secure`, `SameSite=Lax`; 30 dias, renovação deslizante.
- CSRF: `SameSite=Lax` + verificação de `Origin` em métodos de escrita.
- Rate limit: login 5/min por IP e por e-mail; IA 30/min por usuário (configurável).
- Todo repository exige `userId`; teste de integração de isolamento A × B em todos os recursos.
- Segredos só em env; `.env.example`; nada de chave no front. helmet; CORS restrito à origem do front.
- LGPD: exportação JSON e exclusão em cascata.
- Chave Anthropic só no back.

## 5. Padrões de API (P3.5)
- REST `/api/v1`, JSON, recursos em inglês no plural.
- `date` = `YYYY-MM-DD` (dia do usuário); instantes `timestamptz` ISO 8601.
- Paginação por cursor (`?cursor=&limit=`, padrão 50).
- Erros RFC 7807 (`application/problem+json`): `type`, `title`, `status`, `detail`, `code` estável (ex.: `VALIDATION_ERROR`, `FOOD_NOT_FOUND`, `UNIT_NOT_CONVERTIBLE`), `errors[]` por campo.
- `Idempotency-Key` em criação.
- OpenAPI em `/api/docs` (dev).
- Cliente do front derivado dos schemas Zod compartilhados.

## 6. Validação e erros (P3.6)
- Zod na borda + invariantes no domínio.
- Faixas: peso 25–350 kg; altura 100–250 cm; gordura 2–70%; reps 0–100; carga 0–1000 kg; RPE 1–10; RIR 0–10; sono 0–16 h; escalas 1–5; alimento > 0 e ≤ 5000 g/item.
- Valores implausíveis mas válidos → aviso de confirmação, não erro.
- 500 genérico com `request_id` no log, sem stack na resposta.
- Falha de IA nunca bloqueia registro (IA → regras → busca manual).

## 7. Camada de inteligência (P10.1)
1. Motor analítico determinístico (core + jobs).
2. Insights determinísticos (tabela `insights`, sem LLM).
3. Coach IA: LLM com ferramentas que consultam 1 e 2; escrita só por proposta confirmada.

## 8. Testes (P13)
| Nível | Ferramenta | Escopo |
|---|---|---|
| Unitário | Vitest | `packages/core`: 100% das funções de cálculo com casos numéricos |
| Unitário | Vitest | Unidades e parser por regras: ≥ 60 frases |
| Integração | Vitest + Testcontainers | Cada rota: sucesso, validação, 404, isolamento entre usuários |
| E2E | Playwright | Fluxos críticos (cadastro, refeição, planejamento, treino offline, check-in, receita) |
| Avaliação IA | `packages/ai/evals` | Parser ≥ 90% item / ≥ 95% quantidade; Coach 14 perguntas |
| Regressão | GitHub Actions | typecheck, lint, unit, integração, E2E a cada push na main |

Todo bug corrigido ganha teste. Mudança de fórmula atualiza o caso de teste com justificativa no commit.

## 9. Convenções (P14)
- ESLint + Prettier + `typescript-eslint` estrito; imports ordenados; sem `console.log` fora de scripts.
- Arquivos `kebab-case`, componentes `PascalCase`, funções `camelCase`, tabelas `snake_case` plural.
- Front por feature (`features/<domínio>/{components,hooks,api.ts}`); sem lógica de negócio em componentes.
- Conventional Commits; branch por fase `phase/NN-nome`; merge na main com tudo verde.
- Migrations geradas pelo drizzle-kit, revisadas, nunca editadas depois de aplicadas.
- Seeds idempotentes: `pnpm db:seed` e `pnpm db:seed:demo` (90 dias).
- Feature flags por env.
- Evolução (P16.6): mudanças de schema aditivas; destrutiva exige duas etapas + ADR; quebra de contrato só em `/api/v2`.
- Imports relativos sem extensão (`moduleResolution: "Bundler"`), pois o Turbopack não mapeia `.js` → `.ts` em pacotes do workspace.
