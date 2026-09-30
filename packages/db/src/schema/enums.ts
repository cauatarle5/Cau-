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
export const foodSourceCodeEnum = pgEnum('food_source_code', [
  'taco',
  'tbca',
  'usda',
  'off',
  'user',
  'recipe',
]);
export const foodCategoryEnum = pgEnum('food_category', [
  'cereals',
  'legumes',
  'meats',
  'poultry',
  'fish',
  'eggs',
  'dairy',
  'fruits',
  'vegetables',
  'tubers',
  'fats_oils',
  'sweets',
  'beverages',
  'supplements',
  'prepared',
  'other',
]);
export const foodStateEnum = pgEnum('food_state', [
  'raw',
  'cooked',
  'grilled',
  'fried',
  'boiled',
  'roasted',
  'ready',
]);
export const foodBaseUnitEnum = pgEnum('food_base_unit', ['g', 'ml']);
export const householdUnitEnum = pgEnum('household_unit', [
  'unit',
  'slice',
  'tbsp',
  'tsp',
  'cup',
  'scoop',
  'ladle',
  'portion',
  'pinch',
  'glass',
  'can',
  'small',
  'medium',
  'large',
]);
export const mealSlotEnum = pgEnum('meal_slot', [
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
export const mealStatusEnum = pgEnum('meal_status', ['planned', 'logged']);
export const dayTypeEnum = pgEnum('day_type', [
  'rest',
  'training',
  'hard_training',
  'sport',
  'sport_and_training',
]);
export const targetMethodEnum = pgEnum('target_method', ['formula', 'adaptive']);
export const movementPatternEnum = pgEnum('movement_pattern', [
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'squat',
  'hinge',
  'lunge',
  'isolation_upper',
  'isolation_lower',
  'core',
  'carry',
  'cardio',
]);
export const mechanicsEnum = pgEnum('mechanics', ['compound', 'isolation']);
export const lateralityEnum = pgEnum('laterality', ['bilateral', 'unilateral']);
export const loadTypeEnum = pgEnum('load_type', ['external', 'bodyweight', 'assisted', 'time']);
export const muscleGroupEnum = pgEnum('muscle_group', ['push', 'pull', 'legs', 'core']);
export const muscleRegionEnum = pgEnum('muscle_region', ['upper', 'lower', 'core']);
export const muscleRoleEnum = pgEnum('muscle_role', ['primary', 'secondary']);
export const exercisePreferenceEnum = pgEnum('exercise_preference', [
  'like',
  'neutral',
  'dislike',
  'avoid',
]);
export const programStatusEnum = pgEnum('program_status', [
  'draft',
  'active',
  'completed',
  'archived',
]);
export const generatedByEnum = pgEnum('generated_by', ['rules', 'ai_assisted', 'manual']);
export const sessionSourceEnum = pgEnum('session_source', ['app', 'offline_sync', 'import']);
export const sessionExerciseStatusEnum = pgEnum('session_exercise_status', [
  'pending',
  'done',
  'skipped',
  'substituted',
]);
export const setTypeEnum = pgEnum('set_type', ['warmup', 'working', 'drop', 'failure', 'backoff']);
export const recordTypeEnum = pgEnum('record_type', [
  'e1rm',
  'max_load',
  'rep_at_load',
  'volume_session',
]);
