import { pgEnum } from 'drizzle-orm/pg-core';

export const sexEnum = pgEnum('sex', ['male', 'female']);
export const trainingExperienceEnum = pgEnum('training_experience', [
  'beginner',
  'intermediate',
  'advanced',
]);
export const activityLifestyleEnum = pgEnum('activity_lifestyle', [
  'sedentary',
  'light',
  'moderate',
  'high',
]);
export const availabilityKindEnum = pgEnum('availability_kind', ['gym', 'sport', 'any']);
export const equipmentLocationEnum = pgEnum('equipment_location', ['gym', 'home', 'other']);
export const primaryGoalEnum = pgEnum('primary_goal', [
  'fat_loss',
  'maintenance',
  'muscle_gain',
  'recomposition',
  'performance',
]);
export const sportCodeEnum = pgEnum('sport_code', [
  'football',
  'futsal',
  'running',
  'cycling',
  'swimming',
  'other',
]);
export const bodyFatMethodEnum = pgEnum('body_fat_method', [
  'bioimpedance',
  'skinfold',
  'dexa',
  'visual',
  'other',
]);
