CREATE TYPE "public"."activity_source" AS ENUM('manual', 'wearable');--> statement-breakpoint
CREATE TYPE "public"."mesocycle_phase" AS ENUM('accumulation', 'intensification', 'realization', 'deload');--> statement-breakpoint
CREATE TYPE "public"."pain_region" AS ENUM('shoulder', 'elbow', 'wrist', 'lower_back', 'hip', 'knee', 'ankle', 'neck', 'other');--> statement-breakpoint
CREATE TYPE "public"."pain_type" AS ENUM('joint', 'muscle', 'other');--> statement-breakpoint
CREATE TYPE "public"."planned_workout_status" AS ENUM('planned', 'done', 'skipped', 'moved', 'adapted');--> statement-breakpoint
CREATE TABLE "mesocycles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"program_id" uuid NOT NULL,
	"order" smallint NOT NULL,
	"name" text NOT NULL,
	"phase" "mesocycle_phase" NOT NULL,
	"weeks" smallint NOT NULL,
	"start_date" date NOT NULL,
	"rir_progression" integer[] NOT NULL,
	"volume_progression" double precision[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planned_workouts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"workout_template_id" uuid NOT NULL,
	"mesocycle_id" uuid,
	"week_index" smallint NOT NULL,
	"status" "planned_workout_status" DEFAULT 'planned' NOT NULL,
	"adaptation_reason" text,
	"adapted_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"started_at" timestamp with time zone,
	"sport_code" "sport_code" NOT NULL,
	"duration_min" smallint NOT NULL,
	"intensity_rpe" smallint NOT NULL,
	"distance_km" double precision,
	"avg_hr" smallint,
	"kcal_reported" double precision,
	"lower_body_demand" smallint NOT NULL,
	"notes" text,
	"source" "activity_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "daily_checkins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"sleep_hours" double precision,
	"sleep_quality" smallint NOT NULL,
	"energy" smallint NOT NULL,
	"stress" smallint NOT NULL,
	"fatigue" smallint NOT NULL,
	"soreness" smallint NOT NULL,
	"soreness_regions" text[] DEFAULT '{}'::text[] NOT NULL,
	"available_minutes" smallint,
	"notes" text,
	"readiness_score" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pain_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"session_id" uuid,
	"body_region" "pain_region" NOT NULL,
	"intensity" smallint NOT NULL,
	"during_exercise_id" uuid,
	"type" "pain_type" DEFAULT 'other' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "planned_workout_id" uuid;--> statement-breakpoint
ALTER TABLE "mesocycles" ADD CONSTRAINT "mesocycles_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_workouts" ADD CONSTRAINT "planned_workouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_workouts" ADD CONSTRAINT "planned_workouts_workout_template_id_workout_templates_id_fk" FOREIGN KEY ("workout_template_id") REFERENCES "public"."workout_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_workouts" ADD CONSTRAINT "planned_workouts_mesocycle_id_mesocycles_id_fk" FOREIGN KEY ("mesocycle_id") REFERENCES "public"."mesocycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_checkins" ADD CONSTRAINT "daily_checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pain_reports" ADD CONSTRAINT "pain_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pain_reports" ADD CONSTRAINT "pain_reports_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pain_reports" ADD CONSTRAINT "pain_reports_during_exercise_id_exercises_id_fk" FOREIGN KEY ("during_exercise_id") REFERENCES "public"."exercises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mesocycles_program_idx" ON "mesocycles" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "planned_workouts_user_date_idx" ON "planned_workouts" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "planned_workouts_user_status_date_idx" ON "planned_workouts" USING btree ("user_id","status","date");--> statement-breakpoint
CREATE INDEX "activities_user_date_idx" ON "activities" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_checkins_user_date_uq" ON "daily_checkins" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "pain_reports_user_date_idx" ON "pain_reports" USING btree ("user_id","date");--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_planned_workout_id_planned_workouts_id_fk" FOREIGN KEY ("planned_workout_id") REFERENCES "public"."planned_workouts"("id") ON DELETE set null ON UPDATE no action;