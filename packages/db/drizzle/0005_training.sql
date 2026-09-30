CREATE TYPE "public"."exercise_preference" AS ENUM('like', 'neutral', 'dislike', 'avoid');--> statement-breakpoint
CREATE TYPE "public"."generated_by" AS ENUM('rules', 'ai_assisted', 'manual');--> statement-breakpoint
CREATE TYPE "public"."laterality" AS ENUM('bilateral', 'unilateral');--> statement-breakpoint
CREATE TYPE "public"."load_type" AS ENUM('external', 'bodyweight', 'assisted', 'time');--> statement-breakpoint
CREATE TYPE "public"."mechanics" AS ENUM('compound', 'isolation');--> statement-breakpoint
CREATE TYPE "public"."movement_pattern" AS ENUM('horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull', 'squat', 'hinge', 'lunge', 'isolation_upper', 'isolation_lower', 'core', 'carry', 'cardio');--> statement-breakpoint
CREATE TYPE "public"."muscle_group" AS ENUM('push', 'pull', 'legs', 'core');--> statement-breakpoint
CREATE TYPE "public"."muscle_region" AS ENUM('upper', 'lower', 'core');--> statement-breakpoint
CREATE TYPE "public"."muscle_role" AS ENUM('primary', 'secondary');--> statement-breakpoint
CREATE TYPE "public"."program_status" AS ENUM('draft', 'active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."record_type" AS ENUM('e1rm', 'max_load', 'rep_at_load', 'volume_session');--> statement-breakpoint
CREATE TYPE "public"."session_exercise_status" AS ENUM('pending', 'done', 'skipped', 'substituted');--> statement-breakpoint
CREATE TYPE "public"."session_source" AS ENUM('app', 'offline_sync', 'import');--> statement-breakpoint
CREATE TYPE "public"."set_type" AS ENUM('warmup', 'working', 'drop', 'failure', 'backoff');--> statement-breakpoint
CREATE TABLE "exercise_muscles" (
	"exercise_id" uuid NOT NULL,
	"muscle_code" text NOT NULL,
	"role" "muscle_role" NOT NULL,
	"weight" double precision NOT NULL,
	CONSTRAINT "exercise_muscles_exercise_id_muscle_code_pk" PRIMARY KEY("exercise_id","muscle_code")
);
--> statement-breakpoint
CREATE TABLE "exercise_preferences" (
	"user_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"preference" "exercise_preference" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_preferences_user_id_exercise_id_pk" PRIMARY KEY("user_id","exercise_id")
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"name_pt" text NOT NULL,
	"name_normalized" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"movement_pattern" "movement_pattern" NOT NULL,
	"mechanics" "mechanics" NOT NULL,
	"laterality" "laterality" NOT NULL,
	"equipment_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"load_type" "load_type" NOT NULL,
	"default_increment_kg" double precision NOT NULL,
	"contraindication_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"instructions" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status_code" smallint NOT NULL,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "muscles" (
	"code" text PRIMARY KEY NOT NULL,
	"name_pt" text NOT NULL,
	"group" "muscle_group" NOT NULL,
	"region" "muscle_region" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"record_type" "record_type" NOT NULL,
	"value" double precision NOT NULL,
	"reps" smallint,
	"load_kg" double precision,
	"set_log_id" uuid,
	"session_id" uuid,
	"achieved_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"goal_snapshot" jsonb,
	"start_date" date,
	"end_date" date,
	"status" "program_status" DEFAULT 'draft' NOT NULL,
	"generated_by" "generated_by" DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"order" smallint NOT NULL,
	"exercise_id" uuid NOT NULL,
	"exercise_name" text NOT NULL,
	"template_exercise_id" uuid,
	"substituted_from_exercise_id" uuid,
	"status" "session_exercise_status" DEFAULT 'pending' NOT NULL,
	"skip_reason" text,
	"target_sets" smallint,
	"rep_min" smallint,
	"rep_max" smallint,
	"target_rir" smallint,
	"rest_seconds" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "set_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_exercise_id" uuid NOT NULL,
	"set_index" smallint NOT NULL,
	"set_type" "set_type" DEFAULT 'working' NOT NULL,
	"reps" smallint,
	"load_kg" double precision,
	"rir" smallint,
	"rpe" double precision,
	"rest_seconds" integer,
	"duration_seconds" integer,
	"completed" boolean DEFAULT true NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workout_template_id" uuid NOT NULL,
	"order" smallint NOT NULL,
	"exercise_id" uuid NOT NULL,
	"sets" smallint NOT NULL,
	"rep_min" smallint NOT NULL,
	"rep_max" smallint NOT NULL,
	"target_rir" smallint,
	"rest_seconds" integer,
	"superset_group" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"workout_template_id" uuid,
	"name" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_min" integer,
	"session_rpe" smallint,
	"perceived_difficulty" smallint,
	"notes" text,
	"source" "session_source" DEFAULT 'app' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workout_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"program_id" uuid NOT NULL,
	"name" text NOT NULL,
	"day_order" smallint NOT NULL,
	"focus_muscles" text[] DEFAULT '{}'::text[] NOT NULL,
	"estimated_minutes" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercise_muscles" ADD CONSTRAINT "exercise_muscles_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_muscles" ADD CONSTRAINT "exercise_muscles_muscle_code_muscles_code_fk" FOREIGN KEY ("muscle_code") REFERENCES "public"."muscles"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_preferences" ADD CONSTRAINT "exercise_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_preferences" ADD CONSTRAINT "exercise_preferences_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_set_log_id_set_logs_id_fk" FOREIGN KEY ("set_log_id") REFERENCES "public"."set_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_template_exercise_id_template_exercises_id_fk" FOREIGN KEY ("template_exercise_id") REFERENCES "public"."template_exercises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_substituted_from_exercise_id_exercises_id_fk" FOREIGN KEY ("substituted_from_exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_session_exercise_id_session_exercises_id_fk" FOREIGN KEY ("session_exercise_id") REFERENCES "public"."session_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_exercises" ADD CONSTRAINT "template_exercises_workout_template_id_workout_templates_id_fk" FOREIGN KEY ("workout_template_id") REFERENCES "public"."workout_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_exercises" ADD CONSTRAINT "template_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_workout_template_id_workout_templates_id_fk" FOREIGN KEY ("workout_template_id") REFERENCES "public"."workout_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercise_muscles_muscle_idx" ON "exercise_muscles" USING btree ("muscle_code");--> statement-breakpoint
CREATE INDEX "exercises_user_idx" ON "exercises" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_system_name_uq" ON "exercises" USING btree ("name_normalized") WHERE "exercises"."user_id" is null;--> statement-breakpoint
CREATE INDEX "exercises_name_trgm_idx" ON "exercises" USING gin ("name_normalized" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idempotency_keys_created_idx" ON "idempotency_keys" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "personal_records_user_exercise_idx" ON "personal_records" USING btree ("user_id","exercise_id","record_type");--> statement-breakpoint
CREATE INDEX "programs_user_status_idx" ON "programs" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "programs_one_active_uq" ON "programs" USING btree ("user_id") WHERE "programs"."status" = 'active';--> statement-breakpoint
CREATE INDEX "session_exercises_session_idx" ON "session_exercises" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_exercises_exercise_session_idx" ON "session_exercises" USING btree ("exercise_id","session_id");--> statement-breakpoint
CREATE INDEX "set_logs_session_exercise_idx" ON "set_logs" USING btree ("session_exercise_id","logged_at");--> statement-breakpoint
CREATE INDEX "template_exercises_template_idx" ON "template_exercises" USING btree ("workout_template_id");--> statement-breakpoint
CREATE INDEX "workout_sessions_user_date_idx" ON "workout_sessions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "workout_templates_program_idx" ON "workout_templates" USING btree ("program_id");