import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const date = z.string().describe('Data no formato AAAA-MM-DD');
const period = { start: date, end: date };
const slot = z.enum([
  'breakfast',
  'morning_snack',
  'lunch',
  'afternoon_snack',
  'pre_workout',
  'post_workout',
  'dinner',
  'supper',
  'other',
]);

/** Ferramentas do Coach (P10.2). Leitura roda direto; escrita só cria proposta (ADR-054). */
export const COACH_TOOLS = {
  get_profile_summary: {
    kind: 'read',
    description: 'Perfil, objetivo vigente, limitações, preferências e metas médias.',
    input: z.strictObject({}),
  },
  get_daily_context: {
    kind: 'read',
    description:
      'Fotografia de um dia: tipo do dia, prontidão, treino planejado/adaptado/feito, atividades, carga, nutrição (meta, consumido, planejado, restante) e sinais.',
    input: z.strictObject({ date }),
  },
  get_period_summary: {
    kind: 'read',
    description:
      'Resumo de um período: treinos, aderência, tonelagem, ranking de evolução do e1RM, volume por músculo, médias nutricionais por tipo de dia, peso e prontidão.',
    input: z.strictObject(period),
  },
  get_exercise_progress: {
    kind: 'read',
    description:
      'Série de e1RM, carga e tonelagem por sessão de um exercício, recordes e se está estagnado. Aceita o nome do exercício.',
    input: z.strictObject({ exercise: z.string(), ...period }),
  },
  get_muscle_volume: {
    kind: 'read',
    description:
      'Séries duras por semana e frequência por músculo no período, com as faixas (mínimo, produtivo, máximo).',
    input: z.strictObject(period),
  },
  get_nutrition_history: {
    kind: 'read',
    description:
      'Médias de kcal e macros, aderência às metas e médias por tipo de dia no período, mais a estimativa de gasto em uso.',
    input: z.strictObject(period),
  },
  get_body_trend: {
    kind: 'read',
    description: 'Pesagens, tendência de peso, variação e ritmo semanal no período.',
    input: z.strictObject(period),
  },
  get_recovery_history: {
    kind: 'read',
    description: 'Check-ins (sono, prontidão) e carga diária (aguda, crônica, ACWR) no período.',
    input: z.strictObject(period),
  },
  get_insights: {
    kind: 'read',
    description: 'Insights ativos (regras e correlações). `status` opcional.',
    input: z.strictObject({ status: z.enum(['new', 'seen', 'dismissed', 'acted']).nullable() }),
  },
  get_today_plan: {
    kind: 'read',
    description:
      'Treino de hoje (original e adaptado, com motivos) e refeições planejadas de hoje.',
    input: z.strictObject({}),
  },
  search_foods: {
    kind: 'read',
    description: 'Busca alimentos no banco e nos do usuário, com nutrientes por 100 g.',
    input: z.strictObject({ query: z.string() }),
  },
  suggest_meal: {
    kind: 'read',
    description:
      'Sugestões de refeição pelo restante do dia (solver): combinações de alimentos que o usuário já come, com quantidades e macros.',
    input: z.strictObject({ slot: slot.nullable() }),
  },
  compare_periods: {
    kind: 'read',
    description: 'Compara dois períodos (B em relação a A) nas principais métricas.',
    input: z.strictObject({ a_start: date, a_end: date, b_start: date, b_end: date }),
  },
  propose_meal_log: {
    kind: 'write',
    description:
      'Propõe registrar uma refeição já comida, descrita em texto (ex.: "200 g de arroz e 150 g de frango"). O usuário confirma.',
    input: z.strictObject({ text: z.string(), slot }),
  },
  propose_meal_plan: {
    kind: 'write',
    description:
      'Propõe planejar uma refeição para uma data, descrita em texto. O usuário confirma.',
    input: z.strictObject({ text: z.string(), slot, date }),
  },
  propose_workout_adaptation: {
    kind: 'write',
    description:
      'Propõe aplicar ao treino agendado da data a adaptação calculada pelas regras (prontidão, esporte, dor, tempo). O usuário confirma.',
    input: z.strictObject({ date, reason: z.string() }),
  },
  propose_exercise_swap: {
    kind: 'write',
    description:
      'Propõe trocar um exercício do programa ativo por outro (nomes). Passa pelo validador. O usuário confirma.',
    input: z.strictObject({ from_exercise: z.string(), to_exercise: z.string() }),
  },
  propose_goal_update: {
    kind: 'write',
    description:
      'Propõe um novo objetivo, com o impacto nas metas recalculado. Respeita as travas de segurança. O usuário confirma.',
    input: z.strictObject({
      primary_goal: z.enum([
        'fat_loss',
        'maintenance',
        'muscle_gain',
        'recomposition',
        'performance',
      ]),
      target_rate_pct_per_week: z.number().nullable(),
    }),
  },
} as const;

export type CoachToolName = keyof typeof COACH_TOOLS;
export type CoachToolInput<N extends CoachToolName> = z.output<(typeof COACH_TOOLS)[N]['input']>;

export const isCoachTool = (name: string): name is CoachToolName =>
  Object.hasOwn(COACH_TOOLS, name);

/** Definições para a API: esquema gerado do Zod, `strict` (ADR-054). */
export function coachToolDefinitions(): Anthropic.Beta.BetaTool[] {
  return Object.entries(COACH_TOOLS).map(([name, t]) => {
    const schema = { ...(z.toJSONSchema(t.input) as Record<string, unknown>) };
    delete schema.$schema;
    return {
      name,
      description: t.description,
      strict: true,
      input_schema: schema as Anthropic.Beta.BetaTool['input_schema'],
    };
  });
}
