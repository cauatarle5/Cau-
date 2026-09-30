# PROGRESS: Atlas

## Fase atual
**Fase 4. Receitas e planejamento alimentar: concluída.** Próximo: **Fase 5. Periodização, esportes e recuperação.**

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

## Pendente (para fases seguintes)
- GET adaptativo semanal: Fase 6.
- Plano semanal e lista de compras (Parte 15); IA redigindo sugestões: Fase 7 (números sempre do solver).
- Leite fluido e itens ausentes na TACO; fallback USDA bloqueado pela rede deste ambiente (OPEN_QUESTIONS).
- Avaliação do parser com 100 frases e da IA real: Fase 7 (sem `ANTHROPIC_API_KEY` neste ambiente, só as regras foram avaliadas).
- Mesociclos, agenda (`planned_workouts`), progressão dupla nas metas, registro de dor e adaptação por prontidão: Fase 5 (ADR-035).
- Limpeza de `idempotency_keys` (job) e reversão local de operação offline recusada (OPEN_QUESTIONS).
- Treino offline com recarga de página: PWA, Fase 8.
- Botão flutuante de registro rápido (12.1): entra com os registros que ele aciona.
- Exportação/exclusão de conta (LGPD) e PWA: Fase 8.
- Deploy: definir `TRUST_PROXY` e `WEB_ORIGIN` (ADR-014).
- `/entrar` e `/cadastro` não redirecionam quem já está logado (UX, baixa prioridade).

## Bugs conhecidos
- Nenhum bloqueante. Itens menores em `OPEN_QUESTIONS.md` (macros acima das kcal com proteína muito alta; aviso de peso retroativo cliente × API).

## Notas de ambiente
- Sem Docker: defina `TEST_DATABASE_URL` para os testes de integração (ADR-010).
- Chromium pré-instalado: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/caminho/chrome pnpm test:e2e` (neste ambiente: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`).
- Após reiniciar o contêiner, o Docker pode estar parado: `dockerd &` e depois `pnpm db:up`. Com servidores de dev já rodando, o Playwright os reaproveita; o limite de cadastro/login (`AUTH_RATE_LIMIT_MAX=5`) pode derrubar a suíte, então pare-os antes ou suba a API com um limite maior.
- `apps/web/AGENTS.md` e `apps/web/CLAUDE.md` são gerados pelo `next dev`.

## Próximo passo
- `/fase 5`: periodização, esportes e recuperação (gerador de programa por regras, mesociclos, agenda, atividades, check-in, ACWR, prontidão, adaptação do treino do dia, progressão dupla, registro de dor), conforme `docs/ROADMAP.md`.
