import type { MuscleCode } from './volume';

export type Preference = 'like' | 'neutral' | 'dislike' | 'avoid';

export interface ExerciseLite {
  id: string;
  movementPattern: string;
  mechanics: 'compound' | 'isolation';
  equipmentCodes: readonly string[];
  contraindicationTags: readonly string[];
  primaryMuscles: readonly MuscleCode[];
}

export interface AlternativeContext {
  /** Equipamentos do usuário; `null`/vazio = sem restrição. */
  availableEquipment: ReadonlySet<string> | null;
  preferences: ReadonlyMap<string, Preference>;
  /** Padrões contraindicados pelas limitações ativas. */
  contraindicated: ReadonlySet<string>;
}

/**
 * Alternativas para substituir um exercício (P8.4/P12.3): mesmo padrão de movimento e/ou
 * músculo primário, com equipamento disponível, sem `avoid` nem contraindicação; `like`
 * primeiro, `dislike` por último.
 */
export function rankAlternatives(
  target: ExerciseLite,
  candidates: readonly ExerciseLite[],
  ctx: AlternativeContext,
) {
  const hasEquipment = (e: ExerciseLite) =>
    !ctx.availableEquipment ||
    ctx.availableEquipment.size === 0 ||
    e.equipmentCodes.every((c) => c === 'bodyweight' || ctx.availableEquipment?.has(c));

  return candidates
    .filter((c) => c.id !== target.id)
    .filter((c) => ctx.preferences.get(c.id) !== 'avoid')
    .filter((c) => !c.contraindicationTags.some((t) => ctx.contraindicated.has(t)))
    .filter(hasEquipment)
    .map((c) => {
      const samePattern = c.movementPattern === target.movementPattern;
      const sharedPrimary = c.primaryMuscles.some((m) => target.primaryMuscles.includes(m));
      if (!samePattern && !sharedPrimary) return null;
      const pref = ctx.preferences.get(c.id);
      const score =
        (samePattern ? 2 : 0) +
        (sharedPrimary ? 2 : 0) +
        (c.mechanics === target.mechanics ? 0.5 : 0) +
        (pref === 'like' ? 1 : pref === 'dislike' ? -1 : 0);
      return { exercise: c, score };
    })
    .filter((x): x is { exercise: ExerciseLite; score: number } => x !== null)
    .sort((a, b) => b.score - a.score);
}
