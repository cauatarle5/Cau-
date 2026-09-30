export type Sex = 'male' | 'female';
export type BodyFatMethod = 'bioimpedance' | 'skinfold' | 'dexa' | 'visual' | 'other';
export type ActivityLifestyle = 'sedentary' | 'light' | 'moderate' | 'high';
export type TrainingExperience = 'beginner' | 'intermediate' | 'advanced';
export type PrimaryGoal =
  'fat_loss' | 'maintenance' | 'muscle_gain' | 'recomposition' | 'performance';
export type SportCode = 'football' | 'futsal' | 'running' | 'cycling' | 'swimming' | 'other';

/** Fatores kcal/g (PROMPT_MESTRE 5.6). */
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;
/** kcal por kg de variação de peso (PROMPT_MESTRE 5.3/5.4). */
export const KCAL_PER_KG = 7700;
