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

## ADR-006: Pacotes internos consumidos como fonte TypeScript
- **Status:** aceita
- **Contexto:** lacuna; é preciso compartilhar `core`, `schemas` e `db` entre web e api.
- **Decisão:** pacotes `@atlas/*` exportam `src/*.ts` diretamente (sem build próprio). `tsconfig` com `moduleResolution: "Bundler"`. Next usa `transpilePackages`; a API roda com `tsx` em dev e é empacotada com `tsup` (pacotes do workspace embutidos) no build; dependências de terceiros usadas por esses pacotes em runtime (ex.: `pg`, `drizzle-orm`) também são declaradas na API.
- **Consequências:** zero etapa de build intermediária; typecheck por pacote com `tsc --noEmit`.

## ADR-007: Web chama a API pelo mesmo origin
- **Status:** aceita
- **Contexto:** lacuna; cookie `httpOnly` + `SameSite=Lax` precisa chegar à API.
- **Decisão:** o Next faz `rewrites` de `/api/v1/*` para `API_URL`. O navegador só fala com o origin do front. A API mantém CORS restrito a `WEB_ORIGIN` e verifica o header `Origin` em métodos de escrita (ausente é aceito; divergente → 403 `ORIGIN_FORBIDDEN`).
- **Consequências:** sem CORS no fluxo normal; deploy precisará manter o proxy (revisar na Fase 8).

## ADR-008: UUID v7 gerado na aplicação
- **Status:** aceita
- **Contexto:** PG16 não gera UUID v7 nativamente.
- **Decisão:** pacote `uuidv7` via `$defaultFn` do Drizzle.

## ADR-009: Detalhes de autenticação
- **Status:** aceita
- **Contexto:** PROMPT_MESTRE 3.4 define o modelo; faltam parâmetros concretos.
- **Decisão:** argon2id via `@node-rs/argon2` (m=19456 KiB, t=2, p=1, OWASP). Senha 8–128 caracteres. Cookie `atlas_session`; flag `Secure` por `COOKIE_SECURE` (padrão `true` em produção, `false` em dev/test, pois o dev roda em http). Renovação deslizante: ao usar uma sessão com menos de 15 dias restantes, estende para 30 dias (evita escrita a cada request). Rate limit com `@fastify/rate-limit` em memória (instância única): login 5/min por IP e 5/min por e-mail; cadastro 5/min por IP (limite configurável por `AUTH_RATE_LIMIT_MAX`, padrão 5; testes usam valor alto). `trustProxy` restrito a loopback (rewrite do Next). Login com e-mail inexistente também executa verificação de hash (tempo constante aproximado) e retorna o mesmo erro `INVALID_CREDENTIALS`.
- **Consequências:** rate limit em memória precisa de store compartilhado se houver mais de uma instância (ADR futura).

## ADR-010: Postgres dos testes de integração
- **Status:** aceita
- **Contexto:** Testcontainers exige Docker, que nem todo ambiente de desenvolvimento tem.
- **Decisão:** testes usam Testcontainers (`postgres:16`) por padrão; se `TEST_DATABASE_URL` estiver definida, usam esse Postgres. A CI usa Testcontainers.

## ADR-011: Versão do TypeScript
- **Status:** aceita
- **Contexto:** TypeScript 7 (nativo) já existe, mas `typescript-eslint` suporta até `<6.1`.
- **Decisão:** fixar `typescript ~6.0`. Revisar quando o lint suportar 7.

## ADR-012: Rotas do front
- **Status:** aceita
- **Contexto:** PROMPT_MESTRE 3.2 lista hoje, treino, nutricao, progresso, coach, perfil; auth não tem rota definida.
- **Decisão:** `/entrar` e `/cadastro` para auth; `/` redireciona para `/hoje`. Rotas autenticadas protegidas no cliente via `GET /api/v1/auth/me`.

## ADR-013: Cliente HTTP do front na Fase 0
- **Status:** aceita
- **Contexto:** P3.5 pede cliente derivado dos schemas Zod, sem tipos à mão.
- **Decisão:** wrapper `fetch` tipado com `z.infer` dos schemas de `@atlas/schemas`, que também valida respostas. Geração a partir do OpenAPI só se o wrapper deixar de bastar.

## ADR-014: Proxy confiável e origin do front configuráveis
- **Status:** aceita
- **Contexto:** revisão da Fase 0: com `trustProxy` fixo em loopback, web e api em hosts diferentes fariam todos os usuários compartilharem o mesmo IP no rate limit; `WEB_ORIGIN` com barra final bloquearia toda escrita.
- **Decisão:** `TRUST_PROXY` por env (`loopback` padrão ou lista de IPs/CIDRs separada por vírgula), repassado ao Fastify. `WEB_ORIGIN` normalizado para `URL.origin`. Erros 4xx do framework (JSON malformado, content-type, corpo grande) usam o código `BAD_REQUEST`, separado de `VALIDATION_ERROR`. O limite por e-mail no login devolve `Retry-After`.
- **Consequências:** o deploy (Fase 8) precisa definir `TRUST_PROXY` e `WEB_ORIGIN` corretos. O limitador por e-mail em memória (LRU de 5000 chaves) pode perder contadores sob carga de muitos e-mails distintos; um store compartilhado entra junto com a ADR de múltiplas instâncias.

## ADR-015: Metas da Fase 1 calculadas sob demanda
- **Status:** aceita
- **Contexto:** a Fase 1 exige metas visíveis; persistência diária e distribuição por tipo de dia (P5.8) são da Fase 2.
- **Decisão:** `GET /nutrition/targets?from&to` calcula por fórmula (`method: formula`), sem persistir. Cada dia recebe a base semanal (média do GET dos 7 dias planejados, P5.2) com `dayType: null`. `POST /goals` devolve as metas resultantes como impacto.
- **Consequências:** a Fase 2 passa a persistir em `nutrition_targets` mantendo o mesmo contrato.

## ADR-016: Exercício planejado antes de existirem sessões
- **Status:** aceita
- **Contexto:** o GET semanal (P5.2) precisa do exercício planejado; na Fase 1 só existem disponibilidade e esportes do onboarding.
- **Decisão:** cada linha de `availability` com `kind = gym` é uma sessão de musculação moderada (MET 3,5) de `max_minutes`. Esportes: `weekly_frequency × typical_duration_min`, MET: futebol/futsal 7,0 (`typical_intensity ≤ 3`) ou 10,0 (`≥ 4`); corrida 8,0; ciclismo 6,8; natação 5,8; outro 3,5 (caminhada). A água usa as horas médias diárias desse plano.
- **Consequências:** substituído pelo plano real (planned_workouts, activities) nas Fases 3 e 5.

## ADR-017: Trava clínica
- **Status:** aceita
- **Contexto:** P5.7 proíbe gerar planos em gestação, doenças, transtornos alimentares ou uso de medicamentos, mas o modelo de dados não tem onde registrar isso.
- **Decisão:** coluna aditiva `profiles.clinical_condition boolean not null default false`, perguntada no onboarding. Se `true`, o endpoint de metas não gera números e retorna `blocked: 'CLINICAL_CONDITION'`; a interface recomenda acompanhamento profissional.

## ADR-018: Tendência de peso e aviso de plausibilidade
- **Status:** aceita
- **Contexto:** P5.5 define a EMA; faltam regras para várias pesagens no dia e para o aviso de P3.6.
- **Decisão:** várias pesagens no mesmo dia → média do dia. EMA calculada desde a primeira pesagem e recortada ao período pedido. Variação maior que 2% da tendência por dia desde a última pesagem gera `warnings: ['WEIGHT_CHANGE_UNUSUAL']` e confirmação na interface; nunca bloqueia.

## ADR-019: Preferências de exercício adiadas
- **Status:** aceita
- **Contexto:** `GET|PUT exercise-preferences` (P11) depende do catálogo de exercícios.
- **Decisão:** implementado na Fase 3.

## ADR-020: Onboarding completo
- **Status:** aceita
- **Contexto:** o app precisa saber quando levar o usuário ao onboarding.
- **Decisão:** completo = `profiles` existente + ao menos um `goals` + ao menos uma pesagem. `GET /profile` devolve `onboardingComplete`; o layout autenticado redireciona para `/onboarding` enquanto for `false`.

## ADR-021: Valores escolhidos dentro das faixas da especificação
- **Status:** aceita
- **Contexto:** P5.4 e P5.6 dão faixas; o cálculo precisa de um número.
- **Decisão:** fat_loss −20% (valor padrão indicado); recomposition −5%; performance 0% (o carboidrato alto sai da regra de macros); proteína 2,2 g/kg em fat_loss/recomposition. `target_rate_pct_per_week` tem sinal (negativo = perder). Arredondamento: kcal e gramas inteiros (macros calculados a partir da kcal e da proteína já arredondadas); água em múltiplos de 50 ml.

## ADR-022: Ajustes da revisão da Fase 1
- **Status:** aceita
- **Contexto:** revisão da Fase 1 (checklist 16.3).
- **Decisão:**
  - `target_rate_pct_per_week` precisa combinar com o objetivo (P5.4): fat_loss −1,0 a −0,5; maintenance −0,25 a +0,25; muscle_gain +0,25 a +0,5; recomposition e performance não usam ritmo.
  - Proteína por massa magra (P5.6) só com gordura medida (dexa, dobras, bioimpedância) nos últimos 60 dias, mesma regra da TMB.
  - Com trava aplicada, as kcal são arredondadas para cima, nunca ficando abaixo do limite.
  - Medidas corporais com data no futuro são rejeitadas.
  - PATCH não aplica valores padrão a campos ausentes.
- **Consequências:** proteína + gordura acima das kcal (só possível com `protein_g_per_kg` muito alto) segue em aberto em `OPEN_QUESTIONS.md`.

## ADR-023: Fonte e tratamento dos dados da TACO
- **Status:** aceita
- **Contexto:** P6.4 pede a TACO como base. Os dados oficiais (NEPA/UNICAMP) estão em planilha; há uma conversão pública em JSON (marcelosanto/tabela_taco, 597 itens da 4ª edição).
- **Decisão:** snapshot versionado em `packages/db/seeds/foods/taco.json`, só com os campos usados, conferido por amostragem contra a tabela oficial. "Tr" (traço) → 0; "NA", "*" e vazio → `null` (nunca zero implícito). Itens sem kcal ficam fora do seed. `category` e `state` derivados do grupo e da descrição TACO. `food_sources.license_note` credita NEPA/UNICAMP. TBCA, USDA e Open Food Facts ficam para depois (OPEN_QUESTIONS).

## ADR-024: Aliases e medidas caseiras
- **Status:** aceita
- **Contexto:** P6.4 pede aliases e medidas dos alimentos mais comuns; P6.2 define regras de estado padrão.
- **Decisão:** seed manual em `packages/db/seeds/foods/` apontando para itens TACO pelo nome original. Medidas genéricas (colher, concha, xícara...) e específicas (exemplos da P4.5). Itens comuns ausentes na TACO (ex.: whey) entram pelo cadastro rápido de alimento personalizado.

## ADR-025: Parser de texto por IA
- **Status:** aceita
- **Contexto:** P6.2 e P10.6.
- **Decisão:** `packages/ai` usa o SDK oficial da Anthropic com o modelo de `AI_MODEL_FAST` (sem valor padrão no código; `.env.example` traz o identificador atual). Sem chave ou modelo, erro, resposta inválida ou timeout de 4 s → parser por regras do core. A resposta é validada por Zod e contém só itens, quantidades, unidades e preparo.

## ADR-026: Tipo de dia e metas persistidas na Fase 2
- **Status:** aceita
- **Contexto:** P5.8 deriva o tipo de dia de treinos e atividades, que só existem a partir das Fases 3 e 5.
- **Decisão:** até lá, o tipo de dia vem do plano semanal: dia com disponibilidade de academia → `training`; dia com `sports.weekday_hint` → `sport`; ambos → `sport_and_training`; nada → `rest`. A distribuição P5.8 preserva a média semanal, calculada no core. `nutrition_targets` passa a ser persistido: hoje e dias futuros são recalculados quando pedidos; dias passados usam o snapshot existente e nunca são recalculados (sem snapshot, calcula e grava uma vez). `PUT nutrition/targets/:date/day-type` sobrescreve o tipo (`day_type_overridden`). Substitui a parte "sem persistir" da ADR-015.

## ADR-027: Idempotência adiada
- **Status:** aceita
- **Contexto:** P3.5 pede `Idempotency-Key` em criações, essencial para a fila offline (Fase 3).
- **Decisão:** implementada na Fase 3, junto com o primeiro fluxo offline.

## ADR-028: Detalhes do matching e da distribuição semanal
- **Status:** aceita
- **Contexto:** P6.2 (matching) e P5.8 (rebalanceamento) deixam parâmetros em aberto.
- **Decisão:** uso do usuário normalizado como `min(1, vezes_usado / 10)`. Regra de estado padrão aplicada como penalidade × 0,8 na similaridade de itens crus de cereais, leguminosas, carnes, aves, peixes, tubérculos e ovos quando o texto não diz "cru"; aliases cobrem os padrões específicos ("frango" → peito grelhado). O parser por regras separa itens só por vírgula, ";", "+", quebra de linha e " e " (P6.2), não por "com". Rebalanceamento semanal: a diferença para a média é repartida igualmente entre os 7 dias; cada dia respeita o piso max(TMB, 1500/1200), que prevalece sobre a média.

## ADR-029: Arredondamento dos valores da TACO
- **Status:** aceita
- **Contexto:** a conversão pública traz médias sem arredondar (ex.: 128,258 kcal); a TACO impressa publica 128 kcal. O DoD da Fase 2 confere valores contra a TACO.
- **Decisão:** o snapshot usa o arredondamento da tabela impressa: kcal e minerais em mg inteiros; macronutrientes, fibra, gordura saturada e ferro com 1 casa decimal.

## ADR-030: Campos extras no snapshot de refeições e metas
- **Status:** aceita
- **Contexto:** histórico imutável (P1.6) e sobrescrita do tipo de dia (P5.8).
- **Decisão:** `meal_items.food_name` guarda o nome do alimento no momento do registro (junto de `nutrients_snapshot`), para o histórico não depender do catálogo. `nutrition_targets.day_type_overridden` marca o tipo de dia escolhido pelo usuário, que recálculos preservam. `food_aliases.user_id` (nulo = sistema) permite aliases pessoais (P6.2 passo 8).
