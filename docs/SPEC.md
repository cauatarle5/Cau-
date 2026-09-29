# SPEC: Atlas

Condensado de `PROMPT_MESTRE.md` (Partes 1, 2, 5 a 10 e 12). Em caso de divergência, o PROMPT_MESTRE prevalece; referências entre parênteses apontam a seção original.

## 1. Visão (P2)

Central pessoal que responde, com dados reais do usuário:

> Quem eu sou, quais são meus objetivos, como estou treinando, o que estou comendo, como estou me recuperando e o que devo fazer a seguir para continuar evoluindo?

Registra o que **aconteceu**, compara com o **planejado**, calcula métricas e **adapta** o próximo passo. Toda tela serve a uma de duas perguntas: **"O que eu preciso fazer hoje?"** (Hoje) ou **"Como estou evoluindo?"** (Progresso).

### Módulos (P2.3)
Perfil e Corpo · Treinador · Recuperação · Nutricionista · Registro Alimentar · Receitas · Planejamento Alimentar · Integração (contexto diário) · Análise e Insights · Coach IA · Dashboard.

### Premissas (P2.4)
- Usuário único (dono), schema **multiusuário desde o dia 1** (`user_id` em tudo).
- Mobile-first, PWA; app nativo depois (Apple Health).
- Refeição em **≤ 10 s**; série confirmada em **1 toque**.
- Funciona **sem IA** (degradação graciosa).

## 2. Princípios invioláveis (P1)
1. Cálculo determinístico em código testado; **nenhum número exibido vem de LLM**. LLM só extrai estrutura e redige.
2. Histórico imutável: refeições, séries e medidas guardam snapshot.
3. Todo acesso escopado por `user_id` (LGPD, dados de saúde).
4. Não é médico: não diagnostica, não prescreve para condições clínicas; dor persistente ou sintomas → profissional.
5. Interface e IA em pt-BR; código, tabelas e commits em inglês.
6. Métrico. Interno: kg, g, ml, cm, kcal, s. Datas em UTC; "dia" pelo fuso do usuário (padrão `America/Sao_Paulo`).
7. Requisito ausente: o mais simples + ADR. Sem escopo inventado.

## 3. Nutrição (P5) — `packages/core/nutrition`

### 3.1 TMB (P5.1)
- Mifflin-St Jeor (padrão): H `10p + 6,25a − 5i + 5`; M `10p + 6,25a − 5i − 161`.
- Katch-McArdle `370 + 21,6 × massa_magra_kg` quando há % gordura por `dexa|skinfold|bioimpedance` nos últimos 60 dias.
- Peso = tendência (3.5), não pesagem isolada.

### 3.2 GET por fórmula (P5.2)
`GET_dia = TMB × fator_estilo + kcal_exercício_líquido`
- Fator: sedentary 1,20 · light 1,35 · moderate 1,50 · high 1,65.
- `kcal_líquido = (MET − 1) × peso × horas`. MET: musculação 3,5 (sRPE ≤ 6) / 5,0 (≥ 7); futebol/futsal 7,0 recreativo / 10,0 competitivo; corrida pela velocidade (10 km/h ≈ 9,8) senão 8,0; ciclismo 6,8; natação 5,8; caminhada 3,5.
- Wearable (futuro): `min(kcal_reportado, MET_kcal × 1,1)`.
- GET semanal base = média dos 7 dias planejados.

### 3.3 GET adaptativo (P5.3)
- Ativa com ≥ 14 dias completos (marcado ou ≥ 3 refeições), ≥ 10 pesagens, janela ≤ 28 dias.
- `GET_obs = ingestão_média − (Δtendência × 7700) / dias`.
- Média confiança: `0,7 obs + 0,3 anterior`; alta (≥ 21 dias, ≥ 18 pesagens): `0,85 / 0,15`.
- Job semanal (segunda 04:00 fuso do usuário); variação máx. ±150 kcal/semana; tudo em `energy_estimates`.

### 3.4 Metas por objetivo (P5.4)
| Objetivo | Energia | Ritmo |
|---|---|---|
| fat_loss | −20% (−15 a −25%) | 0,5–1,0%/sem |
| maintenance | 0 | ±0,25%/sem |
| muscle_gain | +10% iniciante, +5% demais | 0,25–0,5%/sem |
| recomposition | −5% a 0 | peso estável |
| performance | 0 a +5%, carbo alto | calendário |

Com `target_rate_pct_per_week`: ajuste = `peso × taxa × 7700 / 7`, limitado pelas travas.

### 3.5 Tendência de peso (P5.5)
EMA `t = t₋₁ + 0,1 × (peso − t₋₁)`; sem pesagem, mantém; exibir pontos + linha.

### 3.6 Macros (P5.6) — ordem: proteína, gordura, fibra, carboidrato
- Proteína 1,8 g/kg; 2,0–2,2 em fat_loss/recomposition; se gordura > 25% (H) / 32% (M): 2,4 g/kg de massa magra. Constante entre tipos de dia.
- Gordura 0,8 g/kg, piso 20% kcal, mínimo absoluto 0,6 g/kg.
- Carbo = restante; piso 2 g/kg em hard_training/esporte (reduz gordura até o mínimo antes).
- Fibra 14 g/1000 kcal, mín. 25 g. Água 35 ml/kg + 500 ml/h exercício.
- 4/4/9 kcal/g.

### 3.7 Travas (P5.7) — nunca contornadas
- kcal ≥ TMB e ≥ 1500 (H) / 1200 (M). Déficit ≤ 25% do GET.
- Perda > 1%/sem por 2 semanas → insight `warning`.
- Sem planos para gestação, doenças, transtornos alimentares, medicamentos → texto recomendando profissional.

### 3.8 Tipo de dia (P5.8)
rest (nada) · training (sRPE ≤ 7 ou planejada normal) · hard_training (sRPE ≥ 8 ou volume ≥ 120% da média) · sport · sport_and_training. Usuário pode sobrescrever.
Média semanal preservada; proteína fixa; ajustes no carbo: rest −10%, hard +5%, esporte = base + kcal líquido do esporte (≤ +25%); rebalancear demais dias respeitando travas. Mudança no plano recalcula dias futuros da semana; passado nunca.

### 3.9 Distribuição no dia (P5.9)
Guia não bloqueante: proteína 0,3–0,5 g/kg/refeição em 3–5 refeições; carbo em pré/pós em dias ativos.

## 4. Registro alimentar (P6)
- Entradas: texto livre, busca, recentes/frequentes, repetir, receita.
- Pipeline: normalização (acentos, números por extenso, vírgula decimal) → extração IA (JSON Zod, **sem nutrientes**) → fallback por regras (regex) → matching (score = trigram × 0,6 + uso × 0,3 + verificado × 0,1; estados padrão "cozido", "frango" = peito grelhado; ≥ 0,75 automático, 0,45–0,75 melhor + 3 alternativas, < 0,45 pede escolha) → conversão para gramas (g, kg, ml com densidade padrão 1,0 sinalizada, medida caseira alimento → usuário → genérica, `UNIT_NOT_CONVERTIBLE` salva medida do usuário; "unidade" = `is_default`) → cálculo `valor_100 × g / 100` com snapshot → revisão inline → aprendizado (`parser_feedback`, `user_food_usage`, alias pessoal).
- Alimento personalizado: nome, porção, kcal, P, C, G; demais opcionais; entrada por rótulo.
- Seeds: TACO (base), TBCA (se viável), USDA (fallback), OFF (código de barras). Aliases e medidas dos 150 alimentos mais comuns. Idempotente, com fonte e licença.

## 5. Receitas e planejamento (P7)
- Receita: total = soma dos ingredientes; por porção = total / servings; por 100 g = total × 100 / cooked_weight_g. Registro por porção ou gramas. Edição não altera passado.
- Sugestão por macros restantes (`core/nutrition/suggest.ts`): pool = favoritas, modelos, alimentos dos últimos 30 dias; combinações de 1–3 itens; LP pequeno com proteína como restrição dura e porções práticas; top 3.
- Planejamento: consumido/planejado/total/restante em tempo real no cliente; alertas: excesso > 10% em gordura/kcal/carbo → substituição; proteína < 85% → complemento; fibra < 70% → fonte de fibra. Substituição: mesma categoria, kcal ±15%, proteína ≥ 90%. Copiar dia, salvar modelo.

## 6. Treino e recuperação (P8) — `packages/core/training`, `packages/core/recovery`
- e1RM Epley `carga × (1 + reps/30)` para working 1–12 reps; reps efetivas = reps + RIR (≤ 12). Tonelagem = Σ carga × reps. Série dura: working com RIR ≤ 3 / RPE ≥ 7 (sem dado = dura). Volume/músculo = Σ séries duras × peso (1,0/0,5) por semana seg–dom. Frequência = dias com ≥ 2 séries duras ponderadas. Recordes: e1RM, carga, reps em carga, tonelagem sessão. RIR = 10 − RPE.
- Faixas: MEV 8, produtiva 10–20, MRV 22. Prioridade estética → terço superior; limitação → reduzido; panturrilha/abdômen sem alerta abaixo do MEV salvo prioridade.
- Progressão dupla: todas no rep_max com RIR ≥ alvo − 1 → +incremento (2,5 sup., 5 inf., 1–2 isolados), volta ao rep_min; dentro da faixa → +1 rep; < rep_min 2× → −5 a 10%; sessão adaptada não conta. Fantasmas da última vez.
- Estagnação: melhor e1RM das últimas 4 exposições não supera a anterior em ≥ 1%, ou 21 dias. Ações: mudar faixa → variação → deload. Queda: e1RM ≥ 5% abaixo da média das 3 anteriores em ≥ 2 exercícios na semana.
- Carga: sRPE = RPE × min; aguda 7 d; crônica 28 d (EWMA); ACWR > 1,5 alerta, < 0,8 por 2 sem destreino; monotonia > 2,0 insight; strain = carga × monotonia.
- Prontidão 0–100: sono 30% (`min(h/8,1) × 0,6 + (q−1)/4 × 0,4`), energia 20%, fadiga 20%, dor 15%, estresse 15%; −10 se ACWR > 1,5; −10 em sessão de inferiores se atividade lower_body_demand 3 e RPE ≥ 7 nas últimas 24 h; sem check-in = desconhecida.
- Adaptação: ≥ 70 normal; 50–69 volume −25%, RIR +1, sem recorde; < 50 leve (50%, RIR 4) ou descanso. Esporte intenso 24 h antes: pernas −30 a 50%, evitar hinge pesado, sugerir troca; esporte nas próximas 24 h: evitar pernas pesado; dor ≥ 4 → substituir, ≥ 7 ou recorrente 3× → profissional e bloqueio de progressão; pouco tempo: cortar isolados, depois séries, nunca o principal. Sempre `adapted_payload` + explicação.
- Geração de programa: divisão por dias (2–3 full body; 4 sup/inf; 5 sup/inf + PPL; 6 PPL×2); exercícios = `floor(min/9)` entre 4 e 8; seleção por padrão/equipamento/preferência/limitação; volume nas faixas; mesociclo 5 semanas (RIR 3,2,2,1; volume 1,0/1,1/1,15/1,2; deload 0,5 RIR 4); 3 mesociclos; deload antecipado; **validador** para todo programa.

## 7. Integração (P9)
`DailyContext` por data (dayType, readiness, training planned/adapted/done, activities, load, nutrition targets/consumed/planned/remaining/completeness, body, flags). Base da tela Hoje e da IA. Regras: mudança de treino recalcula day_type e metas futuras; esporte registrado no mesmo dia recalcula o próprio dia; proteína < 80% em 3 de 5 dias de treino → insight; ingestão < 90% em hard_training + queda → insight; correlações Pearson com n ≥ 10 e |r| ≥ 0,4, redigidas como associação.

## 8. Inteligência (P10)
- Três camadas: motor analítico (determinístico) → insights (determinístico, tipos estáveis como `LOW_PROTEIN_STREAK`, `HIGH_ACWR`, `NEW_PR`...) → Coach IA (LLM com ferramentas).
- Ferramentas de leitura automáticas (`get_profile_summary`, `get_daily_context`, `get_period_summary`, `get_exercise_progress`, `get_muscle_volume`, `get_nutrition_history`, `get_body_trend`, `get_recovery_history`, `get_insights`, `get_today_plan`, `search_foods`, `suggest_meal`, `compare_periods`); escrita só por proposta (`propose_*`) com cartão Aplicar/Descartar.
- Prompt do Coach: todo número de ferramenta; período explícito; fato × cálculo × sugestão; correlação ≠ causa; não diagnosticar; respeitar travas; ~150 palavras; resumo inicial de ~500 tokens.
- Avaliação: 14 perguntas (P10.4) sobre seed demo de 90 dias.
- Resumo semanal por LLM; nenhum outro uso em background.
- `AI_MODEL_CHAT` / `AI_MODEL_FAST` por env (nunca fixos no código); SSE; tokens por mensagem e limite diário; prompt caching; sem chave → parser por regras e aviso no chat.

## 9. APIs (P11)
REST `/api/v1`, autenticadas exceto `auth/register` e `auth/login`. Lista completa de recursos em PROMPT_MESTRE P11. Padrões em `ARCHITECTURE.md`.

## 10. Front-end (P12)
- Navegação mobile: barra inferior **Hoje · Treino · Nutrição · Progresso · Coach**; perfil no avatar; FAB de registro rápido (Refeição, Série/Treino, Check-in, Peso, Atividade, Água). Desktop: barra lateral, Hoje em grade.
- Hoje: check-in/prontidão → treino do dia → nutrição (anel + barras + "O que você comeu?") → próximas refeições ("Comi isso") → um insight.
- Treino ativo: fantasmas, 1 toque, steppers, RIR opcional, descanso automático com vibração, pular/substituir/adicionar/dor, finalizar com RPE e resumo. **Offline obrigatório** (IndexedDB + `Idempotency-Key`).
- Registro alimentar: campo único, lista editável, chips, "Repetir ontem", slot por hora, estados de confiança.
- Planejamento: slots, painel de restante fixo em tempo real, alertas inline.
- Progresso: período e comparação; corpo, força, volume (mapa SVG), consistência, nutrição, recuperação, resumo semanal.
- Visual: premium e contido, uma cor de destaque, números tabulares, claro/escuro, sem gamificação; AA, alvos ≥ 44 px, teclado; mobile-first 360 px, breakpoints 640/1024/1280; estados vazios que ensinam; skeletons; otimista.
