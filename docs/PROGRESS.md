# PROGRESS: Atlas

## Fase atual
**Fase 8. Acabamento e deploy: implementada e validada localmente e no CI.** O DoD ("uso diário real pelo dono por 2 semanas sem bloqueios") depende do deploy no servidor do dono, seguindo `docs/DEPLOY.md`. A avaliação do Coach com o modelo real (DoD da Fase 7) continua pendente da `ANTHROPIC_API_KEY`.

## Feito
### Fase 0. Fundação
- Monorepo pnpm + Turborepo, TS estrito (~6.0, ADR-011), ESLint estrito, Prettier; Docker Compose com Postgres 16; `pnpm dev` = `db:up` → `db:migrate` → `db:seed` → api (:3001) + web (:3000).
- API Fastify 5 + Zod; pino com `request_id`; erros RFC 7807; helmet, CORS, checagem de `Origin`, rate limit; auth completa (argon2id, sessão por cookie, renovação deslizante).
- Web Next 16 + Tailwind 4; navegação inferior (mobile) e lateral (desktop); `/cadastro`, `/entrar`.
- CI GitHub Actions: typecheck, lint, format, testes, build, E2E.

### Fase 1. Perfil, objetivos e corpo
- **Core:** TMB (Mifflin-St Jeor, Katch-McArdle), GET por fórmula com exercício planejado, ajuste por objetivo e por ritmo, travas 5.7, macros/fibra/água, `computeTargets` com insumos; tendência de peso (EMA), idade, datas no fuso do usuário. Casos numéricos conferidos à mão (46 testes).
- **DB:** `profiles` (+ `clinical_condition`), `availability`, `equipment` (seed idempotente), `equipment_access`, `limitations`, `goals` (versionados), `sports`, `body_measurements` (exclusão lógica).
- **API:** `profile`, `availability`, `equipment`, `limitations`, `sports`, `goals` (POST devolve impacto nas metas), `body-measurements` (cursor, PATCH, DELETE lógico, aviso de variação incomum, sem datas futuras), `body/trend`, `nutrition/targets` (sob demanda, ADR-015; trava clínica, ADR-017). 47 testes de integração (sucesso, validação, 404, isolamento A × B, metas conferidas à mão).
- **Web:** onboarding em 6 etapas (dados básicos, objetivo, rotina, equipamentos, limitações, esportes) com tela "Suas metas" e "Como calculamos"; redirecionamento até completar (ADR-020); cartão de metas em Hoje e Nutrição; Progresso com registro de peso/medidas, gráfico (pesagens + tendência) e histórico; Perfil com resumo e "Editar dados e objetivo".
- **E2E:** onboarding → metas com explicação (kcal conferida à mão) → navegação → logout/login; trava clínica; registro de peso com confirmação de variação incomum.
- **Revisão (checklist 16.3):** 1 problema alto (PATCH de limitação reaplicava padrões) e 3 médios corrigidos com testes (ADR-022); baixos corrigidos ou registrados em `OPEN_QUESTIONS.md`.
- **DoD:** onboarding completo leva poucos segundos no fluxo automatizado (bem abaixo de 3 min para uma pessoa, com padrões sugeridos em cada etapa); metas visíveis com explicação dos insumos.

### Fase 2. Nutrição núcleo
- **Dados:** TACO 4ª ed. (591 itens, arredondamento da tabela impressa, ADR-023/029), 208 aliases e medidas caseiras (ADR-024); seed idempotente.
- **Core:** normalização de texto, parser por regras (tabela com 69 frases), conversão para gramas (g, kg, ml com densidade, medidas alimento → usuário → genérica), escala e soma de nutrientes preservando nulos, pontuação de correspondência (0,6/0,3/0,1; faixas 0,75/0,45), tipo de dia pelo plano e distribuição semanal P5.8, `computePortion`, `remainingTargets`, `suggestSlot`.
- **IA (`packages/ai`):** extração estruturada com Anthropic (modelo só por `AI_MODEL_FAST`), nunca nutrientes; fallback para regras sem chave, com erro, recusa ou timeout (ADR-025); `pnpm ai:eval` (20 frases com gabarito, 100% nas regras).
- **API:** busca ranqueada, alimento personalizado por rótulo, medidas pessoais, `nutrition/parse` (com limite de IA por usuário), refeições e itens com snapshot imutável, aprendizado (uso, alias pessoal, `parser_feedback`), água, resumo do dia, metas por tipo de dia persistidas e sobrescrevíveis (ADR-026/031/032). 64 testes de integração, incluindo o DoD numérico.
- **Web:** Hoje com anel de kcal, barras de macros (consumido/planejado), tipo do dia e "O que você comeu?" (lista editável com totais em tempo real e confirmação em 1 toque); Nutrição com tipo do dia, refeições, água, busca manual, cadastro rápido e média semanal.
- **E2E:** DoD em 2,8 s com os valores da TACO (570,5 kcal); recálculo em tempo real; busca, alimento personalizado e água.
- **Revisão (checklist 16.3):** sem problemas altos; médios e baixos corrigidos com testes (ADR-032).
- **DoD:** "200g de arroz, 150g de frango e 100g de feijão" registrado em menos de 10 s, valores conferidos contra a TACO.

### Fase 3. Treino núcleo
- **Dados:** 19 músculos e 157 exercícios de sistema com padrão de movimento, mecânica, equipamentos, tags de contraindicação e músculos primários (1,0) / secundários (0,5); seed idempotente (ADR-033).
- **Core:** e1RM de Epley com reps efetivas (reps + RIR ≤ 12), RIR ↔ RPE, série dura, tonelagem, resumo por sessão, volume semanal por músculo e frequência, faixas MEV/produtiva/MRV, recordes (e1RM, maior carga, reps na carga, tonelagem) com linha do tempo recalculável, fantasmas, ranking de alternativas, semana seg–dom. 164 testes no core.
- **API:** exercícios (busca por nome/alias e filtros, personalizados, alternativas por equipamento/limitações/preferências, progresso), preferências (ADR-019 cumprida), programas (criar, editar, ativar; um ativo), sessões (iniciar do template com fantasmas, finalizar, histórico, apagar), exercícios da sessão (adicionar, pular, substituir), séries com recordes, volume semanal por músculo; ids do cliente idempotentes e `Idempotency-Key` (ADR-034/036/037). 77 testes de integração.
- **Web:** Treino (programa ativo, construtor de programa, iniciar, treino livre, histórico); treino ativo com fantasmas, confirmação em 1 toque, steppers, RIR opcional, descanso com vibração, pular com motivo, substituir, adicionar série/exercício, finalizar com RPE e resumo; fila offline em IndexedDB por usuário com indicador de sincronização; Progresso com e1RM por exercício e volume da semana. Testes unitários da fila (Vitest).
- **E2E:** treino completo sem rede → sincroniza ao voltar → histórico (1.200 kg) e e1RM (80 kg) visíveis; treino livre com substituição.
- **Revisão (checklist 16.3):** 1 problema alto (fila perdia operações enfileiradas durante um envio) e 6 médios corrigidos com testes (ADR-037); baixos corrigidos ou registrados em `OPEN_QUESTIONS.md`.
- **DoD:** treino completo registrado no celular sem rede e sincronizado depois (`source = offline_sync`); progresso por exercício visível.

### Fase 4. Receitas e planejamento alimentar
- **Core:** nutrição de receita (total, porção, 100 g pelo peso pronto ou cru), alertas do planejamento (excesso > 10% em gordura/kcal/carboidrato apontando o item; proteína < 85%, fibra < 70%), motor de substituição (mesma família primeiro, proteína ≥ 90%, kcal ≤ +15%), complementos, restante previsto, solver de sugestão por LP (`javascript-lp-solver`, porções práticas) e tamanhos do pool. 178 testes no core.
- **DB:** `recipes`, `recipe_ingredients`, `recipe_nutrition_cache`, `meal_templates`, `foods.is_active` (migrations 0006–0007, aditivas).
- **API:** receitas (CRUD, duplicar, exclusão lógica; receita vira alimento com medida `porção`, ADR-038; cascata para receitas aninhadas), `POST meals/:id/log`, `POST meals/copy` (dia ou modelo), `meal-templates` (refeição ou dia), `nutrition/day-plan`, `nutrition/substitutions`, `nutrition/complements`, `nutrition/suggest-meal` (ADR-038 a 042). 83 testes de integração.
- **Web:** Planejar dia com restante recalculado a cada tecla (inclui rascunhos), barras em três camadas, alerta no item com trocas aplicáveis, registrar planejada, copiar dia, salvar/aplicar modelo, "O que comer?" e complementos; Receitas por texto (mesmo parser) com prévia total/porção/100 g, favoritar, duplicar, excluir com confirmação e registrar 1 porção.
- **E2E:** DoD (restante muda ao digitar; 300 g de muçarela passa a gordura → troca por 485 g de ricota → alerta some → registrar) e receita por texto registrada por porção (223 kcal).
- **Revisão (checklist 16.3):** sem problemas altos; 6 médios e a maior parte dos baixos corrigidos com testes (ADR-042).
- **Correção extra:** empate na busca entre alias curado e alias pessoal agora favorece o alimento que o usuário usa (bug latente da Fase 2).
- **DoD:** planejar o dia inteiro, ver o restante mudar em tempo real e receber sugestão de ajuste ao ultrapassar a gordura.

### Fase 5. Periodização, esportes e recuperação
- **Core:** prontidão (P8.5, com ajustes de ACWR e esporte de pernas), carga interna (sRPE, aguda, crônica EWMA, ACWR com 28 dias de histórico, monotonia, strain), progressão dupla e redução de carga dentro de 5–10%, estagnação e queda de desempenho, mesociclo padrão, agenda com rotação contínua dos templates e pernas longe dos esportes, gerador de programa (divisão, exercícios por sessão, seleção com equipamento/preferências/limitações, volume para a faixa produtiva), validador, adaptação do treino do dia com explicação por regras. 205 testes no core.
- **DB:** `mesocycles`, `planned_workouts` (snapshot de template/programa), `activities`, `daily_checkins`, `pain_reports`; `workout_sessions.planned_workout_id/adapted/adaptation_note` (migrations 0008–0010, aditivas).
- **API:** `POST programs/generate`, avisos do validador nos programas, agenda materializada ao ativar (histórico preservado), `planned-workouts` (listar, mover, pular, adaptado), `POST sessions` a partir do planejado (adaptação + metas), atividades, check-ins com prontidão persistida, registro de dor, `recovery/load` (ADR-043 a 047). 90 testes de integração.
- **Web:** Hoje com check-in de ~10 s e indicador de prontidão; treino do dia adaptado com motivos, escolha leve/descanso no vermelho e "Começar"; Treino com gerador de programa (prévia e avisos), agenda da semana e registro de atividade; treino ativo com meta da progressão e registro de dor (fila offline); Progresso com carga e ACWR.
- **E2E:** DoD (futebol RPE 8 ontem + noite ruim → prontidão 24, sessão leve, pernas reduzidas e terra fora, explicação citando sono e futebol, sessão iniciada já adaptada).
- **Revisão (checklist 16.3):** 3 problemas altos (histórico da agenda apagado ao reativar/editar o programa; IDOR e 500 no registro de dor) e 4 médios corrigidos com testes (ADR-047); baixos corrigidos.
- **DoD:** futebol intenso ontem + noite ruim hoje produz treino adaptado com explicação coerente.

### Fase 6. Integração e motor de insights
- **Core:** GET adaptativo (P5.3: critérios, GET observado, mistura 0,7/0,85, teto de ±150 kcal, confiança; ADR-051), metas com o GET adaptativo sob as travas 5.7; 14 regras de insight + correlações de Pearson (n ≥ 10, |r| ≥ 0,4, texto de associação; ADR-050); resumo de período e comparação A × B; sinais do dia; desempenho relativo, evolução de e1RM, MET de atividade registrada e hora local dos jobs (233 testes).
- **DB:** `energy_estimates` e `insights` (migration 0011, aditiva).
- **API:** tipo do dia pelo plano real (agenda, sessões e atividades; ADR-048/053), então mover treino ou registrar futebol muda a meta de hoje e da semana; `GET daily-context/:date`; `GET|POST nutrition/energy-estimates[/refresh]`; `GET insights?status`, `PATCH insights/:id`, `POST insights/refresh` (deduplicação, expiração, dispensado não volta antes de expirar); `GET analytics/summary` e `analytics/compare`; worker pg-boss com job horário por fuso, recuperação de semana perdida e limpezas (ADR-049, `JOBS_ENABLED`); serviços montados por `createServices` (101 testes de integração).
- **Seed demo:** `pnpm db:seed:demo` cria `demo@atlas.app` / `demo-atlas-2026` com 90 dias determinísticos que disparam proteína baixa, exercício estagnado, recordes e sono × tonelagem; GET adaptativo com confiança alta (ADR-052). CI roda o seed antes do E2E.
- **Web:** Hoje com tipo do dia, sinais e insight do dia (Entendi/Dispensar); Progresso completo com períodos (4/12 semanas, 6 meses, 1 ano, personalizado) e comparação com o período anterior, corpo e ritmo × alvo, força (ranking e estagnados), volume com mapa corporal em SVG, calendário de consistência, nutrição por tipo de dia, recuperação e lista de insights; Nutrição com "estimativa baseada nos seus dados" e confiança.
- **E2E:** DoD com o usuário demo: números do Progresso iguais aos da API (peso, ritmo, e1RM, volume, aderência, comparação), insights esperados e dispensa de insight; estimativa adaptativa na Nutrição (15 testes no total).
- **Revisão (checklist 16.3):** 2 problemas altos (treino iniciado em outro dia contado em dobro; GET adaptativo vencido em uso) e 5 médios (chaves de deduplicação semanais, perda rápida com lacunas, treino perdido como dia de treino, cálculos fora do core, robustez do worker) corrigidos com testes (ADR-053); baixos corrigidos (contexto de outro dia, validação do período, base vencida do teto, limpeza de expirados).
- **DoD:** com o seed demo, Progresso e insights mostram informações corretas e úteis.

### Fase 7. Coach IA
- **Core:** `groundedNumbers`, que confere cada número de um texto de IA contra as fontes. Lê números em pt-BR, com unidade colada ou separada, datas dd/mm, conversões só quando a unidade escrita pede e o arredondamento do `Intl` (ADR-055/057). 242 testes no core.
- **DB:** `ai_conversations`, `ai_messages` (blocos do turno, tokens, números não ancorados), `ai_action_proposals` e `weekly_summaries` (migration 0012).
- **`packages/ai`:**
  - System prompt (P10.3) e 18 ferramentas da P10.2 com esquema `strict` gerado do Zod.
  - Laço manual com streaming, ferramentas em paralelo, limite de rodadas, recusa, corte por `max_tokens` sem `tool_use` órfão e tokens contados mesmo em falha.
  - Cache do prompt e do contexto do dia; histórico com resultados antigos compactados.
  - Resumo semanal com fallback por modelo de texto.
  - Transporte roteirizado (`AI_FAKE`) para E2E e harness.
  - 18 testes.
- **API (`/ai/*`):**
  - Conversas persistidas; mensagem com resposta em SSE (eventos text, tool, proposal, notice, done, error).
  - Propostas com Aplicar/Descartar que passam pelos serviços e validadores: refeição registrada ou planejada, troca de exercício (validador P8.7), adaptação do treino (recalculada pelas regras) e objetivo (travas P5.7). Aplicar acontece uma vez só; propostas expiram em 24 h.
  - Proteções: 503 sem IA, limite diário de tokens, um turno por vez, limite por minuto, cancelamento ao fechar a aba.
  - Resumo semanal no job de segunda às 06:00 (ADR-054/056/057). 114 testes de integração.
- **Web:** tela Coach com conversas, resposta em streaming, status das ferramentas, cartões de proposta, sugestões e aviso de indisponível; cartão "Resumo da semana" no Progresso.
- **Avaliação (P10.4):**
  - As 14 perguntas com os grupos de ferramentas esperados (ADR-057) rodam sobre o usuário demo: `pnpm ai:eval:coach` grava um relatório em `apps/api/eval-reports/`.
  - Sem chave, só o harness roteirizado roda: 14/14, e o CI roda o mesmo harness.
  - **A avaliação com o modelo real ainda não foi feita:** este ambiente não tem `ANTHROPIC_API_KEY`.
- **E2E:** pergunta respondida em streaming e proposta de refeição aplicada que aparece na Nutrição (16 testes no total).
- **Revisão (checklist 16.3):** 2 problemas altos (conversa quebrada após `max_tokens`; brechas na checagem de números) e 6 médios (descartar durante aplicação, tokens de turnos com falha, limite por minuto e turnos paralelos, histórico e cache, desconexão do cliente, critérios da avaliação) corrigidos com testes (ADR-057). Os baixos também foram corrigidos: início do dia em UTC+14, nomes de ferramenta herdados do protótipo, números das travas, robustez do SSE no web, estado e acessibilidade do chat.
- **Correção extra:** desempate determinístico nas alternativas de exercício (o E2E de substituição falhava de forma intermitente).
- **DoD:** pendente a avaliação real. Com chave, rode `ANTHROPIC_API_KEY=... AI_MODEL_CHAT=claude-sonnet-5-5 pnpm ai:eval:coach` (custa tokens) e a meta é 14/14.

## Pendente (para fases seguintes)
- **DoD da Fase 7:** avaliação do Coach com o modelo real (precisa de `ANTHROPIC_API_KEY` nos segredos do ambiente).
- Plano semanal e lista de compras (Parte 15): futuro.
- Leite fluido e itens ausentes na TACO; fallback USDA bloqueado pela rede deste ambiente (OPEN_QUESTIONS).
- Avaliação do parser com 100 frases e da IA real: junto com a avaliação do Coach, quando houver chave.
- Uma proposta cuja conclusão falhe depois de aplicada fica travada como pendente; não é reaplicada (OPEN_QUESTIONS).
- `training_load_daily` e `daily_context` materializados: adiados, calculados sob demanda (ADR-044/049).
- Reversão local de operação offline recusada (OPEN_QUESTIONS).
- **DoD da Fase 8:** subir no servidor do dono (`docs/DEPLOY.md`), configurar a cópia externa do backup (S3) e usar por 2 semanas; registrar aqui os bloqueios encontrados.
- Notificações push, múltiplas instâncias (store compartilhado de rate limit, ADR-014) e reconciliação de proposta travada: futuras.

## Bugs conhecidos
- Nenhum bloqueante. Itens menores em `OPEN_QUESTIONS.md` (macros acima das kcal com proteína muito alta; aviso de peso retroativo cliente × API).

## Notas de ambiente
- Sem Docker: defina `TEST_DATABASE_URL` para os testes de integração (ADR-010).
- Chromium pré-instalado: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/caminho/chrome pnpm test:e2e` (neste ambiente: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`).
- Após reiniciar o contêiner, o Docker pode estar parado: `dockerd &` e depois `pnpm db:up`.
- Antes de commitar, rode o typecheck de cada pacote sem o cache do turbo (`npx tsc --noEmit` em cada um): o cache já escondeu uma quebra do web num commit intermediário. Com servidores de dev já rodando, o Playwright os reaproveita; o limite de cadastro/login (`AUTH_RATE_LIMIT_MAX=5`) pode derrubar a suíte, então pare-os antes ou suba a API com um limite maior.
- `apps/web/AGENTS.md` e `apps/web/CLAUDE.md` são gerados pelo `next dev`.
- O E2E da Fase 6 dispensa um insight do usuário demo: rode `pnpm db:seed:demo` antes de repetir a suíte localmente.
- Jobs: `JOBS_ENABLED=true` liga o worker pg-boss (cria o schema `pgboss` no banco).
- O E2E e o `pnpm perf` sobem o build de produção do web (`next build && next start`); para iterar mais rápido, `E2E_WEB_DEV=1`. Um `next start` esquecido na porta 3000 é reaproveitado (servindo um build antigo): encerre-o antes. Não use `pkill -f` com um padrão que case com o próprio comando.
- Build das imagens neste ambiente (proxy com TLS interceptado e Docker Hub com limite): imagens base pelo `mirror.gcr.io` (re-tag local), `docker build --network host --build-arg HTTPS_PROXY=$HTTPS_PROXY --secret id=ca_bundle,src=/root/.ccr/ca-bundle.crt`. A imagem de backup usa `--build-arg EXTRA_PACKAGES=` porque o CDN do Alpine é bloqueado aqui.

## Próximo passo
- Com `ANTHROPIC_API_KEY`: `pnpm db:seed:demo` e depois `AI_MODEL_CHAT=claude-sonnet-5-5 pnpm ai:eval:coach`. Analisar o relatório; se não der 14/14, ajustar o prompt ou as ferramentas.
- Deploy no servidor do dono: escolher VPS e domínio, `cp deploy/.env.production.example deploy/.env`, preencher e subir (`docs/DEPLOY.md`). Configurar o S3 do backup. Rodar `deploy/test-backup.sh` e o smoke contra o domínio.
- Duas semanas de uso real (DoD da Fase 8): anotar bloqueios aqui e corrigi-los antes de qualquer fase nova (Fase 9+ é futura e não deve ser implementada sem decisão).
