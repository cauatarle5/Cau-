# PROGRESS: Atlas

## Fase atual
**Fase 2. Nutrição núcleo: concluída.** Próximo: **Fase 3. Treino núcleo.**

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

## Pendente (para fases seguintes)
- GET adaptativo semanal: Fase 6.
- Receitas, refeições planejadas, `POST meals/:id/log`, modelos de refeição: Fase 4.
- Leite fluido e itens ausentes na TACO; fallback USDA bloqueado pela rede deste ambiente (OPEN_QUESTIONS).
- Avaliação do parser com 100 frases e da IA real: Fase 7 (sem `ANTHROPIC_API_KEY` neste ambiente, só as regras foram avaliadas).
- Preferências de exercício: Fase 3 (ADR-019).
- Botão flutuante de registro rápido (12.1): entra com os registros que ele aciona.
- Exportação/exclusão de conta (LGPD) e PWA: Fase 8.
- Deploy: definir `TRUST_PROXY` e `WEB_ORIGIN` (ADR-014).
- `/entrar` e `/cadastro` não redirecionam quem já está logado (UX, baixa prioridade).

## Bugs conhecidos
- Nenhum bloqueante. Itens menores em `OPEN_QUESTIONS.md` (macros acima das kcal com proteína muito alta; aviso de peso retroativo cliente × API).

## Notas de ambiente
- Sem Docker: defina `TEST_DATABASE_URL` para os testes de integração (ADR-010).
- Chromium pré-instalado: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/caminho/chrome pnpm test:e2e`. Com servidores de dev já rodando, o Playwright os reaproveita; o limite de cadastro/login (`AUTH_RATE_LIMIT_MAX=5`) pode derrubar a suíte, então pare-os antes ou suba a API com um limite maior.
- `apps/web/AGENTS.md` e `apps/web/CLAUDE.md` são gerados pelo `next dev`.

## Próximo passo
- `/fase 3`: seed de ~150 exercícios com mapeamento muscular, programas e templates manuais, treino ativo com fantasmas/descanso/pular/substituir, offline com sincronização (`Idempotency-Key`, ADR-027), histórico e métricas (e1RM, tonelagem, volume por músculo, recordes), preferências de exercício (ADR-019).
