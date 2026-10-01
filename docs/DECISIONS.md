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
- **Decisão:** uso do usuário normalizado como `min(1, vezes_usado / 10)`. Regra de estado padrão aplicada como penalidade × 0,8 na similaridade de itens crus de cereais, leguminosas, carnes, aves, peixes, tubérculos e ovos quando o texto não diz "cru"; aliases cobrem os padrões específicos ("frango" → peito grelhado). O parser por regras separa itens só por vírgula, ";", "+", quebra de linha e " e " (P6.2), não por "com". Similaridade de nome = média entre `similarity` e `word_similarity` (o alias exato vence nomes longos). Rebalanceamento semanal: a diferença para a média é repartida igualmente entre os 7 dias; cada dia respeita o piso max(TMB, 1500/1200), que prevalece sobre a média.

## ADR-029: Arredondamento dos valores da TACO
- **Status:** aceita
- **Contexto:** a conversão pública traz médias sem arredondar (ex.: 128,258 kcal); a TACO impressa publica 128 kcal. O DoD da Fase 2 confere valores contra a TACO.
- **Decisão:** o snapshot usa o arredondamento da tabela impressa: kcal e minerais em mg inteiros; macronutrientes, fibra, gordura saturada e ferro com 1 casa decimal.

## ADR-030: Campos extras no snapshot de refeições e metas
- **Status:** aceita
- **Contexto:** histórico imutável (P1.6) e sobrescrita do tipo de dia (P5.8).
- **Decisão:** `meal_items.food_name` guarda o nome do alimento no momento do registro (junto de `nutrients_snapshot`), para o histórico não depender do catálogo. `nutrition_targets.day_type_overridden` marca o tipo de dia escolhido pelo usuário, que recálculos preservam. `food_aliases.user_id` (nulo = sistema) permite aliases pessoais (P6.2 passo 8).

## ADR-031: Resumo do dia e limite de IA
- **Status:** aceita
- **Contexto:** a tela Hoje (P12.2) precisa de consumido × meta antes do DailyContext completo (Fase 6); P3.4 limita endpoints de IA.
- **Decisão:** `GET /nutrition/day-summary?date` devolve metas do dia, consumido, planejado, restante e água; será absorvido pelo `daily-context` na Fase 6. `POST /nutrition/parse` tem limite por usuário (`AI_RATE_LIMIT_MAX`, padrão 30/min). Unidade de medida caseira sem conversão responde 422 `UNIT_NOT_CONVERTIBLE` e aceita `grams` informado pelo usuário, que vira medida pessoal.

## ADR-032: Ajustes da revisão da Fase 2
- **Status:** aceita
- **Contexto:** revisão da Fase 2 (checklist 16.3). Com a fórmula da P6.2, um alimento exato e verificado sem histórico soma 0,70 e nunca chega à faixa "automática" (≥ 0,75) no primeiro uso.
- **Decisão:**
  - Termo idêntico a um alias curado (sistema) ou pessoal conta com o peso total de uso (0,3): preferência explícita. Os demais casos seguem a fórmula.
  - Gramas informados viram medida pessoal só quando a unidade caseira não converteria sem eles, e só depois de a refeição ser gravada.
  - Aprendizado: escolher um alimento para um termo sem sugestão também cria alias pessoal; trocar o alimento de um item conta como uso.
  - Dias passados sem snapshot são calculados para exibição, mas não gravados (não se cria histórico que não existiu).
  - `PUT nutrition/targets/:date/day-type` aceita `null` para voltar ao tipo automático.
  - Número por extenso só é convertido no início de um item ("queijo meia cura" fica como está).
  - `foods(source_code, source_ref)` passa a ter índice único; escritas de alias/medida pessoal em transação.
- **Consequências:** o piso de segurança diário continua prevalecendo sobre a média semanal (ADR-028), agora documentado em teste. Refeição planejada → consumida (`POST meals/:id/log`) entra na Fase 4 e registrará o uso nesse momento.

## ADR-033: Catálogo de exercícios próprio
- **Status:** aceita
- **Contexto:** P15 (Fase 3) pede ~150 exercícios com mapeamento muscular; não há fonte pública adotada no documento.
- **Decisão:** catálogo escrito para o projeto em `packages/db/seeds/exercises.ts`: nome, aliases, padrão de movimento, mecânica, lateralidade, equipamentos (códigos do catálogo `equipment`), tipo de carga, incremento padrão (2,5 kg compostos de membros superiores, 5 kg compostos de membros inferiores, 1 kg isolados, P8.3), tags de contraindicação e músculos primários (1,0) / secundários (0,5). Os 19 músculos da DATA_MODEL 4.3 também são seed. Seed idempotente pelo nome.

## ADR-034: Offline e idempotência
- **Status:** aceita (substitui a ADR-027)
- **Contexto:** P12.3 exige a sessão de treino inteira sem rede; P3.5 pede `Idempotency-Key`.
- **Decisão:** o cliente gera os IDs (UUID v7) de sessão, exercício da sessão e série; as criações aceitam `id` e são idempotentes por (usuário, id): repetir a mesma criação devolve o registro existente. Toda escrita do treino ativo entra numa fila local (IndexedDB) com `Idempotency-Key` igual ao id da operação e é reenviada em ordem ao reconectar. A API guarda respostas de POST com `Idempotency-Key` em `idempotency_keys` (usuário, chave) e as devolve em repetições. O estado da sessão ativa é persistido localmente e sobrevive a fechar o app. `source = 'offline_sync'` quando a sessão foi criada pela fila.

## ADR-035: Escopo do treino na Fase 3
- **Status:** aceita
- **Contexto:** a Fase 3 é o treino núcleo; periodização e adaptação são da Fase 5.
- **Decisão:** `workout_sessions.workout_template_id` (aditivo) liga a sessão ao template sem agenda. A meta de cada série é a faixa do template (`rep_min..rep_max`, `target_rir`); os fantasmas são os valores da última sessão com o mesmo exercício, por índice de série. Mesociclos, `planned_workouts`, progressão dupla aplicada às metas, registro de dor e adaptação por prontidão ficam para a Fase 5. Um programa `active` por usuário.

## ADR-036: Detalhes do treino ativo (API)
- **Status:** aceita (complementa ADR-034/035)
- **Contexto:** lacunas encontradas ao implementar a Fase 3.
- **Decisão:**
  - **Início exige rede:** `POST /sessions` cria os exercícios do template no servidor (ids do servidor) e devolve os fantasmas; daí em diante, séries, pular, finalizar e exercícios adicionados usam ids do cliente e funcionam offline. Substituir exige rede (a lista de alternativas vem da API).
  - **Snapshot na sessão:** `workout_sessions.name` e, em `session_exercises`, `exercise_name` e as metas (`target_sets`, `rep_min`, `rep_max`, `target_rir`, `rest_seconds`) são copiados no início; editar o template ou o exercício não altera o passado.
  - **Status `pending`:** `session_exercises.status` ganha `pending` (em andamento). Ao finalizar, pendentes com série concluída viram `done`, os demais `skipped`. `substituted` é final (feito com substituto). Substituir só é permitido antes de registrar séries.
  - **Recordes:** comparados com sessões que começaram antes e com as séries anteriores da mesma sessão; sem sessão anterior do exercício, não há recorde (primeira exposição é referência). Tonelagem da sessão é recalculada a cada finalização (idempotente).
  - **Programa ativo:** ativar outro programa arquiva o anterior.
  - **Contraindicações:** as tags de `limitations.contraindicated_patterns` são comparadas com as tags de contraindicação do exercício e com o seu padrão de movimento.
  - **Id repetido de outro usuário:** 409 `BAD_REQUEST`, sem revelar o registro.

## ADR-037: Correções da revisão da Fase 3
- **Status:** aceita (complementa ADR-034/036)
- **Contexto:** a revisão 16.3 encontrou perda de operações na fila offline e recordes que não se corrigiam.
- **Decisão:**
  - **Fila:** toda alteração é ler → alterar → gravar no IndexedDB sob Web Locks (`atlas-queue`); o envio remove a operação pelo id; um só envio por vez entre abas (`atlas-flush`, `ifAvailable`). DELETE com 404 e respostas 409 contam como já aplicadas; demais 4xx são descartados com aviso (`lastError`, limpo no próximo envio aceito).
  - **Dados offline por usuário:** as chaves do IndexedDB levam o id do usuário (`setOfflineUser` ao carregar a sessão autenticada); trocar de conta no aparelho não mostra nem envia dados de outra pessoa.
  - **Recordes recalculáveis:** a cada série criada, editada ou apagada, ao finalizar e ao apagar uma sessão, os recordes do exercício são recalculados do histórico inteiro (`recordTimeline` no core), numa transação com trava consultiva por (usuário, exercício). Uma série só bate recorde se alguma sessão anterior teve série working concluída; na mesma sessão, a ordem é índice da série, horário e id.
  - **Ativação de programa:** trava consultiva por usuário na transação, evitando violar o índice de programa ativo único.
  - **Substituição:** voltar ao exercício original desfaz a substituição; retomar um exercício substituído mantém `substituted`.
  - **Treino em andamento:** só a sessão iniciada no aparelho vira o ponteiro de "em andamento"; abrir outra pelo histórico não o troca.

## ADR-038: Receita como alimento
- **Status:** aceita
- **Contexto:** P4.6 permite registrar receita como alimento; P7.1 pede porção e 100 g preparado.
- **Decisão:** cada receita mantém um `foods` do usuário (`source_code = 'recipe'`, `source_ref = recipe_id`). Nutrientes por 100 g = total × 100 / peso cozido (se informado) ou / soma dos pesos dos ingredientes; medida `portion` = peso da receita / porções. A mesma busca, o parser e o snapshot das refeições servem para receitas. Editar a receita recalcula esse alimento e o `recipe_nutrition_cache`; refeições já registradas não mudam (snapshot). Excluir a receita é lógico e tira o alimento da busca.

## ADR-039: Solver de sugestão de refeição
- **Status:** aceita
- **Contexto:** P7.2 sugere `javascript-lp-solver` ou equivalente.
- **Decisão:** `javascript-lp-solver` (Unlicense, JS puro, sem rede) em `packages/core`. Para cada combinação de 1 a 3 itens do pool (máx. 12: receitas favoritas, modelos e alimentos dos últimos 30 dias por frequência), um LP maximiza kcal com kcal ≤ disponível, proteína ≥ mínima (dura), carboidrato e gordura ≤ limites e limites por item; depois arredonda para baixo em múltiplos práticos (10 g ou 0,5 porção), confere as restrições e ordena por kcal restante, depois por menos itens. O objetivo usa um atributo próprio (`obj`) porque a biblioteca não respeita uma restrição com o mesmo nome do objetivo. Não sugere alimento que o usuário nunca comeu.

## ADR-040: Modelos de refeição e de dia; regra de substituição
- **Status:** aceita
- **Contexto:** P7.3 pede copiar dia, salvar dia como modelo e motor de substituição; o exemplo da P7.3 (muçarela → cottage na mesma gramagem) contradiz "kcal ±15%".
- **Decisão:**
  - `meal_templates.items` (jsonb) guarda por item `slot`, alimento, quantidade, unidade e gramas; modelo de refeição tem `slot_hint`, modelo de dia não. `POST meals/copy` (origem = data ou modelo) cria refeições `planned` no destino, recalculando o snapshot com os alimentos atuais.
  - Substituição: candidatos da mesma categoria (histórico do usuário primeiro); mantém a gramagem ou aumenta até proteína ≥ 90% da original (múltiplos de 5 g); kcal não pode passar de +15% da original (reduzir é permitido, pois o objetivo é baixar o excedente); precisa reduzir o nutriente excedente; ordena pela redução.

## ADR-041: Substituição prioriza a mesma família de alimento
- **Status:** aceita (complementa ADR-040)
- **Contexto:** a categoria da TACO é ampla (laticínios inclui leite em pó); o motor sugeria leite em pó no lugar de queijo por reduzir mais gordura.
- **Decisão:** candidatos da mesma família (primeira parte do nome, "Queijo, ricota" → "queijo") vêm primeiro; dentro de cada grupo, maior redução do nutriente excedente; histórico do usuário desempata.

## ADR-042: Correções da revisão da Fase 4
- **Status:** aceita (complementa ADR-038 a ADR-041)
- **Contexto:** a revisão 16.3 não achou problemas altos; os médios pediam decisões.
- **Decisão:**
  - **Uso só do que foi comido:** trocar o alimento de um item planejado não conta uso; `POST meals/:id/log` só conta uso quando de fato muda o status (condicional `status = 'planned'`), então repetir ou correr não duplica.
  - **Receita dentro de receita:** permitida; editar uma receita recalcula em cascata as que a usam (P4.6). Ciclos (direto ou indireto) são recusados com `VALIDATION_ERROR`. Alimento de receita excluída não entra como ingrediente, na cópia nem no pool de sugestões. Ingrediente sem unidade usa a medida padrão (`unit`), como nas refeições.
  - **Consistência receita × alimento:** se a gravação da receita falhar, o alimento criado é desativado; se a receita for excluída durante uma edição, o alimento volta a ficar inativo e a API responde 404.
  - **Complementos (P7.3):** proteína < 85% ou fibra < 70% previstas geram `POST nutrition/complements`: alimentos com ≥ 10 g de proteína ou ≥ 3 g de fibra por 100 g, mais densos por kcal, histórico primeiro, gramas para cobrir o que falta (10 g, até 300 g). No painel, dentro de "Detalhes", para não cobrir a tela no celular.
  - **Sugestões:** o usuário escolhe a refeição de destino; itens entram na refeição planejada do slot, se houver. Limites padrão = `plannedRemaining` (core) e tamanhos do pool por `poolSizing` (core).
  - **Substituição:** o histórico do usuário na categoria entra sempre nos candidatos, além do catálogo (ordenado por verificado e nome).

## ADR-043: Agenda e mesociclos
- **Status:** aceita
- **Contexto:** P8.7 define periodização padrão; DATA_MODEL 4.3 prevê `mesocycles` e `planned_workouts`.
- **Decisão:** ativar um programa (gerado ou manual) cria 3 mesociclos padrão de 5 semanas (RIR 3/2/2/1 e deload RIR 4; volume ×1,0/1,1/1,15/1,2/0,5) e materializa `planned_workouts` desde a data de ativação até o fim do programa. Templates são distribuídos nos dias de academia da disponibilidade, em ordem; sessões com pernas são afastadas dos dias vizinhos aos esportes fixos quando possível. Sem disponibilidade de academia, não há agenda (treino livre continua). Ativar outro programa remove os planejados futuros do anterior. Mover/pular por `PATCH planned-workouts/:id`.

## ADR-044: Carga interna e prontidão sob demanda
- **Status:** aceita
- **Contexto:** DATA_MODEL 4.4 prevê `training_load_daily` por job; não há jobs ainda.
- **Decisão:** carga do dia (sRPE de sessões e atividades), aguda (soma de 7 dias), crônica (EWMA diária com N = 28, × 7 para equivaler a uma semana), ACWR, monotonia e strain são calculados no core sob demanda, como as metas (ADR-015). A tabela e o job ficam para a Fase 6 (pg-boss junto com os insights). A prontidão é calculada e persistida ao salvar o check-in.

## ADR-045: Adaptação do treino do dia
- **Status:** aceita
- **Contexto:** P8.6.
- **Decisão:** `GET planned-workouts/:id/adapted` aplica no core a prontidão (amarelo: −1 série por exercício, RIR +1, sem tentativa de recorde; vermelho: metade das séries e RIR 4) e o contexto: esporte intenso nas últimas 24 h (RPE ≥ 7 com demanda de pernas 3, ou futebol/futsal/corrida com RPE ≥ 7) em sessão com pernas reduz 40% as séries de quadríceps, posteriores e glúteos e retira hinge composto; esporte nas próximas 24 h reduz 30% as séries de pernas; dor; tempo disponível (corta isolados do fim, depois séries de compostos, nunca o primeiro exercício). A explicação é montada por regras em pt-BR (sem LLM). Iniciar a sessão a partir do plano grava `adapted_payload` e `status = 'adapted'` quando houve mudança; sessões adaptadas não contam para a progressão dupla.

## ADR-046: Registro de dor e regiões
- **Status:** aceita
- **Contexto:** P8.6 liga dor a exercícios; DATA_MODEL 4.3 tem `body_region` livre.
- **Decisão:** regiões fixas (`shoulder`, `elbow`, `wrist`, `lower_back`, `hip`, `knee`, `ankle`, `neck`, `other`), cada uma ligada a músculos e tags de contraindicação do catálogo. Dor ≥ 4 nos últimos 7 dias marca exercícios ligados para substituição; ≥ 7, ou registrada em 3 sessões diferentes, gera recomendação de avaliação profissional e bloqueia a progressão (mantém a carga) naquele exercício.

## ADR-047: Correções da revisão da Fase 5
- **Status:** aceita (complementa ADR-043 a ADR-046)
- **Contexto:** a revisão 16.3 achou perda de histórico da agenda, IDOR no registro de dor e divergências com a P8.3/P8.5.
- **Decisão:**
  - **Histórico da agenda imutável:** `planned_workouts` guarda `program_id` e `template_name` em snapshot; template e mesociclo viram `ON DELETE SET NULL` (migration 0010, com preenchimento dos dados existentes acrescentado antes de aplicar). Reativar o programa já ativo não refaz a agenda; editar os templates do programa ativo refaz só os planejados futuros ainda não feitos. Treino feito/adaptado não pode ser movido nem pulado.
  - **Rotação contínua:** templates seguem em ciclo pelas semanas (`planSchedule`), então programas com mais templates que dias de academia usam todos.
  - **Progressão dupla:** só a adaptação por baixa prontidão (amarelo/vermelho) marca a sessão como `adapted` e a tira da progressão (P8.3.4); dor, tempo ou esporte mudam o plano (planejado `adapted`), mas a sessão conta. Redução de carga escolhe o múltiplo do incremento mais próximo de −7,5% dentro de −5% a −10% (empate: a redução menor); sem múltiplo na faixa, −7,5% exato.
  - **Sessão a partir do planejado:** iniciar de novo devolve a sessão já iniciada; apagar a sessão devolve o planejado a `planned`.
  - **Prontidão e carga:** o ajuste de −10 por esporte de pernas olha só a atividade de ontem; a adaptação usa a data do treino agendado; a EWMA crônica começa em zero e o ACWR só é definido com 28 dias de histórico (usuário novo não recebe alerta falso).
  - **Dor:** `sessionId` e `duringExerciseId` precisam ser do usuário (404); violação de chave estrangeira vira 400 `BAD_REQUEST`, nunca 500.

## ADR-048: Tipo do dia pelo plano real
- **Status:** aceita (complementa ADR-026)
- **Contexto:** P9 pede que mudar o treino ou registrar uma atividade recalcule o tipo do dia e as metas dos dias futuros da semana; até a Fase 5 o tipo vinha só da disponibilidade.
- **Decisão:**
  - Academia no dia: sessão feita ou treino agendado (`planned_workouts` não pulado). Sessão com RPE ≥ 8 ou treino agendado em semana de RIR 1 → `hard_training`; sem RPE registrado ou RIR maior → `training`.
  - Esporte no dia: atividade registrada ou esporte fixo do perfil naquele dia da semana. As kcal do esporte usam a atividade registrada (RPE ≥ 7 conta como competitivo); sem registro, o esporte fixo.
  - Sem nenhum programa ativo com agenda, a disponibilidade de academia continua como fallback (comportamento anterior).
  - A sobrescrita manual continua valendo. Hoje e o futuro são recalculados a cada pedido (ADR-026), então mover um treino ou registrar futebol à noite muda a meta na hora; o passado mantém o snapshot.

## ADR-049: Jobs com pg-boss
- **Status:** aceita
- **Contexto:** P5.3 (GET semanal segunda 04:00 no fuso do usuário) e P10.1 (insights em jobs).
- **Decisão:** o worker roda no mesmo processo da API e é ligado por `JOBS_ENABLED=true` (desligado nos testes e por padrão no dev). Um job agendado de hora em hora percorre os usuários e processa só os que estão na hora local certa: GET adaptativo segunda às 04:00 e insights diários às 05:00. Os dois são idempotentes por (usuário, semana) e (usuário, dia). Um job diário apaga `idempotency_keys` com mais de 7 dias. `POST nutrition/energy-estimates/refresh` e `POST insights/refresh` rodam o mesmo código sob demanda, para testes e para o seed. A carga continua calculada sob demanda (ADR-044); a tabela `training_load_daily` fica adiada por não ser necessária.

## ADR-050: Insights determinísticos
- **Status:** aceita
- **Contexto:** P9, P10.1 e DATA_MODEL 4.8.
- **Decisão:**
  - As regras são funções puras em `packages/core/src/insights`. Recebem métricas já calculadas e devolvem candidatos com tipo estável, categoria, severidade, chave de deduplicação, título e texto em pt-BR, e os números em `data`. Nada passa por LLM.
  - Tipos: `LOW_PROTEIN_STREAK`, `MUSCLE_BELOW_MEV`, `EXERCISE_STAGNANT`, `PERFORMANCE_DROP`, `HIGH_ACWR`, `DETRAINING`, `HIGH_MONOTONY`, `WEIGHT_LOSS_TOO_FAST`, `WEIGHT_TREND_OFF_GOAL`, `LOW_CONSISTENCY`, `NEW_PR`, `MISSED_WEIGH_INS`, `LOW_ENERGY_HARD_DAYS`, `EARLY_DELOAD`, além das correlações (`SLEEP_PERFORMANCE_LINK`, `CARBS_TONNAGE_LINK`, `KCAL_READINESS_LINK`).
  - Correlações por Pearson entre séries diárias alinhadas; só geram insight com n ≥ 10 e |r| ≥ 0,4, e o texto descreve associação, nunca causa.
  - Deduplicação por (usuário, tipo, chave): se já existe um insight ativo (não expirado) com a mesma chave, ele é atualizado sem voltar o status para `new`; um insight dispensado não reaparece antes de expirar. A validade padrão é de 7 dias (`NEW_PR`: 3 dias).
  - Status `new`, `seen`, `dismissed` ou `acted`. A tela Hoje mostra o mais severo ainda `new`.

## ADR-051: Detalhes do GET adaptativo
- **Status:** aceita
- **Contexto:** P5.3 deixa em aberto o que é "dia marcado como completo", qual é o GET anterior e sobre o que vale o limite de ±150 kcal.
- **Decisão:**
  - Dia completo = 3 ou mais refeições registradas (não existe marcação manual de dia completo).
  - A janela é de até 28 dias terminando na véspera do cálculo. Δ tendência = tendência no último dia com pesagem − tendência no primeiro, com `dias` = distância entre esses dois dias.
  - GET anterior = o último `tdee_used` salvo; sem estimativa anterior, o GET por fórmula.
  - Confiança `low` quando os critérios não são atingidos: o GET usado continua o da fórmula.
  - O limite de ±150 kcal vale para o GET usado em relação ao anterior. Como o ajuste do objetivo é proporcional ao GET, a meta muda no máximo cerca de 150 kcal por semana.
  - As metas usam `tdee_used` da estimativa mais recente com confiança `medium` ou `high` (`method = 'adaptive'`), sempre passando pelas travas da P5.7.

## ADR-052: Seed demo na API
- **Status:** aceita
- **Contexto:** P10.4 e o DoD da Fase 6 pedem um usuário fictício com 90 dias de dados. Recordes, GET adaptativo e insights são calculados pelos serviços da API, e `packages/db` não pode depender de `apps/api`.
- **Decisão:**
  - O seed fica em `apps/api/src/demo/seed.ts`. `pnpm db:seed:demo` chama `apps/api/scripts/seed-demo.ts`.
  - `createServices(db)` monta os mesmos serviços do servidor, sem HTTP.
  - O usuário `demo@atlas.app` (senha `demo-atlas-2026`) é apagado e recriado a cada execução. Os dados são determinísticos, gerados por um LCG com semente fixa, e relativos a "hoje" no fuso de São Paulo:
    - perfil, objetivo de perda de gordura e disponibilidade seg/ter/qui/sáb;
    - futebol às quartas;
    - programa gerado pelo motor de regras;
    - agenda passada com faltas e uma pausa de 10 dias;
    - sessões com carga linear e RIR registrado constante;
    - pesagens com perda de cerca de 0,5% por semana;
    - refeições da TACO;
    - check-ins com cerca de 30% de noites curtas, nenhuma nas últimas 2 semanas.
  - Os dados são montados para gerar insights conhecidos: proteína baixa em 3 dos últimos 5 dias de treino, um exercício congelado (estagnado), recordes recentes e a correlação entre sono e tonelagem. Um teste de integração confere esses insights.
  - No fim, o seed recalcula os recordes, o GET adaptativo das 5 últimas semanas e os insights de hoje.

## ADR-053: Correções da revisão da Fase 6
- **Status:** aceita (complementa ADR-048 a ADR-051)
- **Contexto:** a revisão 16.3 encontrou dois problemas altos: dias de treino contados em dobro e um GET adaptativo vencido continuando em uso. Também apontou problemas médios na deduplicação dos insights, nos limites das regras e no worker.
- **Decisão:**
  - **Plano real:**
    - Um treino agendado só conta como academia de hoje em diante, e apenas se não foi pulado nem iniciado. A sessão conta no dia em que foi feita.
    - No passado, apenas sessões contam: treino perdido não é dia de treino.
  - **GET adaptativo em uso:**
    - Vale a estimativa mais recente de qualquer confiança: se ela for `low`, volta a fórmula.
    - Uma estimativa com mais de 21 dias deixa de valer, tanto para as metas quanto como base do limite de ±150 kcal.
  - **Insights:**
    - Chaves estáveis por tipo (`main`, `workouts`, `logging`, exercício ou recorde), o que evita duplicatas entre semanas e mantém o dispensado fora até expirar. `MUSCLE_BELOW_MEV` continua por semana.
    - Um insight ativo que a regra deixa de gerar expira no refresh.
    - Expirados há mais de 30 dias são apagados no job diário.
  - **Perda rápida:** cada trecho é normalizado por semana pelo intervalo real entre as pesagens (de 5 a 10 dias). Lacunas maiores não geram alerta.
  - **Cálculos movidos para o core:** desempenho relativo, evolução e quedas de e1RM, média semanal e completude do registro.
  - **Worker:**
    - O fuso de cada usuário é tratado dentro do `try`.
    - A partir das 04:00 locais, a semana sem estimativa é calculada, cobrindo uma execução perdida.
  - **Contexto e telas:**
    - O `daily-context` de outro dia não traz insight do topo.
    - O período personalizado é validado no cliente: datas completas, sem futuro, até 400 dias.

## ADR-054: Arquitetura do Coach
- **Status:** aceita
- **Contexto:** P10.2, P10.3 e P10.6 pedem um Coach com ferramentas sobre o motor, streaming, cache do resumo de perfil e modelos por variável de ambiente.
- **Decisão:**
  - **Laço de ferramentas:** manual, em `packages/ai/src/coach`, com cliente do SDK injetável (permite cliente falso nos testes, como no parser, ADR-025) e `messages.stream`.
  - **Rodadas:** até 6 rodadas de ferramentas por mensagem. Chamadas paralelas são executadas juntas e devolvidas numa única mensagem de `tool_result`. Erro de ferramenta volta com `is_error`.
  - **Modelo:** vem só de `AI_MODEL_CHAT`; o `.env.example` sugere `claude-sonnet-5-5` (chat) e `claude-haiku-4-5` (`AI_MODEL_FAST`). Sem `tool_choice` forçado; ferramentas com `strict: true` e esquema gerado do Zod.
  - **Prompt e cache:** system prompt fixo com `cache_control`, seguido de um bloco com o resumo do perfil e o DailyContext de hoje. O histórico da conversa é só acrescentado, nunca reescrito.
  - **Ferramentas:** as de leitura chamam os serviços da API sempre com o `userId` da sessão; o modelo nunca escolhe o usuário. As de escrita só criam `ai_action_proposals` (nada é gravado sem confirmação).

## ADR-055: Números ancorados nas ferramentas
- **Status:** aceita
- **Contexto:** "Nenhum número exibido ao usuário vem de LLM" (CLAUDE.md) e P10.4 ("sem números ausentes dos retornos").
- **Decisão:**
  - `groundedNumbers(texto, fontes)` no core extrai os números do texto em pt-BR (milhar com ponto, decimal com vírgula, sinal −, %, unidades, intervalos, datas dd/mm) e procura cada um nos números das fontes: retornos das ferramentas e contexto injetado.
  - **Tolerância:** arredondamento para a casa decimal exibida. Variações de unidade aceitas: fração ↔ % e g ↔ kg.
  - **Ignorados:** números da própria pergunta do usuário, ordinais e contagens de 0 a 10 (passos, "3 dias").
  - **Na avaliação:** qualquer número não ancorado reprova.
  - **No chat:** os não ancorados são gravados em `ai_messages.ungrounded` para auditoria.

## ADR-056: Propostas, resumo semanal, limite e degradação
- **Status:** aceita
- **Contexto:** P10.2 (escrita por proposta), P10.5 (resumo semanal) e P10.6 (limite diário e funcionamento sem chave).
- **Decisão:**
  - **Expiração:** proposta pendente expira em 24 h. `create_recipe` (que aparece só no modelo de dados) fica fora, porque a P10.2 não define ferramenta para ele.
  - **Aplicar** reusa os serviços, com as mesmas validações da interface:
    - refeição registrada ou planejada: `meals.create` com o texto/itens interpretados e os nutrientes do banco;
    - troca de exercício: `updateProgram`, passando pelo validador da P8.7;
    - adaptação do treino: o plano adaptado do dia, sempre recalculado pelo core e nunca pelo payload do modelo;
    - meta: `createGoal`, com o impacto recalculado ao criar a proposta.
  - **Resumo semanal:**
    - Gerado na segunda às 06:00 locais (mesmo job horário) a partir de `analytics.summary` da semana anterior e dos insights ativos.
    - O LLM redige, e o texto só é aceito se todos os números estiverem ancorados.
    - Sem chave, com erro ou com número solto, usa um resumo por modelo de texto determinístico.
    - Fica guardado em `weekly_summaries`.
  - **Limite:** tokens registrados por mensagem. O limite diário por usuário vem de `AI_DAILY_TOKEN_LIMIT` (padrão 200 mil); estourou, `429 AI_DAILY_LIMIT`.
  - **Sem chave/modelo:** `503 AI_UNAVAILABLE` no chat. A tela avisa e o resto do sistema funciona.
  - **E2E:** `AI_FAKE=true` liga um cliente roteirizado, recusado com `NODE_ENV=production`.
