# PROMPT MESTRE: ATLAS
## Central pessoal de treinamento, nutrição, composição corporal e performance

> Codinome do projeto: **Atlas** (pode ser trocado a qualquer momento; é só um nome de repositório).
> Este documento é, ao mesmo tempo, especificação de produto, especificação de arquitetura e protocolo de desenvolvimento. Ele foi escrito para ser executado no **Claude Code**, dentro de um repositório real.

---

## PARTE 0. COMO USAR ESTE DOCUMENTO

### 0.1 Estratégia de ferramenta (decisão tomada)

| Etapa | Ferramenta | Motivo |
|---|---|---|
| Visão de produto, regras de negócio, dúvidas de conceito | Claude (chat), em um Projeto "Atlas" | Raciocínio longo sem custo de contexto de código; bom para debater trade-offs |
| Transformar este documento em docs do repositório | Claude Code | Os docs precisam morar no repo, versionados junto com o código |
| Implementação, migrations, seeds, testes, debugging, refatoração | Claude Code | Lê e edita múltiplos arquivos, executa comandos, roda testes, usa git |
| Revisão de código de cada fase | Claude Code (subagente revisor) + opcionalmente Claude chat com o diff | Segunda leitura independente reduz erro sistemático |
| Novas funcionalidades depois do MVP | Claude chat escreve o "delta de especificação"; Claude Code implementa | Evita que ideias novas contaminem o código sem decisão explícita |
| Ajuste de UX a partir de prints | Claude chat analisa; Claude Code implementa | O chat é melhor para crítica visual livre |

**Conclusão:** fluxo híbrido, com o Claude Code como ambiente principal. O chat nunca escreve código de produção deste projeto; ele produz decisões e deltas de especificação que o Claude Code incorpora aos docs antes de implementar.

### 0.2 Regra de corte do planejamento

O planejamento termina quando existirem no repositório: `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/DECISIONS.md`, `docs/ROADMAP.md`, `docs/PROGRESS.md` e `CLAUDE.md`.

Isso deve acontecer **na primeira sessão**, e na mesma sessão a Fase 0 (fundação) começa a ser implementada. A partir daí:

- nenhuma nova rodada de planejamento geral sem código rodando;
- cada fase tem no máximo um plano curto (modo plan do Claude Code), aprovado e executado;
- dúvida que não bloqueia a fase atual vira item em `docs/OPEN_QUESTIONS.md` e não interrompe a construção;
- se uma decisão deste documento se mostrar ruim na prática, registra-se uma ADR nova em `DECISIONS.md` e segue-se em frente.

### 0.3 Como manter o contexto ao longo de semanas

1. `CLAUDE.md` na raiz: regras permanentes, comandos, convenções. Curto (até ~150 linhas). O Claude Code lê em toda sessão.
2. `docs/PROGRESS.md`: estado atual, fase corrente, o que foi feito, o que falta, bugs conhecidos. Atualizado ao fim de toda sessão.
3. `docs/DECISIONS.md`: ADRs numeradas. Nunca editar uma ADR antiga; criar outra que a substitui.
4. `/clear` entre fases ou quando a conversa ficar longa. O estado vive nos arquivos, não na conversa.
5. Commits pequenos e descritivos por etapa. O histórico do git também é memória.
6. No Projeto do Claude chat, manter anexados: este prompt, `PROGRESS.md` e `DECISIONS.md` atualizados.

### 0.4 Primeira mensagem a enviar no Claude Code

```
Leia PROMPT_MESTRE.md por inteiro. Depois:
1) Gere os docs listados na Parte 0.2, condensando este documento (sem inventar requisitos novos).
2) Crie o CLAUDE.md seguindo o modelo CLAUDE.md fornecido.
3) Entre em modo plan e proponha o plano da Fase 0. Aguarde minha aprovação.
4) Aprovado o plano, implemente a Fase 0 até o Definition of Done.
Não faça perguntas que este documento já responde. Onde houver lacuna, escolha a opção mais simples, registre em DECISIONS.md e siga.
```

---

## PARTE 1. PAPEL E REGRAS DA IA DE DESENVOLVIMENTO

Você é um engenheiro de software sênior full-stack, com domínio de TypeScript, Node.js, PostgreSQL, React/Next.js e arquitetura de produtos de dados. Você também conhece ciência do treinamento (hipertrofia, força, periodização, carga interna) e nutrição esportiva baseada em evidência, o suficiente para implementar regras corretas e rejeitar regras erradas.

Regras de conduta:

1. **Construa, não discuta.** Este documento já toma as decisões grandes. Seu trabalho é executá-las com qualidade.
2. **Incremental e sempre rodando.** Ao fim de cada etapa, o sistema sobe, os testes passam e existe algo utilizável.
3. **Cálculo é determinístico; linguagem é da IA.** Nenhum número exibido ao usuário (calorias, macros, volume, e1RM, metas) pode ser produzido por um LLM. LLMs interpretam texto, extraem estrutura e explicam resultados calculados por código testado.
4. **Nada de requisitos inventados.** Se algo não está aqui, escolha o mais simples, registre ADR e siga.
5. **Não quebre o que funciona.** Antes de commitar: typecheck, lint e testes verdes. É proibido apagar ou enfraquecer teste para fazê-lo passar.
6. **Histórico é imutável.** Registros passados (refeições, séries, medidas) guardam snapshot dos valores no momento do registro. Alterar um alimento no banco não reescreve o passado.
7. **Segurança e privacidade por padrão.** Dados de saúde são sensíveis (LGPD). Todo acesso é escopado por `user_id`.
8. **O sistema não é médico.** Não diagnostica, não prescreve para condições clínicas, e encaminha dor persistente ou sintomas para profissional.
9. **Idioma:** interface, mensagens e respostas da IA em português do Brasil. Código, nomes de tabelas, variáveis e commits em inglês.
10. **Unidades:** sistema métrico. Internamente: kg, g, ml, cm, kcal, segundos. Datas em UTC no banco; o "dia" do usuário é calculado pelo fuso dele (padrão `America/Sao_Paulo`).

---

## PARTE 2. VISÃO DO PRODUTO

### 2.1 O que é

Uma central pessoal que responde, com dados reais do usuário:

> **Quem eu sou, quais são meus objetivos, como estou treinando, o que estou comendo, como estou me recuperando e o que devo fazer a seguir para continuar evoluindo?**

Não é um app de registro de treino nem uma calculadora de calorias. É um sistema que registra o que **realmente aconteceu**, compara com o que foi **planejado**, calcula métricas e **adapta** o próximo passo.

### 2.2 As duas perguntas da interface

Toda tela serve a uma destas perguntas:

- **"O que eu preciso fazer hoje?"** (tela Hoje)
- **"Como estou evoluindo?"** (tela Progresso)

### 2.3 Módulos

| Módulo | Função |
|---|---|
| Perfil e Corpo | Dados pessoais, objetivos, limitações, preferências, medidas e composição corporal |
| Treinador | Catálogo de exercícios, programas, periodização, sessões executadas, progressão, esportes |
| Recuperação | Check-in diário, carga interna, prontidão |
| Nutricionista | Metas energéticas e de macros, metas por tipo de dia, recálculo adaptativo |
| Registro Alimentar | Registro por texto livre, medidas caseiras, alimentos personalizados |
| Receitas | Receitas compostas, valores por porção, favoritas, sugestão por macros restantes |
| Planejamento Alimentar | Refeições planejadas, simulação em tempo real, sugestões de ajuste |
| Integração | Contexto diário unificado: treino + esporte + recuperação + alimentação |
| Análise e Insights | Motor determinístico de métricas, tendências, alertas e correlações |
| Coach IA | Conversa em linguagem natural sobre os dados do usuário, com ferramentas |
| Dashboard | Hoje e Progresso |

### 2.4 Premissas de uso

- Usuário principal único (o dono), mas o schema é **multiusuário desde o dia 1** (todo registro tem `user_id`). Isso permite abrir para outras pessoas no futuro sem migração estrutural.
- Uso predominante no celular, na academia e em casa. Web responsiva instalável (PWA) primeiro; app nativo depois (necessário para Apple Health).
- Registrar uma refeição: meta de **até 10 segundos**. Confirmar uma série: **1 toque**.
- O sistema funciona **sem IA** (degradação graciosa). A IA acelera e explica; não é dependência para registrar e calcular.

---

## PARTE 3. ARQUITETURA

### 3.1 Stack (decidido)

| Camada | Escolha | Observação |
|---|---|---|
| Linguagem | TypeScript estrito em todo o projeto | `strict: true`, sem `any` implícito |
| Monorepo | pnpm workspaces + Turborepo | Compartilha tipos e cálculos entre front e back |
| Front-end | Next.js (App Router) + React | Renderização no cliente para telas interativas; PWA |
| UI | Tailwind CSS + shadcn/ui + lucide-react | Visual limpo, sem biblioteca pesada |
| Estado de servidor | TanStack Query | Cache, otimismo, revalidação |
| Estado local | Zustand | Sessão de treino ativa, rascunho de refeição |
| Formulários | React Hook Form + Zod | Mesmos schemas do back-end |
| Gráficos | Recharts | Linhas, barras, áreas; heatmap muscular em SVG próprio |
| Back-end | Node.js + Fastify | Monólito modular |
| Validação/Contratos | Zod + `fastify-type-provider-zod` + geração OpenAPI | Contrato único em `packages/schemas` |
| Banco | PostgreSQL 16 | Extensões `pg_trgm`, `unaccent`, `citext` |
| ORM | Drizzle ORM + drizzle-kit | SQL explícito, migrations versionadas |
| Jobs | pg-boss (fila no próprio Postgres) | Sem Redis na fase inicial |
| Auth | Sessão em cookie httpOnly + tabela `sessions` + argon2id | Implementação própria, simples e auditável |
| IA | Anthropic API (Claude) via SDK oficial | Modelos configuráveis por variável de ambiente |
| Logs | pino com `request_id` | JSON estruturado |
| Testes | Vitest, Testcontainers (Postgres), Playwright | Ver Parte 13 |
| Ambiente local | Docker Compose (Postgres) | `pnpm dev` sobe tudo |
| Deploy (depois do MVP) | Web na Vercel; API e Postgres em provedor gerenciado (Railway, Render ou Fly + Neon) | Decidir na fase de deploy via ADR |

### 3.2 Estrutura do repositório

```
atlas/
├── CLAUDE.md
├── PROMPT_MESTRE.md
├── docker-compose.yml
├── turbo.json
├── pnpm-workspace.yaml
├── .claude/
│   └── commands/            # comandos customizados (/fase, /revisar, /status)
├── docs/
│   ├── SPEC.md
│   ├── ARCHITECTURE.md
│   ├── DATA_MODEL.md
│   ├── DECISIONS.md
│   ├── ROADMAP.md
│   ├── PROGRESS.md
│   └── OPEN_QUESTIONS.md
├── apps/
│   ├── web/                 # Next.js
│   │   └── src/
│   │       ├── app/         # rotas (hoje, treino, nutricao, progresso, coach, perfil)
│   │       ├── features/    # uma pasta por domínio (training, nutrition, recipes...)
│   │       ├── components/  # componentes genéricos
│   │       ├── lib/         # api client, formatadores, hooks utilitários
│   │       └── offline/     # fila IndexedDB e sincronização
│   └── api/                 # Fastify
│       └── src/
│           ├── modules/     # ver 3.3
│           ├── plugins/     # auth, errors, rate-limit, logger
│           ├── jobs/        # handlers pg-boss
│           └── server.ts
└── packages/
    ├── core/                # FUNÇÕES PURAS: nutrição, treino, recuperação, unidades, estatística
    ├── schemas/             # Zod: DTOs, enums, contratos da API
    ├── db/                  # schema Drizzle, migrations, seeds (alimentos, exercícios, medidas)
    └── ai/                  # prompts, definição de ferramentas, parser de alimentos, avaliações
```

**Regra central:** toda regra de cálculo vive em `packages/core`, sem dependência de banco, rede ou framework. O back-end usa o core para persistir resultados oficiais; o front usa o mesmo core para simulações instantâneas (planejamento alimentar, preview de treino). Um cálculo, um lugar, testado uma vez.

### 3.3 Módulos do back-end

Cada módulo segue a mesma forma:

```
modules/<nome>/
├── routes.ts       # rotas Fastify + schemas Zod
├── service.ts      # orquestração, transações, regras de aplicação
├── repository.ts   # acesso a dados, sempre filtrando por user_id
└── index.ts
```

Módulos: `auth`, `profile`, `body`, `exercises`, `training` (programas, planos, sessões), `activities` (esportes e cardio), `recovery`, `foods`, `nutrition` (metas, registros, tipos de dia), `recipes`, `meal-plans`, `daily-context`, `analytics`, `insights`, `ai`, `integrations` (vazio até a fase futura).

Módulos não acessam tabelas uns dos outros diretamente: conversam por serviços. Isso permite extrair módulos no futuro.

### 3.4 Autenticação e segurança

- Cadastro e login por e-mail e senha. Senha com argon2id (parâmetros OWASP atuais).
- Sessão: token aleatório de 32 bytes, armazenado como hash SHA-256 na tabela `sessions`, enviado em cookie `httpOnly`, `Secure`, `SameSite=Lax`. Expira em 30 dias, renovação deslizante.
- Proteção CSRF: `SameSite=Lax` + verificação de `Origin` em métodos de escrita.
- Rate limit: login (5/min por IP e por e-mail), endpoints de IA (configurável, padrão 30/min por usuário).
- Autorização: todo repository recebe `userId` obrigatório; nenhum método de leitura ou escrita existe sem ele. Teste de integração garante que usuário A não acessa dado de B em todos os recursos.
- Segredos só em variáveis de ambiente; `.env.example` documentado; nada de chave no front.
- Headers de segurança (helmet), CORS restrito à origem do front.
- LGPD: endpoints de exportação completa (JSON) e exclusão de conta com remoção em cascata.
- Chave da Anthropic apenas no back-end. O front nunca chama a API de IA diretamente.
- Fotos (fase futura): armazenamento em bucket privado com URLs assinadas de curta duração.

### 3.5 Padrões de API

- REST, prefixo `/api/v1`, JSON, nomes de recursos em inglês no plural.
- Datas ISO 8601. Campo `date` (dia do usuário) em `YYYY-MM-DD`; instantes em `timestamptz`.
- Paginação por cursor (`?cursor=&limit=`), limite padrão 50.
- Erros no formato RFC 7807 (`application/problem+json`) com `type`, `title`, `status`, `detail`, `code` (ex.: `FOOD_NOT_FOUND`, `VALIDATION_ERROR`, `UNIT_NOT_CONVERTIBLE`) e `errors[]` por campo.
- Idempotência: endpoints de criação aceitam header `Idempotency-Key` (essencial para a fila offline).
- OpenAPI gerado automaticamente e servido em `/api/docs` em desenvolvimento.
- Cliente do front gerado a partir dos schemas Zod compartilhados (sem tipos duplicados à mão).

### 3.6 Tratamento de erros e validação

- Validação na borda (Zod) e novamente no domínio para invariantes (ex.: soma de ingredientes > 0).
- Faixas de validação padrão: peso 25 a 350 kg; altura 100 a 250 cm; gordura 2 a 70%; repetições 0 a 100; carga 0 a 1000 kg; RPE 1 a 10; RIR 0 a 10; sono 0 a 16 h; escalas subjetivas 1 a 5; quantidade de alimento > 0 e até 5000 g por item.
- Valores fora da faixa plausível mas válidos (ex.: 90 kg de variação de peso em um dia) geram aviso de confirmação, não erro.
- Erros inesperados: log com `request_id`, resposta 500 genérica, sem vazar stack.
- Falha da IA nunca bloqueia registro: o parser por texto cai para o parser por regras (ver 6.3) e depois para busca manual.

---

## PARTE 4. MODELO DE DADOS

Convenções: `id uuid` (v7) como PK; `user_id` em toda tabela de dados do usuário; `created_at`, `updated_at`; exclusão lógica (`deleted_at`) em registros de histórico; enums como tipos Postgres ou tabelas de referência. Tabelas de catálogo global (alimentos, exercícios) têm `user_id` nulo para itens do sistema e preenchido para itens personalizados.

### 4.1 Identidade e perfil

**users**: id, email (citext, único), password_hash, name, timezone (padrão `America/Sao_Paulo`), locale, created_at.

**sessions**: id, user_id, token_hash, expires_at, user_agent, ip, created_at.

**profiles** (1:1 com user): sex (`male|female`, usado apenas em fórmulas), birth_date, height_cm, training_experience (`beginner|intermediate|advanced`), training_age_years, conditioning_level (1 a 5), activity_lifestyle (`sedentary|light|moderate|high`), aesthetic_priorities (text[], ex.: `chest`, `shoulders`, `waist`), performance_priorities (text[], ex.: `sprint`, `endurance`, `strength`), notes.

**availability**: id, user_id, weekday (0 a 6), start_time, end_time, max_minutes, kind (`gym|sport|any`).

**equipment_access**: id, user_id, equipment_code (FK para `equipment`), location (`gym|home|other`).

**limitations**: id, user_id, body_region, description, severity (1 a 3), contraindicated_patterns (text[], ex.: `deep_knee_flexion`, `overhead_press`), active, started_at, resolved_at.

**exercise_preferences**: user_id, exercise_id, preference (`like|neutral|dislike|avoid`).

**goals** (versionado; nunca editar, sempre inserir novo): id, user_id, primary_goal (`fat_loss|maintenance|muscle_gain|recomposition|performance`), target_weight_kg, target_body_fat_pct, target_rate_pct_per_week, protein_g_per_kg (nulo = padrão), training_focus, effective_from, created_at.

**sports**: id, user_id, sport_code (`football|futsal|running|cycling|swimming|other`), weekly_frequency, typical_duration_min, typical_intensity (1 a 5), weekday_hint.

### 4.2 Corpo

**body_measurements**: id, user_id, measured_at, date, weight_kg, body_fat_pct, body_fat_method (`bioimpedance|skinfold|dexa|visual|other`), waist_cm, hip_cm, chest_cm, arm_l_cm, arm_r_cm, thigh_l_cm, thigh_r_cm, calf_cm, neck_cm, notes. Todos opcionais exceto data; ao menos um valor.

**progress_photos** (futuro, tabela criada vazia): id, user_id, date, pose, storage_key.

### 4.3 Treinamento

**equipment**: code (PK), name_pt.

**muscles**: code (PK), name_pt, group (`push|pull|legs|core`), region (`upper|lower|core`). Conjunto: chest, front_delts, side_delts, rear_delts, lats, upper_back, traps, biceps, triceps, forearms, abs, obliques, lower_back, glutes, quads, hamstrings, adductors, abductors, calves.

**exercises**: id, user_id (nulo = sistema), name_pt, aliases (text[]), movement_pattern (`horizontal_push|vertical_push|horizontal_pull|vertical_pull|squat|hinge|lunge|isolation_upper|isolation_lower|core|carry|cardio`), mechanics (`compound|isolation`), laterality (`bilateral|unilateral`), equipment_codes (text[]), load_type (`external|bodyweight|assisted|time`), default_increment_kg, contraindication_tags (text[]), instructions, is_active.

**exercise_muscles**: exercise_id, muscle_code, role (`primary|secondary`), weight (1.0 primário, 0.5 secundário). Usado para contabilizar volume por músculo.

**programs**: id, user_id, name, goal_snapshot, start_date, end_date, status (`draft|active|completed|archived`), generated_by (`rules|ai_assisted|manual`), notes.

**mesocycles**: id, program_id, order, name, phase (`accumulation|intensification|realization|deload`), weeks, start_date, rir_progression (int[], ex.: `{3,2,1,0}`), volume_progression (numeric[], multiplicador de séries por semana, ex.: `{1.0,1.1,1.2,0.5}`).

**workout_templates**: id, program_id, name (ex.: "Superior A"), day_order, focus_muscles (text[]), estimated_minutes.

**template_exercises**: id, workout_template_id, order, exercise_id, sets, rep_min, rep_max, target_rir, rest_seconds, superset_group, notes.

**planned_workouts** (a agenda concreta): id, user_id, date, workout_template_id, mesocycle_id, week_index, status (`planned|done|skipped|moved|adapted`), adaptation_reason, adapted_payload (jsonb com a versão ajustada).

**workout_sessions** (o que aconteceu): id, user_id, date, planned_workout_id (nulo se treino avulso), started_at, ended_at, duration_min, session_rpe (1 a 10), perceived_difficulty (1 a 5), notes, source (`app|offline_sync|import`).

**session_exercises**: id, session_id, order, exercise_id, planned_exercise_id (nulo se adicionado), substituted_from_exercise_id, status (`done|skipped|substituted`), skip_reason, notes.

**set_logs**: id, session_exercise_id, set_index, set_type (`warmup|working|drop|failure|backoff`), reps, load_kg, rir, rpe, rest_seconds, duration_seconds (isometria/tempo), completed, logged_at. Um de `rir` ou `rpe` basta; converter com RIR = 10 − RPE.

**pain_reports**: id, user_id, date, session_id (opcional), body_region, intensity (0 a 10), during_exercise_id (opcional), type (`joint|muscle|other`), notes.

**activities** (esportes e cardio): id, user_id, date, started_at, sport_code, duration_min, intensity_rpe (1 a 10), distance_km, avg_hr, kcal_reported, lower_body_demand (1 a 3, padrão derivado do esporte), notes, source (`manual|wearable`).

**personal_records**: id, user_id, exercise_id, record_type (`e1rm|max_load|rep_at_load|volume_session`), value, reps, load_kg, set_log_id, achieved_at. Recalculável a partir de `set_logs`.

### 4.4 Recuperação

**daily_checkins**: id, user_id, date (único por usuário), sleep_hours, sleep_quality (1 a 5), energy (1 a 5), stress (1 a 5, 5 = muito estressado), fatigue (1 a 5, 5 = muito cansado), soreness (1 a 5), soreness_regions (text[]), available_minutes, notes, readiness_score (calculado e persistido), created_at.

**training_load_daily** (materializada por job): user_id, date, load_au (soma de sRPE do dia), acute_7d, chronic_28d, acwr, monotony_7d, strain_7d.

### 4.5 Alimentos

**food_sources**: code (`taco|tbca|usda|off|user|recipe`), name, license_note.

**foods**: id, user_id (nulo = catálogo), source_code, source_ref, name_pt, name_normalized (sem acento, minúsculo; índice trigram), brand, category (`cereals|legumes|meats|poultry|fish|eggs|dairy|fruits|vegetables|tubers|fats_oils|sweets|beverages|supplements|prepared|other`), state (`raw|cooked|grilled|fried|boiled|roasted|ready`), default_unit (`g|ml`), density_g_per_ml (para líquidos), is_verified, barcode (futuro), created_at.

**food_nutrients** (por 100 g ou 100 ml): food_id (PK), kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, saturated_fat_g, sodium_mg, e demais campos opcionais (potassium_mg, calcium_mg, iron_mg, cholesterol_mg). Campos ausentes são `null`, nunca zero implícito.

**food_aliases**: id, food_id, alias_normalized (ex.: "peito de frango", "frango grelhado" → mesmo alimento; "arroz" → arroz branco cozido).

**household_measures**: id, food_id (nulo = medida genérica), user_id (nulo = sistema), unit_code (`unit|slice|tbsp|tsp|cup|scoop|ladle|portion|pinch|glass|can|small|medium|large`), label_pt (ex.: "colher de sopa cheia"), grams, is_default. Exemplos de seed: ovo inteiro 1 unidade = 50 g; pão francês 1 unidade = 50 g; arroz cozido 1 colher de sopa cheia = 25 g; feijão 1 concha média = 86 g; pão de forma 1 fatia = 25 g; banana prata 1 média = 70 g.

**user_food_usage**: user_id, food_id, times_used, last_used_at, last_quantity_g, last_unit_code. Usado para ranquear sugestões e desambiguar parsing.

### 4.6 Receitas

**recipes**: id, user_id, name, description, servings (padrão 1), cooked_weight_g (opcional; se informado, permite porção por peso), is_favorite, tags (text[]), instructions, created_at.

**recipe_ingredients**: id, recipe_id, food_id, quantity, unit_code, grams (resolvido), order.

**recipe_nutrition_cache**: recipe_id, total (jsonb com todos os nutrientes), per_serving (jsonb), per_100g (jsonb, se `cooked_weight_g`), computed_at. Recalculado sempre que ingredientes ou alimentos mudam.

Uma receita pode ser registrada como alimento: `foods` com `source_code = 'recipe'` e `source_ref = recipe_id`, permitindo usar a mesma busca e o mesmo registro.

### 4.7 Nutrição: metas, registros e planos

**nutrition_targets** (snapshot diário, recalculado por regra): id, user_id, date, day_type (`rest|training|hard_training|sport|sport_and_training`), kcal, protein_g, carbs_g, fat_g, fiber_g, water_ml, method (`formula|adaptive`), inputs (jsonb com os insumos usados no cálculo), goal_id, created_at. Único por (user_id, date).

**energy_estimates** (semanal): id, user_id, week_start, tdee_formula, tdee_observed, tdee_used, confidence (`low|medium|high`), weight_trend_kg, intake_avg_kcal, logged_days, weigh_in_count.

**meals**: id, user_id, date, slot (`breakfast|morning_snack|lunch|afternoon_snack|pre_workout|post_workout|dinner|supper|other`), status (`planned|logged`), eaten_at, name (opcional), notes, source_text (texto original digitado), created_at.

**meal_items**: id, meal_id, food_id, recipe_id (um dos dois), quantity, unit_code, grams, nutrients_snapshot (jsonb com os nutrientes calculados no momento), parse_confidence, created_at.

Planejado e realizado usam as mesmas tabelas. Uma refeição `planned` vira `logged` com um toque ("comi isso"), podendo editar antes. Os totais do dia separam consumido de planejado.

**meal_templates**: id, user_id, name (ex.: "Café padrão"), items (jsonb), slot_hint. Para repetir combinações frequentes.

**water_logs**: id, user_id, date, ml, logged_at.

### 4.8 Inteligência

**insights**: id, user_id, generated_at, period_start, period_end, category (`training|nutrition|body|recovery|integration`), type (código estável, ex.: `LOW_PROTEIN_STREAK`), severity (`info|attention|warning`), title_pt, body_pt, data (jsonb com os números que sustentam o insight), status (`new|seen|dismissed|acted`), expires_at.

**ai_conversations**: id, user_id, title, created_at, updated_at.

**ai_messages**: id, conversation_id, role (`user|assistant|tool`), content (jsonb), tool_calls (jsonb), tokens_in, tokens_out, model, created_at.

**ai_action_proposals**: id, user_id, conversation_id, action_type (`log_meal|plan_meal|swap_exercise|adapt_workout|update_goal|create_recipe`), payload (jsonb), status (`pending|accepted|rejected|expired`), created_at, resolved_at.

**parser_feedback**: id, user_id, input_text, parsed (jsonb), corrected (jsonb), created_at. Alimenta a avaliação e o ranqueamento.

### 4.9 Transversais

**events** (auditoria leve e base para integrações futuras): id, user_id, type (ex.: `meal.logged`, `session.completed`, `checkin.created`), entity_id, payload, created_at.

**integrations** (futuro, criada vazia): id, user_id, provider, status, scopes, last_sync_at.

**daily_context** (view materializada ou tabela atualizada por evento): user_id, date, day_type, planned_workout_id, session_id, activities_load, readiness_score, kcal_consumed, protein_consumed, targets_id. É a "fotografia do dia" consumida pelo dashboard e pela IA.

### 4.10 Índices obrigatórios

- `(user_id, date)` em todas as tabelas diárias.
- GIN trigram em `foods.name_normalized` e `food_aliases.alias_normalized`.
- `(user_id, exercise_id, logged_at)` para consultas de progressão (via join session_exercises).
- `(user_id, status, date)` em `meals` e `planned_workouts`.

---

## PARTE 5. REGRAS DE NEGÓCIO E CÁLCULOS: NUTRIÇÃO

Tudo nesta parte é implementado em `packages/core/nutrition` como funções puras, com testes unitários contendo casos numéricos fixos.

### 5.1 Gasto energético basal (TMB)

- **Mifflin-St Jeor** (padrão):
  - homens: `10 × peso_kg + 6,25 × altura_cm − 5 × idade + 5`
  - mulheres: `10 × peso_kg + 6,25 × altura_cm − 5 × idade − 161`
- **Katch-McArdle** quando houver percentual de gordura com método `dexa`, `skinfold` ou `bioimpedance` medido nos últimos 60 dias: `370 + 21,6 × massa_magra_kg`.
- Peso usado: tendência de peso (5.5), não a pesagem isolada do dia.

### 5.2 Gasto total (GET): estimativa inicial por fórmula

Separar estilo de vida e exercício para não contar o treino duas vezes:

```
GET_dia = TMB × fator_estilo_de_vida + kcal_exercicio_liquido_dia
```

- fator_estilo_de_vida (sem exercício): sedentary 1,20; light 1,35; moderate 1,50; high 1,65.
- kcal_exercicio_liquido = `(MET − 1) × peso_kg × horas`. Tabela padrão de MET (ajustável no core):
  - musculação: moderada 3,5; intensa 5,0 (derivar de session_rpe: ≤6 moderada, ≥7 intensa)
  - futebol/futsal: recreativo 7,0; competitivo 10,0 (derivar de intensity_rpe)
  - corrida: pela velocidade se houver distância e tempo (ex.: 10 km/h ≈ 9,8); senão 8,0
  - ciclismo moderado 6,8; natação moderada 5,8; caminhada 3,5
  - se `kcal_reported` de wearable existir no futuro, usar o menor entre reportado e MET × 1,1 (wearables superestimam)
- GET semanal base = média do GET estimado dos 7 dias da semana planejada.

### 5.3 GET adaptativo (a partir dos dados reais)

Critérios de ativação: ≥ 14 dias com registro alimentar "completo" (dia marcado como completo ou ≥ 3 refeições registradas), ≥ 10 pesagens no período e janela de até 28 dias.

```
GET_observado = ingestão_média_kcal − (Δ tendência_peso_kg × 7700) / dias
GET_usado = 0,7 × GET_observado + 0,3 × GET_anterior       (confiança média)
GET_usado = 0,85 × GET_observado + 0,15 × GET_anterior     (confiança alta: ≥ 21 dias, ≥ 18 pesagens)
```

- Recalculado semanalmente por job (segunda-feira, 04:00 no fuso do usuário).
- Variação máxima de ±150 kcal por semana na meta resultante.
- Guardar tudo em `energy_estimates` com os insumos. A interface mostra "estimativa baseada nos seus dados" com o nível de confiança.

### 5.4 Metas por objetivo

| Objetivo | Energia sobre GET | Ritmo alvo |
|---|---|---|
| fat_loss | −20% (faixa −15% a −25%) | 0,5% a 1,0% do peso por semana |
| maintenance | 0 | ±0,25%/semana |
| muscle_gain | +10% iniciante, +5% intermediário/avançado | 0,25% a 0,5%/semana (iniciante até 1%/mês) |
| recomposition | −5% a 0 | peso estável, cintura caindo, força subindo |
| performance | 0 a +5%, carboidrato alto | conforme calendário esportivo |

Se o usuário definir `target_rate_pct_per_week`, calcular o ajuste energético pelo ritmo (`peso × taxa × 7700 / 7`) e limitar pelas travas de 5.7.

### 5.5 Tendência de peso

- Média móvel exponencial: `tendência_t = tendência_{t−1} + 0,1 × (peso_t − tendência_{t−1})`.
- Dias sem pesagem: tendência mantida, sem interpolação de pesagens falsas.
- Exibir sempre peso bruto (pontos) e tendência (linha).

### 5.6 Macronutrientes

Ordem de cálculo: proteína, gordura, fibra, carboidrato (restante).

- **Proteína:** padrão 1,8 g/kg; 2,0 a 2,2 g/kg em fat_loss e recomposition. Se gordura corporal conhecida e acima de 25% (homens) ou 32% (mulheres), usar 2,4 g/kg de massa magra em vez de peso total. Constante entre tipos de dia.
- **Gordura:** 0,8 g/kg, com piso de 20% das kcal e mínimo absoluto de 0,6 g/kg.
- **Carboidrato:** `(kcal − proteína × 4 − gordura × 9) / 4`. Piso de 2 g/kg em dias de treino pesado ou esporte; se o piso não couber, reduzir gordura até o mínimo absoluto antes de violar.
- **Fibra:** 14 g por 1000 kcal, mínimo 25 g.
- **Água:** 35 ml/kg + 500 ml por hora de exercício registrado ou planejado.
- Fatores: 4 kcal/g proteína e carboidrato, 9 kcal/g gordura. Fibra não entra na conta de kcal do alvo (os alimentos já trazem kcal oficiais da tabela).

### 5.7 Travas de segurança (não negociáveis)

- kcal nunca abaixo da TMB e nunca abaixo de 1500 (homens) ou 1200 (mulheres).
- Déficit máximo de 25% do GET.
- Perda acima de 1% do peso por semana durante 2 semanas seguidas: insight `warning` sugerindo reduzir o déficit.
- O sistema não gera planos para gestação, doenças, transtornos alimentares ou uso de medicamentos; nesses casos, texto recomendando acompanhamento profissional.

### 5.8 Metas por tipo de dia

Tipo do dia é derivado automaticamente (usuário pode sobrescrever):

| day_type | Regra de derivação |
|---|---|
| rest | nenhum treino nem atividade planejada/realizada |
| training | musculação com session_rpe ≤ 7 ou planejada normal |
| hard_training | musculação com session_rpe ≥ 8, ou volume planejado ≥ 120% da média |
| sport | atividade esportiva sem musculação |
| sport_and_training | ambos |

Distribuição: a média semanal de kcal é preservada. Proteína fixa. Diferenças aplicadas em carboidrato:

- rest: −10% kcal (retirado de carboidrato)
- training: base
- hard_training: +5%
- sport e sport_and_training: kcal = base + kcal_exercicio_liquido do esporte, limitado a +25%
- rebalancear os demais dias da semana para manter a média, respeitando as travas.

Quando o plano da semana muda (ex.: futebol marcado de última hora), os `nutrition_targets` dos dias futuros da semana são recalculados. Dias passados nunca são recalculados.

### 5.9 Distribuição ao longo do dia (recomendação, não obrigação)

- Proteína: 0,3 a 0,5 g/kg por refeição, em 3 a 5 refeições.
- Carboidrato concentrado nas refeições pré e pós-treino/esporte em dias ativos.
- A interface mostra essa distribuição como guia no planejamento, sem bloquear nada.

---

## PARTE 6. REGISTRO ALIMENTAR

### 6.1 Entradas suportadas

- Texto livre: "200g de arroz, 150g de frango e 100g de feijão", "2 ovos e 1 pão francês com requeijão", "1 concha de feijão", "whey 1 scoop".
- Busca manual com autocompletar.
- Recentes e frequentes (um toque).
- Repetir refeição (de ontem, de um modelo, de uma refeição planejada).
- Receita salva.
- Futuro: foto, rótulo, código de barras (ver Parte 15).

### 6.2 Pipeline de interpretação de texto

1. **Normalização:** minúsculas, remoção de acento para busca (o texto original é preservado), números por extenso para dígitos ("duas" → 2, "meia" → 0,5), vírgula decimal.
2. **Extração estruturada (IA):** modelo rápido (ver 10.6) recebe o texto e devolve apenas JSON validado por Zod:
   ```json
   { "items": [ { "raw": "200g de arroz", "food_query": "arroz", "quantity": 200, "unit": "g", "preparation": null, "brand": null } ] }
   ```
   O modelo **não** retorna nutrientes, nunca. Só identifica itens, quantidades, unidades e preparo.
3. **Fallback por regras** (sem IA ou se a IA falhar): regex para `<número><unidade>? (de)? <alimento>` separado por vírgula, "e", "+", quebra de linha.
4. **Correspondência (matching):**
   - candidatos por similaridade trigram em `name_normalized` e `food_aliases`;
   - pontuação = similaridade × 0,6 + uso do usuário (`user_food_usage`) × 0,3 + verificado/fonte oficial × 0,1;
   - regra de estado padrão: grãos, massas, carnes, leguminosas e tubérculos assumem **cozido** salvo menção a "cru"; ovos sem preparo assumem "cozido"; "frango" sem corte assume peito grelhado;
   - confiança ≥ 0,75: seleciona automaticamente; entre 0,45 e 0,75: seleciona o melhor e mostra 3 alternativas no item; < 0,45: pede escolha ou cadastro rápido.
5. **Conversão de unidade para gramas:**
   - `g`: direto; `kg` × 1000; `ml` com densidade do alimento (padrão 1,0 se ausente, sinalizado);
   - medida caseira: procurar em `household_measures` do alimento, depois do usuário, depois genérica;
   - sem conversão possível: erro `UNIT_NOT_CONVERTIBLE` no item, com campo para o usuário informar os gramas uma vez; a medida é salva para ele e reaproveitada.
   - "unidade" sem tamanho: usar a medida `is_default` (normalmente média).
6. **Cálculo:** `nutriente = valor_por_100 × gramas / 100` para cada nutriente não nulo. Snapshot salvo em `meal_items.nutrients_snapshot`.
7. **Revisão:** a interface mostra os itens interpretados, editáveis inline (alimento, quantidade, unidade), com totais atualizados em tempo real. Um toque confirma.
8. **Aprendizado:** correções do usuário vão para `parser_feedback`, atualizam `user_food_usage` e, se ele trocar o alimento de um termo, criam um alias pessoal.

### 6.3 Alimento personalizado

Formulário mínimo: nome, porção de referência (g ou ml), kcal, proteína, carboidrato, gordura. Fibra, sódio e demais opcionais. Opção de cadastrar pela tabela nutricional do rótulo (valores por porção convertidos para 100 g). Opção de salvar medidas caseiras.

### 6.4 Banco de alimentos: carga inicial

1. **TACO** (Tabela Brasileira de Composição de Alimentos, NEPA/UNICAMP): base principal, alimentos in natura e preparados brasileiros.
2. **TBCA** (USP), se o acesso aos dados for viável: complementa com mais preparações.
3. **USDA FoodData Central** (domínio público): fallback para itens ausentes, traduzidos.
4. **Open Food Facts** (licença ODbL): industrializados, quando entrar código de barras.

O script de seed fica em `packages/db/seeds/foods/`, é idempotente, registra a fonte de cada item e respeita os termos de uso de cada base (registrar em `food_sources.license_note`). Criar seed manual de aliases e medidas caseiras dos 150 alimentos mais comuns no Brasil (arroz, feijão, frango, carne moída, ovo, pão francês, banana, aveia, whey, leite, iogurte, queijo, batata, mandioca, macarrão, azeite, café com açúcar, etc.).

---

## PARTE 7. RECEITAS E PLANEJAMENTO ALIMENTAR

### 7.1 Receitas

- Criação por texto ("500g frango, 100g creme de leite, 50g queijo, 10g azeite") usando o mesmo parser, ou item a item.
- Cálculo: total = soma dos ingredientes em peso cru/como informado. Por porção = total / servings.
- Se `cooked_weight_g` for informado: por 100 g preparado = total × 100 / cooked_weight_g, permitindo registrar "180g de frango cremoso".
- Registro de receita: por porção ("1 porção", "0,5 porção") ou por gramas (se houver peso cozido).
- Favoritar, duplicar, editar (edição não altera refeições já registradas, por causa do snapshot).

### 7.2 Sugestão de refeição pelos macros restantes

Entrada: kcal disponíveis, proteína mínima, limites de carboidrato e gordura, restrições (não gosto, sem cozinhar, horário).

Algoritmo determinístico em `packages/core/nutrition/suggest.ts`:

1. Pool de candidatos: receitas favoritas, refeições modelo, alimentos dos últimos 30 dias ranqueados por frequência. Não sugerir o que o usuário nunca comeu, salvo se pedir "algo novo".
2. Para combinações de 1 a 3 itens do pool, resolver quantidades por programação linear pequena (biblioteca `javascript-lp-solver` ou equivalente), minimizando o desvio das metas, com proteína como restrição dura e porções arredondadas para múltiplos práticos (10 g, 0,5 unidade).
3. Retornar as 3 melhores opções com totais e o que sobra no dia.
4. A IA pode reescrever a apresentação em linguagem natural, mas os números vêm do solver.

### 7.3 Planejamento do dia

- O usuário monta refeições com status `planned` por slot. A tela mostra, em tempo real (cálculo no cliente via `packages/core`): consumido, planejado, total previsto e restante, por kcal e cada macro.
- Barras com três camadas: consumido (cor cheia), planejado (hachurado), restante.
- Regras de alerta durante o planejamento:
  - item que faz o dia ultrapassar a meta de gordura, kcal ou carboidrato em mais de 10%: sugestão de substituição;
  - proteína prevista < 85% da meta: sugestão de complemento proteico;
  - fibra prevista < 70%: sugestão de fonte de fibra.
- **Motor de substituição:** para o item problemático, buscar no mesmo `category` (e no histórico do usuário) alternativas que reduzam o nutriente excedente mantendo kcal ±15% e proteína ≥ 90% do original. Ex.: "Essa refeição passa a meta de gordura em 18 g. Trocar 50 g de queijo muçarela por 50 g de queijo cottage reduz 9 g de gordura e mantém a proteína."
- Copiar plano de um dia para outro; salvar dia como modelo.
- Futuro: plano semanal e lista de compras derivada (Parte 15).

---

## PARTE 8. REGRAS DE NEGÓCIO E CÁLCULOS: TREINAMENTO E RECUPERAÇÃO

Implementado em `packages/core/training` e `packages/core/recovery`.

### 8.1 Métricas por série e por exercício

- **e1RM (Epley):** `carga × (1 + reps / 30)`, somente para séries `working` com 1 a 12 repetições. Com RIR informado, usar reps efetivas = reps + RIR (limitado a 12).
- **Tonelagem:** Σ (carga × reps) das séries working.
- **Série dura (hard set):** série working com RIR ≤ 3 (ou RPE ≥ 7). Sem RIR/RPE, conta como dura por padrão.
- **Volume por músculo:** Σ séries duras × peso do músculo no exercício (1,0 primário, 0,5 secundário), por semana (segunda a domingo, fuso do usuário).
- **Frequência por músculo:** número de dias na semana com ≥ 2 séries duras ponderadas para o músculo.
- **Recordes:** e1RM, maior carga, maior número de reps em uma carga, maior tonelagem em sessão. Detectados ao salvar a série; celebração discreta na interface.

### 8.2 Faixas de volume semanal (padrão configurável por músculo)

| Referência | Séries duras/semana |
|---|---|
| Mínimo efetivo (MEV) | 8 |
| Faixa produtiva | 10 a 20 |
| Máximo recuperável (MRV) | 22 |

Músculos de prioridade estética recebem alvo no terço superior da faixa. Músculos com limitação ativa recebem alvo reduzido. Panturrilha e abdômen podem ficar abaixo do MEV sem alerta, salvo se forem prioridade.

### 8.3 Progressão dupla (regra padrão)

Para cada exercício do plano, com faixa `rep_min..rep_max` e `target_rir`:

1. Todas as séries working atingiram `rep_max` com RIR ≥ target_rir − 1: **aumentar carga** na próxima exposição. Incremento: `default_increment_kg` do exercício; padrão 2,5 kg compostos de membros superiores, 5 kg compostos de membros inferiores, 1 a 2 kg isolados (menor incremento disponível no equipamento). Reps voltam para `rep_min`.
2. Dentro da faixa: **manter carga e buscar +1 rep** em pelo menos uma série.
3. Abaixo de `rep_min` em 2 exposições seguidas: **reduzir carga 5% a 10%**.
4. Sessão marcada como "adaptada" por baixa prontidão: não conta para as regras 1 a 3.

A próxima sessão exibe a meta de cada série ("80 kg × 9 a 10") e os valores da última vez como referência visual (valores fantasma).

### 8.4 Estagnação e troca de exercício

- **Estagnado:** melhor e1RM das últimas 4 exposições não supera o da exposição anterior a elas em ≥ 1%, ou 21 dias sem progresso.
- Ações sugeridas, em ordem: mudar faixa de repetições (ex.: 6 a 8 → 10 a 12); trocar por variação do mesmo padrão de movimento e músculo primário, respeitando equipamento, preferências e limitações; avaliar deload se houver estagnação generalizada.
- **Queda de desempenho:** e1RM da sessão ≥ 5% abaixo da média das 3 exposições anteriores em 2 ou mais exercícios na mesma semana.

### 8.5 Carga interna e prontidão

- **Carga da sessão (sRPE):** `session_rpe × duração_min`, para musculação e para esportes (usando `intensity_rpe`). Unidade arbitrária (UA).
- **Aguda:** soma dos últimos 7 dias. **Crônica:** média semanal dos últimos 28 dias (EWMA).
- **ACWR** = aguda / crônica. Acima de 1,5: alerta de pico de carga. Abaixo de 0,8 por 2 semanas: insight de destreino.
- **Monotonia (Foster)** = média diária / desvio padrão diário na semana; **Strain** = carga semanal × monotonia. Monotonia > 2,0 gera insight.
- **Prontidão (0 a 100)**, a partir do check-in:
  - sono 30%: `min(horas / meta_sono, 1) × 0,6 + (qualidade − 1)/4 × 0,4` (meta padrão 8 h)
  - disposição 20%: `(energy − 1)/4`
  - fadiga 20%: `(5 − fatigue)/4`
  - dor muscular 15%: `(5 − soreness)/4`
  - estresse 15%: `(5 − stress)/4`
  - ajuste: −10 pontos se ACWR > 1,5; −10 se houve atividade com `lower_body_demand = 3` e intensity_rpe ≥ 7 nas últimas 24 h (aplicado só para sessões com foco em membros inferiores)
  - sem check-in: prontidão "desconhecida", plano segue normal.

### 8.6 Adaptação do treino do dia

| Prontidão | Ação padrão |
|---|---|
| ≥ 70 (verde) | Plano normal |
| 50 a 69 (amarelo) | Volume −25% (remove última série dos exercícios), target RIR +1, sem tentativa de recorde |
| < 50 (vermelho) | Sessão leve (50% do volume, RIR 4) ou mobilidade/descanso; usuário escolhe |

Regras contextuais adicionais:

- **Esporte intenso nas últimas 24 h** (futebol, futsal, corrida intensa): em sessão de membros inferiores, reduzir volume de quadríceps, posteriores e glúteos em 30% a 50% e evitar hinge pesado; alternativa sugerida: trocar a ordem com a próxima sessão de membros superiores da semana.
- **Esporte planejado nas próximas 24 h:** evitar sessão pesada de membros inferiores no dia anterior.
- **Dor registrada:** exercício ligado à região dolorida com intensidade ≥ 4 é marcado para substituição; dor ≥ 7, ou recorrente em 3 sessões, gera recomendação explícita de avaliação profissional e bloqueia sugestões de progressão naquele exercício.
- **Tempo disponível menor que o estimado:** cortar isolados de menor prioridade primeiro, depois reduzir séries dos compostos; nunca remover o exercício principal da sessão.

Toda adaptação gera `planned_workouts.adapted_payload` e uma explicação curta ("Reduzi o volume de pernas porque você jogou futebol ontem com intensidade 8").

### 8.7 Geração de programa (motor de regras)

Entrada: perfil, objetivo, disponibilidade semanal, minutos por sessão, equipamentos, preferências, limitações, esportes fixos, prioridades.

1. **Divisão:** 2 a 3 dias: full body; 4 dias: superior/inferior; 5 dias: superior/inferior + push/pull/legs; 6 dias: push/pull/legs ×2. Esportes fixos contam como estímulo de membros inferiores e deslocam as sessões de pernas para longe deles.
2. **Número de exercícios por sessão:** `floor(minutos / 9)`, entre 4 e 8.
3. **Seleção:** para cada músculo, escolher exercícios por padrão de movimento, filtrando por equipamento disponível, removendo `avoid` e contraindicados pelas limitações, priorizando `like`. Compostos antes de isolados.
4. **Volume:** distribuir séries para atingir a faixa de 8.2 por músculo, respeitando o limite de tempo.
5. **Periodização padrão:** mesociclos de 5 semanas: 4 de acumulação com RIR 3, 2, 2, 1 e volume ×1,0 / 1,1 / 1,15 / 1,2, seguidas de 1 semana de deload (volume ×0,5, RIR 4). Programa típico: 3 mesociclos, com revisão ao fim de cada um.
6. **Deload antecipado:** sugerido se houver queda de desempenho (8.4) + prontidão média < 60 na semana, ou ACWR > 1,5 por 2 semanas.
7. **Validador:** todo programa gerado (por regras, IA ou manual) passa por um validador que checa volume por músculo, tempo por sessão, conflitos com esportes e limitações. Violações aparecem como avisos.

A IA pode propor ajustes ao programa (ex.: trocar exercícios, rebalancear), mas a proposta sempre passa pelo validador e pela confirmação do usuário.

---

## PARTE 9. INTEGRAÇÃO TREINO + NUTRIÇÃO + RECUPERAÇÃO

O serviço `daily-context` produz, para qualquer data, um objeto único:

```ts
type DailyContext = {
  date: string;
  dayType: DayType;
  readiness: { score: number | null; band: 'green'|'yellow'|'red'|'unknown'; drivers: string[] };
  training: { planned?: PlannedWorkoutSummary; adapted?: Adaptation; done?: SessionSummary };
  activities: ActivitySummary[];
  load: { dayAU: number; acute7d: number; chronic28d: number; acwr: number | null };
  nutrition: { targets: Targets; consumed: Totals; planned: Totals; remaining: Totals; completeness: number };
  body: { weightTrendKg: number | null; lastWeighInDaysAgo: number | null };
  flags: ContextFlag[]; // ex.: LOW_PROTEIN_TODAY, SPORT_YESTERDAY, POOR_SLEEP, HIGH_ACWR
};
```

É a base da tela Hoje e o principal insumo da IA. Regras de integração obrigatórias:

- Mudança no treino ou atividade do dia recalcula `day_type` e os `nutrition_targets` dos dias futuros da semana.
- Dia de esporte registrado a posteriori (ex.: futebol registrado à noite) recalcula a meta do próprio dia se ele ainda não terminou.
- Proteína < 80% da meta em 3 dos últimos 5 dias com treino: insight.
- Ingestão média < 90% da meta em dias de treino pesado + queda de desempenho: insight de energia insuficiente.
- **Correlações** (motor de padrões): calcular Pearson entre séries diárias alinhadas (sono × desempenho do dia seguinte, carboidrato do dia anterior × tonelagem, kcal × prontidão, etc.). Só gerar insight com n ≥ 10 pares e |r| ≥ 0,4, e sempre redigido como associação, nunca como causa ("Nas semanas analisadas, seus treinos após noites com menos de 6 h tiveram, em média, 7% menos tonelagem").

---

## PARTE 10. CAMADA DE INTELIGÊNCIA

### 10.1 Princípio

Três camadas, cada uma com responsabilidade clara:

1. **Motor analítico (determinístico):** métricas, tendências, regras e correlações (Partes 5, 8, 9). Roda em jobs e sob demanda. Testado.
2. **Insights (determinístico):** regras que transformam métricas em mensagens curtas, armazenadas em `insights`. Não usam LLM. Exemplos de tipos: `LOW_PROTEIN_STREAK`, `MUSCLE_BELOW_MEV`, `EXERCISE_STAGNANT`, `PERFORMANCE_DROP`, `HIGH_ACWR`, `DETRAINING`, `WEIGHT_LOSS_TOO_FAST`, `WEIGHT_TREND_OFF_GOAL`, `LOW_CONSISTENCY`, `NEW_PR`, `SLEEP_PERFORMANCE_LINK`, `MISSED_WEIGH_INS`.
3. **Coach IA (LLM com ferramentas):** conversa, interpreta perguntas, chama ferramentas que consultam as camadas 1 e 2 e redige a resposta.

### 10.2 Ferramentas do Coach (tool use)

Leitura (execução automática):

| Ferramenta | Retorno |
|---|---|
| `get_profile_summary()` | perfil, objetivo vigente, limitações, preferências |
| `get_daily_context(date)` | DailyContext |
| `get_period_summary(start, end)` | treinos, aderência, volume por músculo, médias nutricionais, peso, prontidão |
| `get_exercise_progress(exercise, period)` | série de e1RM, carga, reps, recordes, status (progredindo/estagnado) |
| `get_muscle_volume(period)` | séries duras e frequência por músculo vs faixas |
| `get_nutrition_history(period)` | médias e aderência por macro, por tipo de dia |
| `get_body_trend(period)` | peso bruto, tendência, medidas, gordura |
| `get_recovery_history(period)` | check-ins, prontidão, carga, ACWR |
| `get_insights(status, period)` | insights ativos |
| `get_today_plan()` | treino do dia (original e adaptado) e refeições planejadas |
| `search_foods(query)` | alimentos do banco e do usuário |
| `suggest_meal(constraints)` | saída do solver de 7.2 |
| `compare_periods(a, b)` | diferenças entre dois períodos |

Escrita (sempre por proposta; nada é gravado sem confirmação):

| Ferramenta | Efeito |
|---|---|
| `propose_meal_log(items, slot)` | cria proposta de registro |
| `propose_meal_plan(items, slot, date)` | cria proposta de planejamento |
| `propose_workout_adaptation(date, changes)` | cria proposta validada pelo validador de 8.7 |
| `propose_exercise_swap(from, to, scope)` | cria proposta |
| `propose_goal_update(goal)` | cria proposta com o impacto recalculado nas metas |

A interface mostra cada proposta como um cartão com "Aplicar" e "Descartar".

### 10.3 System prompt do Coach (base, em `packages/ai/prompts/coach.ts`)

Requisitos do prompt que a IA de desenvolvimento deve escrever:

- Papel: treinador e assistente nutricional do usuário, direto, técnico, em português do Brasil.
- **Todo número citado vem de uma ferramenta**; se não houver dado, dizer que não há dado e sugerir o registro necessário.
- Sempre mencionar o período analisado ("nos últimos 14 dias").
- Diferenciar fato (dado registrado), cálculo (motor) e sugestão.
- Correlação não é causa.
- Não diagnosticar; dor persistente, sintomas ou condições clínicas: recomendar profissional.
- Respeitar as travas da Parte 5.7 mesmo que o usuário peça o contrário.
- Respostas curtas por padrão (até ~150 palavras), com números-chave em destaque; detalhar só se pedido.
- Injetar no início da conversa um resumo compacto do perfil e do DailyContext de hoje (cerca de 500 tokens), para respostas rápidas sem ferramenta em perguntas simples.

### 10.4 Mapeamento das perguntas do usuário

| Pergunta | Ferramentas |
|---|---|
| Como foi minha semana? | get_period_summary, get_insights |
| Estou evoluindo nos treinos? | get_period_summary, get_exercise_progress (principais) |
| Qual músculo está ficando para trás? | get_muscle_volume, get_exercise_progress |
| Como está minha ingestão de proteína? | get_nutrition_history |
| Estou cumprindo minha meta calórica? | get_nutrition_history, get_body_trend |
| Como meu peso está evoluindo? | get_body_trend |
| O que eu deveria comer hoje? | get_daily_context, suggest_meal |
| Qual treino devo fazer hoje? | get_today_plan, get_daily_context |
| Como adaptar meu treino porque dormi mal? | get_daily_context, propose_workout_adaptation |
| O que posso comer para completar meus macros? | get_daily_context, suggest_meal |
| Quais exercícios tiveram maior evolução? | get_period_summary (ranking de Δe1RM) |
| Estou treinando X com frequência suficiente? | get_muscle_volume |
| Como está minha consistência? | get_period_summary (aderência) |
| Quais padrões aparecem nos meus dados? | get_insights (correlações) |

Criar uma suíte de avaliação com essas 14 perguntas sobre um usuário fictício com 90 dias de dados sintéticos (seed `demo`), checando que a resposta usa as ferramentas certas e não contém números ausentes dos retornos.

### 10.5 Resumos automáticos

- Resumo semanal (segunda de manhã): gerado pelo LLM a partir de `get_period_summary` e insights da semana; armazenado e exibido na tela Progresso.
- Nenhum outro uso de LLM em segundo plano sem necessidade clara (custo).

### 10.6 Modelos, custo e degradação

- Variáveis de ambiente: `AI_MODEL_CHAT` (padrão: modelo Sonnet mais recente disponível na API da Anthropic) e `AI_MODEL_FAST` (padrão: modelo Haiku mais recente), usados para conversa e para parsing/extração, respectivamente. Conferir os identificadores atuais na documentação da Anthropic ao implementar; nunca fixar no código.
- Streaming (SSE) nas respostas do chat.
- Registrar tokens por mensagem; limite diário configurável por usuário.
- Cache do resumo de perfil (prompt caching quando disponível).
- Sem chave ou com a API fora: registro por texto usa o parser por regras; chat mostra aviso; o resto do sistema funciona normalmente.

---

## PARTE 11. APIs (CONTRATO INICIAL)

Todos sob `/api/v1`, autenticados exceto `auth/register` e `auth/login`.

**Auth:** `POST auth/register`, `POST auth/login`, `POST auth/logout`, `GET auth/me`.

**Perfil:** `GET|PUT profile`, `GET|PUT availability`, `GET|PUT equipment`, `GET|POST|PATCH|DELETE limitations`, `GET|PUT exercise-preferences`, `GET goals` (histórico), `POST goals` (nova versão; retorna impacto nas metas), `GET|PUT sports`.

**Corpo:** `GET|POST body-measurements`, `PATCH|DELETE body-measurements/:id`, `GET body/trend?from&to`.

**Exercícios:** `GET exercises?q&muscle&equipment&pattern`, `POST exercises` (personalizado), `GET exercises/:id/progress?from&to`, `GET exercises/:id/alternatives`.

**Programas e plano:** `POST programs/generate` (motor de regras, retorna rascunho validado), `POST programs`, `GET programs/:id`, `PATCH programs/:id`, `POST programs/:id/activate`, `GET planned-workouts?from&to`, `PATCH planned-workouts/:id` (mover, pular), `GET planned-workouts/:id/adapted` (aplica prontidão e contexto).

**Sessões:** `POST sessions` (inicia, opcionalmente a partir de planned_workout), `GET sessions/:id`, `PATCH sessions/:id` (finaliza, RPE, notas), `POST sessions/:id/exercises`, `PATCH session-exercises/:id` (pular, substituir), `POST session-exercises/:id/sets`, `PATCH sets/:id`, `DELETE sets/:id`, `GET sessions?from&to`.

**Atividades e recuperação:** `GET|POST activities`, `PATCH|DELETE activities/:id`, `GET|PUT checkins/:date`, `POST pain-reports`, `GET recovery/load?from&to`.

**Alimentos:** `GET foods/search?q` (ranqueado para o usuário), `GET foods/:id`, `POST foods` (personalizado), `POST foods/:id/measures`, `POST nutrition/parse` (texto → itens interpretados, sem gravar).

**Refeições:** `GET meals?date`, `POST meals` (planned ou logged, com itens), `PATCH meals/:id`, `POST meals/:id/items`, `PATCH meal-items/:id`, `DELETE meal-items/:id`, `POST meals/:id/log` (planejada → consumida), `POST meals/copy` (de data/modelo para data), `GET|POST meal-templates`, `POST water-logs`.

**Receitas:** `GET|POST recipes`, `GET|PATCH|DELETE recipes/:id`, `POST recipes/:id/duplicate`, `POST nutrition/suggest-meal`, `POST nutrition/substitutions` (item + nutriente excedente → alternativas).

**Metas:** `GET nutrition/targets?from&to`, `PUT nutrition/targets/:date/day-type` (sobrescrita), `GET nutrition/energy-estimates`.

**Contexto e análise:** `GET daily-context/:date`, `GET analytics/summary?from&to`, `GET analytics/muscle-volume?from&to`, `GET analytics/compare?aFrom&aTo&bFrom&bTo`, `GET insights?status`, `PATCH insights/:id`.

**IA:** `POST ai/conversations`, `GET ai/conversations`, `POST ai/conversations/:id/messages` (SSE), `GET ai/proposals?status`, `POST ai/proposals/:id/accept`, `POST ai/proposals/:id/reject`.

**Conta:** `GET account/export`, `DELETE account`.

---

## PARTE 12. FRONT-END E EXPERIÊNCIA

### 12.1 Navegação

Mobile: barra inferior com **Hoje · Treino · Nutrição · Progresso · Coach**. Perfil acessível pelo avatar no topo. Botão flutuante de registro rápido em todas as telas com: Refeição, Série/Treino, Check-in, Peso, Atividade, Água.

Desktop: mesma arquitetura em barra lateral; Hoje em grade de cartões.

### 12.2 Tela Hoje ("O que eu preciso fazer hoje?")

Ordem fixa, de cima para baixo:

1. **Check-in** (se não feito): cartão compacto com 5 seletores de 1 a 5 e horas de sono; 10 segundos. Depois de feito, vira o indicador de prontidão (verde/amarelo/vermelho) com os fatores principais.
2. **Treino do dia:** nome, duração estimada, exercícios em lista curta, ajustes aplicados com motivo, botão "Começar". Em dia de descanso: "Descanso" + sugestão de atividade leve se aplicável.
3. **Nutrição do dia:** anel de kcal (consumido/meta) e barras de proteína, carboidrato, gordura e fibra com camada planejada; tipo do dia; campo de texto "O que você comeu?" direto no cartão.
4. **Próximas refeições planejadas** com "Comi isso".
5. **Um insight** relevante do dia (o de maior severidade não visto).

### 12.3 Treino ativo (tela crítica)

- Carrega o plano (adaptado, se houver) com os valores da última sessão como fantasma em cada série.
- Confirmar série = um toque (usa a meta/fantasma); ajuste de carga e reps por stepper (+/−) ou toque no número.
- RIR opcional por seletor rápido (0, 1, 2, 3, 4+), oculto por padrão se o usuário preferir.
- Cronômetro de descanso inicia automaticamente, com vibração ao fim.
- Ações por exercício: pular (motivo opcional), substituir (lista de alternativas ranqueadas), adicionar série, registrar dor.
- Adicionar exercício avulso por busca.
- Finalizar: duração automática, RPE da sessão (1 a 10), notas; tela de resumo com recordes e volume.
- **Offline obrigatório:** a sessão inteira funciona sem rede; tudo entra numa fila em IndexedDB com `Idempotency-Key` e sincroniza ao reconectar. Estado da sessão sobrevive a fechar o app.

### 12.4 Registro alimentar

- Campo único de texto com envio; resultado aparece como lista editável com totais; confirmar grava.
- Abaixo: chips de recentes e frequentes; "Repetir ontem" por slot; receitas favoritas.
- Slot sugerido automaticamente pela hora (editável).
- Estados de confiança visíveis: item confirmado, item com alternativas, item não encontrado (com "cadastrar rápido").

### 12.5 Planejamento

Tela do dia com slots. Cada slot aceita texto ou busca. Painel fixo no rodapé com restante do dia (kcal e macros) que muda em tempo real enquanto o usuário edita. Alertas e sugestões de substituição aparecem inline no item que causou o excesso.

### 12.6 Progresso ("Como estou evoluindo?")

Seletor de período (4 semanas, 12 semanas, 6 meses, 1 ano, personalizado) e comparação entre períodos.

- **Corpo:** peso bruto + tendência; gordura; medidas; ritmo semanal vs alvo.
- **Força:** e1RM dos exercícios principais; ranking de maior evolução; lista de estagnados.
- **Volume:** mapa corporal (SVG) colorido por séries duras/semana vs faixas; barras por músculo.
- **Consistência:** calendário de treinos e dias com registro alimentar completo; aderência a metas.
- **Nutrição:** médias de kcal e macros por tipo de dia; proteína diária vs meta.
- **Recuperação:** sono, prontidão, carga aguda/crônica e ACWR.
- **Resumo semanal** do Coach.

### 12.7 Direção visual

- Premium e contido: fundo neutro, uma cor de destaque, tipografia com números tabulares e grandes para métricas.
- Tema claro e escuro.
- Nada de ilustrações decorativas, gamificação infantil ou confete. Recorde tem destaque discreto.
- Densidade de informação alta no desktop, foco em uma ação por vez no mobile.
- Acessibilidade: contraste AA, alvos de toque ≥ 44 px, navegação por teclado no desktop, rótulos em todos os controles.
- Responsividade: mobile-first a partir de 360 px; breakpoints em 640, 1024, 1280.
- Estados vazios que ensinam o próximo passo ("Registre seu peso 3 vezes por semana para ver a tendência").
- Carregamento com skeletons; atualização otimista em todos os registros.

---

## PARTE 13. ESTRATÉGIA DE TESTES

| Nível | Ferramenta | Escopo e meta |
|---|---|---|
| Unitário | Vitest | `packages/core`: 100% das funções de cálculo com casos numéricos conferidos à mão (TMB, GET, adaptativo, macros, travas, tipo de dia, e1RM, volume, progressão, estagnação, ACWR, prontidão, adaptação, solver) |
| Unitário | Vitest | Conversão de unidades e parser por regras: tabela de ≥ 60 frases |
| Integração | Vitest + Testcontainers (Postgres real) | Cada rota: sucesso, validação, 404, isolamento entre usuários |
| E2E | Playwright | Fluxos críticos: cadastro e onboarding; registrar refeição por texto; planejar dia e converter em consumido; executar treino completo (inclusive offline simulado); check-in adaptando treino; receita registrada por porção |
| Avaliação IA | Script em `packages/ai/evals` | Parser: 100 frases reais com gabarito, acurácia de item ≥ 90% e de quantidade ≥ 95%. Coach: 14 perguntas da 10.4 sobre o seed demo, sem números inventados |
| Regressão | CI (GitHub Actions) | typecheck, lint, unit, integração e E2E a cada push na main |

Regras: todo bug corrigido ganha um teste que o reproduz. Mudança em fórmula exige atualização explícita do caso de teste com justificativa no commit.

---

## PARTE 14. ORGANIZAÇÃO DO CÓDIGO E CONVENÇÕES

- ESLint + Prettier + `typescript-eslint` estrito; import ordenado; sem `console.log` fora de scripts.
- Nomes: arquivos `kebab-case`, componentes `PascalCase`, funções `camelCase`, tabelas `snake_case` plural.
- Front organizado por feature (`features/nutrition/…`), cada uma com `components/`, `hooks/`, `api.ts`.
- Nada de lógica de negócio em componente React: componentes chamam hooks, hooks chamam API ou `packages/core`.
- Commits no padrão Conventional Commits (`feat(nutrition): parse household measures`).
- Branch por fase (`phase/02-training`), merge na main ao fim da fase com tudo verde.
- Migrations sempre geradas pelo drizzle-kit e revisadas; nunca editar migration já aplicada.
- Seeds idempotentes: `pnpm db:seed` (catálogos) e `pnpm db:seed:demo` (usuário demo com 90 dias de dados sintéticos realistas, essencial para testar dashboard e IA).
- Feature flags simples por variável de ambiente para funcionalidades em construção.

---

## PARTE 15. ROADMAP POR FASES

Cada fase termina com o **Definition of Done (DoD)** atendido, `PROGRESS.md` atualizado, commit e merge. Nenhuma fase começa com a anterior quebrada.

### Fase 0. Fundação (primeira sessão)
Monorepo, Docker Compose com Postgres, Fastify com health check, Next.js com layout e navegação, Drizzle configurado, pipeline de erros, logger, CI, `packages/core` e `packages/schemas` com um teste exemplo, auth completa (cadastro, login, sessão, logout).
**DoD:** `pnpm dev` sobe tudo; cadastro e login funcionam no navegador; CI verde.

### Fase 1. Perfil, objetivos e corpo
Onboarding em etapas curtas (dados básicos, objetivo, rotina e disponibilidade, equipamentos, limitações, esportes). Registro de peso e medidas. Tendência de peso. Cálculos de TMB/GET/metas no core com testes.
**DoD:** usuário conclui onboarding em até 3 minutos e vê suas metas calculadas com explicação dos insumos.

### Fase 2. Nutrição núcleo (primeiro valor diário)
Seed TACO + aliases + medidas caseiras; busca; alimento personalizado; parser por texto (IA + fallback por regras); registro de refeições; metas diárias por tipo de dia (sem adaptativo ainda); tela Hoje com o cartão de nutrição; água.
**DoD:** "200g de arroz, 150g de frango e 100g de feijão" registrado em menos de 10 segundos com valores corretos conferidos contra a TACO.

### Fase 3. Treino núcleo
Seed de ~150 exercícios com mapeamento muscular; criação manual de programa e templates; tela de treino ativo com fantasmas, descanso, pular, substituir; offline com sincronização; histórico de sessões; métricas (e1RM, tonelagem, volume por músculo, recordes).
**DoD:** treino completo registrado no celular sem rede e sincronizado depois; progresso por exercício visível.

### Fase 4. Receitas e planejamento alimentar
Receitas com cálculo total, por porção e por 100 g; favoritas; refeições planejadas; simulação em tempo real; conversão planejada → consumida; modelos de refeição; motor de substituição; solver de sugestão por macros restantes.
**DoD:** planejar o dia inteiro, ver o restante mudar em tempo real e receber sugestão de ajuste quando ultrapassar gordura.

### Fase 5. Periodização, esportes e recuperação
Gerador de programa por regras + validador; mesociclos; agenda de planned_workouts; atividades esportivas; check-in; carga interna, ACWR, prontidão; adaptação automática do treino do dia; progressão dupla aplicada às metas das séries; registro de dor.
**DoD:** registrar futebol intenso ontem + noite ruim hoje produz um treino adaptado com explicação coerente.

### Fase 6. Integração e motor de insights
DailyContext completo; metas nutricionais reagindo ao plano da semana; GET adaptativo semanal; jobs pg-boss; insights determinísticos; correlações; tela Progresso completa com comparação de períodos; seed demo de 90 dias.
**DoD:** com o seed demo, a tela Progresso e os insights mostram informações corretas e úteis.

### Fase 7. Coach IA
Ferramentas, system prompt, conversas persistidas, streaming, propostas com aceitar/rejeitar, resumo semanal, avaliações.
**DoD:** as 14 perguntas da 10.4 respondidas com dados reais e sem números inventados na avaliação.

### Fase 8. Acabamento e deploy
PWA instalável, performance (LCP < 2,5 s no mobile), acessibilidade, exportação e exclusão de conta, deploy em produção com backup diário do banco.
**DoD:** uso diário real pelo dono por 2 semanas sem bloqueios.

### Fase 9 em diante (futuro, sem implementar agora)
Arquitetura já preparada via `integrations`, `events`, `progress_photos` e `activities.source`:
- App nativo (Expo/React Native) reaproveitando `packages/core` e `packages/schemas`, necessário para Apple HealthKit; Google Health Connect no Android.
- Wearables: passos, frequência cardíaca, calorias, sono (alimentando check-in e GET).
- Fotos de evolução com comparação lado a lado.
- Reconhecimento de alimentos por foto e leitura de rótulo (modelo de visão → mesmo pipeline de matching; números nunca do modelo).
- Código de barras (Open Food Facts).
- Plano semanal de refeições e lista de compras.
- Notificações e lembretes (check-in, pesagem, refeição), integração com calendário.
- Suplementos.
- Múltiplos perfis de treinamento, relatórios exportáveis, comparação avançada entre períodos.

---

## PARTE 16. PROTOCOLO DE EXECUÇÃO NO CLAUDE CODE

### 16.1 Ciclo de cada fase

1. `/clear` e ler `CLAUDE.md`, `docs/PROGRESS.md` e a seção da fase no `ROADMAP.md`.
2. Modo plan: plano curto (tarefas numeradas, arquivos afetados, migrations, testes). Aguardar aprovação.
3. Implementar em passos pequenos. Após cada passo: typecheck, lint, testes afetados. Commit.
4. Ao fim: suíte completa, E2E da fase, revisão pelo subagente revisor (16.3), correções.
5. Atualizar `PROGRESS.md` (feito, pendente, bugs conhecidos, próximos passos) e `DECISIONS.md` se houve decisão.
6. Merge na main.

### 16.2 Comandos customizados (`.claude/commands/`)

- `/fase <n>`: executa os passos 1 e 2 do ciclo para a fase n.
- `/revisar`: aciona a revisão (16.3) sobre o diff da branch atual.
- `/status`: resume `PROGRESS.md`, testes falhando e próximos passos.
- `/delta`: recebe um delta de especificação vindo do chat, atualiza os docs e cria ADR antes de qualquer código.

### 16.3 Revisão de código

Checklist aplicado a cada fase: isolamento por `user_id` em toda query; cálculo fora de `packages/core`; número vindo de LLM; ausência de testes para regra nova; tratamento de erro faltando; tipos `any`; componentes com lógica de negócio; migrations destrutivas; regressões de acessibilidade. O revisor lista problemas por severidade; os de severidade alta são corrigidos antes do merge.

### 16.4 Debugging

Reproduzir com teste primeiro; ler logs com `request_id`; corrigir a causa, não o sintoma; manter o teste. Se o mesmo erro persistir após duas tentativas, parar, descrever hipóteses em `PROGRESS.md` e propor abordagem diferente em vez de insistir.

### 16.5 Refatoração

Só com testes verdes antes e depois; em commit separado de mudança de comportamento; nunca misturada com feature nova.

### 16.6 Evolução sem quebrar

Novos recursos entram como módulo novo ou extensão de módulo; mudanças de schema são aditivas (colunas novas nulas, tabelas novas); mudança destrutiva exige migração em duas etapas e ADR. Contratos da API versionados: quebra de contrato só em `/api/v2`.

### 16.7 Quando voltar ao Claude chat

- Dúvida de produto ou de regra (ex.: "a meta de carboidrato em dia de futebol faz sentido?").
- Nova funcionalidade: pedir ao chat um **delta de especificação** no formato: objetivo, regras, dados afetados, telas, critérios de aceite. Levar ao Claude Code com `/delta`.
- Revisão independente de um diff grande ou de um print de tela.

---

## PARTE 17. ENTREGA DESTA PRIMEIRA SESSÃO

Ao terminar a primeira sessão, devem existir:

1. Os docs da Parte 0.2 gerados a partir deste documento.
2. `CLAUDE.md` na raiz.
3. Fase 0 implementada e com DoD atendido.
4. `PROGRESS.md` indicando "Próximo: Fase 1".

A pergunta que o sistema inteiro precisa responder, e que serve de critério para qualquer decisão em aberto:

> **Quem eu sou, quais são meus objetivos, como estou treinando, o que estou comendo, como estou me recuperando e o que devo fazer a seguir para continuar evoluindo?**
