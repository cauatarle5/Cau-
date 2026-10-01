/**
 * As 14 perguntas da P10.4 com as ferramentas esperadas (ADR-057). Cada grupo é "pelo menos uma
 * destas"; todos os grupos precisam ser atendidos. O DailyContext de hoje já vai no contexto
 * injetado (P10.3), então `get_daily_context` só é exigido onde a P10.4 pede outro dado do dia.
 */
export interface CoachEvalCase {
  id: string;
  question: string;
  expectTools: string[][];
}

export const COACH_EVAL_CASES: CoachEvalCase[] = [
  {
    id: 'semana',
    question: 'Como foi minha semana?',
    expectTools: [['get_period_summary'], ['get_insights']],
  },
  {
    id: 'evolucao-treinos',
    question: 'Estou evoluindo nos treinos?',
    expectTools: [['get_period_summary', 'get_exercise_progress']],
  },
  {
    id: 'musculo-atras',
    question: 'Qual músculo está ficando para trás?',
    expectTools: [['get_muscle_volume']],
  },
  {
    id: 'proteina',
    question: 'Como está minha ingestão de proteína?',
    expectTools: [['get_nutrition_history']],
  },
  {
    id: 'meta-calorica',
    question: 'Estou cumprindo minha meta calórica?',
    expectTools: [['get_nutrition_history'], ['get_body_trend']],
  },
  { id: 'peso', question: 'Como meu peso está evoluindo?', expectTools: [['get_body_trend']] },
  { id: 'comer-hoje', question: 'O que eu deveria comer hoje?', expectTools: [['suggest_meal']] },
  {
    id: 'treino-hoje',
    question: 'Qual treino devo fazer hoje?',
    expectTools: [['get_today_plan', 'get_daily_context']],
  },
  {
    id: 'dormi-mal',
    question: 'Como adaptar meu treino porque dormi mal?',
    expectTools: [['get_daily_context', 'get_today_plan'], ['propose_workout_adaptation']],
  },
  {
    id: 'completar-macros',
    question: 'O que posso comer para completar meus macros?',
    expectTools: [['suggest_meal']],
  },
  {
    id: 'maior-evolucao',
    question: 'Quais exercícios tiveram maior evolução?',
    expectTools: [['get_period_summary', 'get_exercise_progress']],
  },
  {
    id: 'frequencia',
    question: 'Estou treinando quadríceps com frequência suficiente?',
    expectTools: [['get_muscle_volume']],
  },
  {
    id: 'consistencia',
    question: 'Como está minha consistência?',
    expectTools: [['get_period_summary']],
  },
  {
    id: 'padroes',
    question: 'Quais padrões aparecem nos meus dados?',
    expectTools: [['get_insights']],
  },
];

/** Grupos de ferramentas não atendidos por uma resposta. */
export function missingToolGroups(expect: string[][], called: readonly string[]): string[][] {
  return expect.filter((group) => !group.some((t) => called.includes(t)));
}
