export type MealSlotCode =
  | 'breakfast'
  | 'morning_snack'
  | 'lunch'
  | 'afternoon_snack'
  | 'pre_workout'
  | 'post_workout'
  | 'dinner'
  | 'supper'
  | 'other';

/** Refeição sugerida pela hora local (P12.4, editável pelo usuário). */
export function suggestSlot(hour: number): MealSlotCode {
  if (hour >= 5 && hour < 10) return 'breakfast';
  if (hour >= 10 && hour < 12) return 'morning_snack';
  if (hour >= 12 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 18) return 'afternoon_snack';
  if (hour >= 18 && hour < 22) return 'dinner';
  return 'supper';
}
