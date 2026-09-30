CREATE TYPE "public"."day_type" AS ENUM('rest', 'training', 'hard_training', 'sport', 'sport_and_training');--> statement-breakpoint
CREATE TYPE "public"."food_base_unit" AS ENUM('g', 'ml');--> statement-breakpoint
CREATE TYPE "public"."food_category" AS ENUM('cereals', 'legumes', 'meats', 'poultry', 'fish', 'eggs', 'dairy', 'fruits', 'vegetables', 'tubers', 'fats_oils', 'sweets', 'beverages', 'supplements', 'prepared', 'other');--> statement-breakpoint
CREATE TYPE "public"."food_source_code" AS ENUM('taco', 'tbca', 'usda', 'off', 'user', 'recipe');--> statement-breakpoint
CREATE TYPE "public"."food_state" AS ENUM('raw', 'cooked', 'grilled', 'fried', 'boiled', 'roasted', 'ready');--> statement-breakpoint
CREATE TYPE "public"."household_unit" AS ENUM('unit', 'slice', 'tbsp', 'tsp', 'cup', 'scoop', 'ladle', 'portion', 'pinch', 'glass', 'can', 'small', 'medium', 'large');--> statement-breakpoint
CREATE TYPE "public"."meal_slot" AS ENUM('breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'pre_workout', 'post_workout', 'dinner', 'supper', 'other');--> statement-breakpoint
CREATE TYPE "public"."meal_status" AS ENUM('planned', 'logged');--> statement-breakpoint
CREATE TYPE "public"."target_method" AS ENUM('formula', 'adaptive');--> statement-breakpoint
CREATE TABLE "food_aliases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"food_id" uuid NOT NULL,
	"user_id" uuid,
	"alias_normalized" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_nutrients" (
	"food_id" uuid PRIMARY KEY NOT NULL,
	"kcal" double precision NOT NULL,
	"protein_g" double precision,
	"carbs_g" double precision,
	"fat_g" double precision,
	"fiber_g" double precision,
	"sugar_g" double precision,
	"saturated_fat_g" double precision,
	"sodium_mg" double precision,
	"potassium_mg" double precision,
	"calcium_mg" double precision,
	"iron_mg" double precision,
	"cholesterol_mg" double precision
);
--> statement-breakpoint
CREATE TABLE "food_sources" (
	"code" "food_source_code" PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"license_note" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"source_code" "food_source_code" NOT NULL,
	"source_ref" text,
	"name_pt" text NOT NULL,
	"name_normalized" text NOT NULL,
	"brand" text,
	"category" "food_category" NOT NULL,
	"state" "food_state" NOT NULL,
	"default_unit" "food_base_unit" DEFAULT 'g' NOT NULL,
	"density_g_per_ml" double precision,
	"is_verified" boolean DEFAULT false NOT NULL,
	"barcode" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_measures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"food_id" uuid,
	"user_id" uuid,
	"unit_code" "household_unit" NOT NULL,
	"label_pt" text NOT NULL,
	"grams" double precision NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_food_usage" (
	"user_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"times_used" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_quantity_g" double precision,
	"last_unit_code" text,
	CONSTRAINT "user_food_usage_user_id_food_id_pk" PRIMARY KEY("user_id","food_id")
);
--> statement-breakpoint
CREATE TABLE "meal_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"meal_id" uuid NOT NULL,
	"food_id" uuid,
	"recipe_id" uuid,
	"food_name" text NOT NULL,
	"quantity" double precision NOT NULL,
	"unit_code" text NOT NULL,
	"grams" double precision NOT NULL,
	"nutrients_snapshot" jsonb NOT NULL,
	"parse_confidence" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"slot" "meal_slot" NOT NULL,
	"status" "meal_status" NOT NULL,
	"eaten_at" timestamp with time zone,
	"name" text,
	"notes" text,
	"source_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "nutrition_targets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"day_type" "day_type" NOT NULL,
	"day_type_overridden" boolean DEFAULT false NOT NULL,
	"kcal" double precision NOT NULL,
	"protein_g" double precision NOT NULL,
	"carbs_g" double precision NOT NULL,
	"fat_g" double precision NOT NULL,
	"fiber_g" double precision NOT NULL,
	"water_ml" double precision NOT NULL,
	"method" "target_method" NOT NULL,
	"inputs" jsonb NOT NULL,
	"goal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parser_feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"input_text" text NOT NULL,
	"parsed" jsonb NOT NULL,
	"corrected" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "water_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"ml" double precision NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "food_aliases" ADD CONSTRAINT "food_aliases_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_aliases" ADD CONSTRAINT "food_aliases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_nutrients" ADD CONSTRAINT "food_nutrients_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_measures" ADD CONSTRAINT "household_measures_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_measures" ADD CONSTRAINT "household_measures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_food_usage" ADD CONSTRAINT "user_food_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_food_usage" ADD CONSTRAINT "user_food_usage_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_targets" ADD CONSTRAINT "nutrition_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_targets" ADD CONSTRAINT "nutrition_targets_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parser_feedback" ADD CONSTRAINT "parser_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "water_logs" ADD CONSTRAINT "water_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_aliases_trgm_idx" ON "food_aliases" USING gin ("alias_normalized" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "food_aliases_food_idx" ON "food_aliases" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "foods_name_trgm_idx" ON "foods" USING gin ("name_normalized" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "foods_user_id_idx" ON "foods" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "foods_source_ref_idx" ON "foods" USING btree ("source_code","source_ref");--> statement-breakpoint
CREATE INDEX "household_measures_food_idx" ON "household_measures" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "household_measures_user_idx" ON "household_measures" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "meal_items_meal_idx" ON "meal_items" USING btree ("meal_id");--> statement-breakpoint
CREATE INDEX "meals_user_date_idx" ON "meals" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "meals_user_status_date_idx" ON "meals" USING btree ("user_id","status","date");--> statement-breakpoint
CREATE UNIQUE INDEX "nutrition_targets_user_date_uq" ON "nutrition_targets" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "parser_feedback_user_idx" ON "parser_feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "water_logs_user_date_idx" ON "water_logs" USING btree ("user_id","date");