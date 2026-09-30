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
