import type { ReadinessBand, ReadinessDriver } from '../recovery/readiness';

import { estimateMinutes } from './generator';
import type { MuscleCode } from './volume';

export type PainRegion =
  'shoulder' | 'elbow' | 'wrist' | 'lower_back' | 'hip' | 'knee' | 'ankle' | 'neck' | 'other';

/** Região dolorida → músculos e tags de contraindicação do catálogo (ADR-046). */
export const PAIN_REGIONS: Record<PainRegion, { muscles: MuscleCode[]; tags: string[] }> = {
  shoulder: {
    muscles: ['front_delts', 'side_delts', 'rear_delts'],
    tags: ['overhead_press', 'shoulder_impingement', 'shoulder_extension'],
  },
  elbow: { muscles: ['biceps', 'triceps', 'forearms'], tags: [] },
  wrist: { muscles: ['forearms'], tags: ['wrist_extension'] },
  lower_back: { muscles: ['lower_back'], tags: ['spinal_loading', 'heavy_hinge'] },
  hip: { muscles: ['glutes', 'adductors', 'abductors'], tags: [] },
  knee: { muscles: ['quads'], tags: ['deep_knee_flexion'] },
  ankle: { muscles: ['calves'], tags: ['high_impact'] },
  neck: { muscles: ['traps'], tags: [] },
  other: { muscles: [], tags: [] },
};

export interface WorkoutExercise {
  exerciseId: string;
  name: string;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number | null;
  restSeconds: number | null;
  movementPattern: string;
  mechanics: 'compound' | 'isolation';
  primaryMuscles: readonly MuscleCode[];
  contraindicationTags: readonly string[];
}

export interface AdaptationContext {
  readiness: { score: number | null; band: ReadinessBand; drivers: readonly ReadinessDriver[] };
  /** Esporte intenso nas últimas 24 h (ADR-045). */
  sportYesterday: { sport: string; rpe: number } | null;
  sportTomorrow: { sport: string } | null;
  pain: readonly { region: PainRegion; intensity: number }[];
  availableMinutes: number | null;
  /** Vermelho: sessão leve (padrão) ou descanso/mobilidade. */
  redChoice?: 'light' | 'rest';
}

export interface AdaptedExercise extends WorkoutExercise {
  originalSets: number;
  removed: boolean;
  substitute: boolean;
}

export interface Adaptation {
  mode: 'normal' | 'reduced' | 'light' | 'rest';
  exercises: AdaptedExercise[];
  changed: boolean;
  /** Mudança por baixa prontidão: só ela tira a sessão da progressão dupla (P8.3.4, ADR-047). */
  readinessAdapted: boolean;
  noRecords: boolean;
  seeProfessional: boolean;
  /** Frases em pt-BR, montadas por regras (sem LLM). */
  explanation: string[];
}

const LOWER: readonly MuscleCode[] = ['quads', 'hamstrings', 'glutes'];
const isLower = (e: WorkoutExercise) => e.primaryMuscles.some((m) => LOWER.includes(m));

export const DRIVER_LABELS: Record<ReadinessDriver, string> = {
  sleep: 'sono ruim',
  energy: 'pouca disposição',
  fatigue: 'fadiga alta',
  soreness: 'dor muscular',
  stress: 'estresse alto',
  high_acwr: 'pico de carga na semana',
  sport_yesterday: 'esporte intenso ontem',
};

const SPORT_LABELS: Record<string, string> = {
  football: 'jogou futebol',
  futsal: 'jogou futsal',
  running: 'correu',
  cycling: 'pedalou',
  swimming: 'nadou',
  other: 'fez uma atividade intensa',
};

/**
 * Adaptação do treino do dia (P8.6, ADR-045): prontidão, esporte nas últimas/próximas 24 h,
 * dor e tempo disponível. Devolve o plano ajustado e a explicação.
 */
export function adaptWorkout(
  planned: readonly WorkoutExercise[],
  ctx: AdaptationContext,
): Adaptation {
  const ex: AdaptedExercise[] = planned.map((e) => ({
    ...e,
    originalSets: e.sets,
    removed: false,
    substitute: false,
  }));
  const explanation: string[] = [];
  let mode: Adaptation['mode'] = 'normal';
  let noRecords = false;
  const { score, band, drivers } = ctx.readiness;
  const why = drivers
    .filter((d) => d !== 'sport_yesterday')
    .slice(0, 2)
    .map((d) => DRIVER_LABELS[d]);
  const because = why.length > 0 ? ` (${why.join(', ')})` : '';

  if (band === 'yellow') {
    mode = 'reduced';
    noRecords = true;
    for (const e of ex) {
      e.sets = Math.max(1, e.sets - 1);
      e.targetRir = (e.targetRir ?? 2) + 1;
    }
    explanation.push(
      `Sua prontidão hoje está em ${String(score)}${because}: tirei a última série de cada exercício, deixei 1 repetição a mais de reserva e nada de tentar recorde.`,
    );
  } else if (band === 'red') {
    noRecords = true;
    if (ctx.redChoice === 'rest') {
      mode = 'rest';
      for (const e of ex) e.removed = true;
      explanation.push(
        `Sua prontidão hoje está em ${String(score)}${because}: hoje é dia de descanso ou mobilidade.`,
      );
    } else {
      mode = 'light';
      for (const e of ex) {
        e.sets = Math.max(1, Math.ceil(e.sets * 0.5));
        e.targetRir = 4;
      }
      explanation.push(
        `Sua prontidão hoje está em ${String(score)}${because}: sessão leve, com metade das séries e 4 repetições de reserva.`,
      );
    }
  }

  const lowerSession = ex.some(isLower);
  if (ctx.sportYesterday && lowerSession && mode !== 'rest') {
    const removedHinge: string[] = [];
    for (const e of ex) {
      if (!isLower(e) || e.removed) continue;
      if (e.movementPattern === 'hinge' && e.mechanics === 'compound') {
        e.removed = true;
        removedHinge.push(e.name);
      } else {
        e.sets = Math.max(1, Math.round(e.sets * 0.6));
      }
    }
    const verb = SPORT_LABELS[ctx.sportYesterday.sport] ?? SPORT_LABELS.other;
    explanation.push(
      `Reduzi o volume de pernas${removedHinge.length > 0 ? ` e tirei ${removedHinge.join(', ')}` : ''} porque você ${verb ?? ''} ontem com intensidade ${String(ctx.sportYesterday.rpe)}.`,
    );
  } else if (ctx.sportTomorrow && lowerSession && mode !== 'rest') {
    for (const e of ex)
      if (isLower(e) && !e.removed) e.sets = Math.max(1, Math.round(e.sets * 0.7));
    explanation.push('Aliviei as pernas porque há esporte nas próximas 24 horas.');
  }

  let seeProfessional = false;
  for (const p of ctx.pain.filter((x) => x.intensity >= 4)) {
    const link = PAIN_REGIONS[p.region];
    const hit = ex.filter(
      (e) =>
        !e.removed &&
        (e.primaryMuscles.some((m) => link.muscles.includes(m)) ||
          e.contraindicationTags.some((t) => link.tags.includes(t))),
    );
    for (const e of hit) e.substitute = true;
    if (p.intensity >= 7) seeProfessional = true;
    if (hit.length > 0) {
      explanation.push(
        `Marquei ${hit.map((e) => e.name).join(', ')} para substituir por causa da dor registrada.`,
      );
    }
  }
  if (seeProfessional) {
    explanation.push(
      'Dor forte registrada: procure avaliação de um profissional antes de progredir a carga.',
    );
  }

  if (ctx.availableMinutes !== null && mode !== 'rest') {
    const active = () => ex.filter((e) => !e.removed);
    const minutes = () =>
      estimateMinutes(active().map((e) => ({ sets: e.sets, restSeconds: e.restSeconds ?? 120 })));
    let cut = false;
    while (minutes() > ctx.availableMinutes) {
      const list = active();
      const iso = [...list]
        .reverse()
        .find((e, i) => e.mechanics === 'isolation' && i < list.length - 1);
      if (iso) {
        iso.removed = true;
        cut = true;
        continue;
      }
      const compound = [...list].reverse().find((e) => e.sets > 1);
      if (!compound) break;
      compound.sets -= 1;
      cut = true;
    }
    if (cut)
      explanation.push(`Ajustei a sessão para caber em ${String(ctx.availableMinutes)} minutos.`);
  }

  const changed = ex.some(
    (e) =>
      e.removed ||
      e.substitute ||
      e.sets !== e.originalSets ||
      e.targetRir !== planned.find((p) => p.exerciseId === e.exerciseId)?.targetRir,
  );
  return {
    mode,
    exercises: ex,
    changed,
    readinessAdapted: mode !== 'normal',
    noRecords,
    seeProfessional,
    explanation,
  };
}
