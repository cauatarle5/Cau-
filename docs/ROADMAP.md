# ROADMAP: Atlas

Condensado de `PROMPT_MESTRE.md` Parte 15. Cada fase termina com DoD atendido, `PROGRESS.md` atualizado, commit e merge. Nenhuma fase começa com a anterior quebrada.

Ciclo de cada fase (P16.1): `/clear` → ler CLAUDE.md, PROGRESS.md e a seção da fase → plano curto (modo plan) → aprovação → passos pequenos (typecheck, lint, testes, commit) → suíte completa + E2E + revisão (checklist P16.3) → PROGRESS/DECISIONS → merge.

## Fase 0. Fundação
Monorepo, Docker Compose com Postgres, Fastify com health check, Next.js com layout e navegação, Drizzle configurado, pipeline de erros, logger, CI, `packages/core` e `packages/schemas` com um teste exemplo, auth completa (cadastro, login, sessão, logout).
**DoD:** `pnpm dev` sobe tudo; cadastro e login funcionam no navegador; CI verde.

## Fase 1. Perfil, objetivos e corpo
Onboarding em etapas curtas (dados básicos, objetivo, rotina e disponibilidade, equipamentos, limitações, esportes). Registro de peso e medidas. Tendência de peso. TMB/GET/metas no core com testes.
**DoD:** onboarding em até 3 minutos; metas calculadas visíveis com explicação dos insumos.

## Fase 2. Nutrição núcleo
Seed TACO + aliases + medidas caseiras; busca; alimento personalizado; parser por texto (IA + regras); registro de refeições; metas diárias por tipo de dia (sem adaptativo); tela Hoje com cartão de nutrição; água.
**DoD:** "200g de arroz, 150g de frango e 100g de feijão" registrado em < 10 s com valores corretos conferidos contra a TACO.

## Fase 3. Treino núcleo
Seed de ~150 exercícios com mapeamento muscular; programa e templates manuais; treino ativo com fantasmas, descanso, pular, substituir; offline com sincronização; histórico; métricas (e1RM, tonelagem, volume por músculo, recordes).
**DoD:** treino completo registrado no celular sem rede e sincronizado depois; progresso por exercício visível.

## Fase 4. Receitas e planejamento alimentar
Receitas (total, porção, 100 g); favoritas; refeições planejadas; simulação em tempo real; planejada → consumida; modelos; motor de substituição; solver de sugestão.
**DoD:** planejar o dia inteiro, ver o restante mudar em tempo real e receber sugestão ao ultrapassar gordura.

## Fase 5. Periodização, esportes e recuperação
Gerador de programa + validador; mesociclos; agenda; atividades; check-in; carga interna, ACWR, prontidão; adaptação automática; progressão dupla nas metas; registro de dor.
**DoD:** futebol intenso ontem + noite ruim hoje produz treino adaptado com explicação coerente.

## Fase 6. Integração e motor de insights
DailyContext completo; metas reagindo ao plano da semana; GET adaptativo semanal; jobs pg-boss; insights; correlações; tela Progresso completa com comparação; seed demo de 90 dias.
**DoD:** com o seed demo, Progresso e insights mostram informações corretas e úteis.

## Fase 7. Coach IA
Ferramentas, system prompt, conversas persistidas, streaming, propostas aceitar/rejeitar, resumo semanal, avaliações.
**DoD:** as 14 perguntas (SPEC §8 / P10.4) respondidas com dados reais e sem números inventados.

## Fase 8. Acabamento e deploy
PWA instalável, LCP < 2,5 s mobile, acessibilidade, exportação e exclusão de conta, deploy com backup diário.
**DoD:** uso diário real pelo dono por 2 semanas sem bloqueios.

## Fase 9+ (futuro, não implementar)
App nativo (Expo) com HealthKit/Health Connect; wearables; fotos de evolução; alimento por foto/rótulo; código de barras (OFF); plano semanal e lista de compras; notificações; suplementos; múltiplos perfis e relatórios.
