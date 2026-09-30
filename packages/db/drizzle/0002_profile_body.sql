CREATE TYPE "public"."activity_lifestyle" AS ENUM('sedentary', 'light', 'moderate', 'high');--> statement-breakpoint
CREATE TYPE "public"."availability_kind" AS ENUM('gym', 'sport', 'any');--> statement-breakpoint
CREATE TYPE "public"."body_fat_method" AS ENUM('bioimpedance', 'skinfold', 'dexa', 'visual', 'other');--> statement-breakpoint
CREATE TYPE "public"."equipment_location" AS ENUM('gym', 'home', 'other');--> statement-breakpoint
CREATE TYPE "public"."primary_goal" AS ENUM('fat_loss', 'maintenance', 'muscle_gain', 'recomposition', 'performance');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."sport_code" AS ENUM('football', 'futsal', 'running', 'cycling', 'swimming', 'other');--> statement-breakpoint
CREATE TYPE "public"."training_experience" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TABLE "availability" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" time,
	"end_time" time,
	"max_minutes" smallint NOT NULL,
	"kind" "availability_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"code" text PRIMARY KEY NOT NULL,
	"name_pt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_access" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"equipment_code" text NOT NULL,
	"location" "equipment_location" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"primary_goal" "primary_goal" NOT NULL,
	"target_weight_kg" double precision,
	"target_body_fat_pct" double precision,
	"target_rate_pct_per_week" double precision,
	"protein_g_per_kg" double precision,
	"training_focus" text,
	"effective_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "limitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"body_region" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"severity" smallint NOT NULL,
	"contraindicated_patterns" text[] DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"started_at" date,
	"resolved_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"sex" "sex" NOT NULL,
	"birth_date" date NOT NULL,
	"height_cm" double precision NOT NULL,
	"training_experience" "training_experience" NOT NULL,
	"training_age_years" double precision,
	"conditioning_level" smallint NOT NULL,
	"activity_lifestyle" "activity_lifestyle" NOT NULL,
	"aesthetic_priorities" text[] DEFAULT '{}' NOT NULL,
	"performance_priorities" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"clinical_condition" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"sport_code" "sport_code" NOT NULL,
	"weekly_frequency" smallint NOT NULL,
	"typical_duration_min" smallint NOT NULL,
	"typical_intensity" smallint NOT NULL,
	"weekday_hint" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "body_measurements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"measured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"date" date NOT NULL,
	"weight_kg" double precision,
	"body_fat_pct" double precision,
	"body_fat_method" "body_fat_method",
	"waist_cm" double precision,
	"hip_cm" double precision,
	"chest_cm" double precision,
	"arm_l_cm" double precision,
	"arm_r_cm" double precision,
	"thigh_l_cm" double precision,
	"thigh_r_cm" double precision,
	"calf_cm" double precision,
	"neck_cm" double precision,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "availability" ADD CONSTRAINT "availability_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_access" ADD CONSTRAINT "equipment_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_access" ADD CONSTRAINT "equipment_access_equipment_code_equipment_code_fk" FOREIGN KEY ("equipment_code") REFERENCES "public"."equipment"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "limitations" ADD CONSTRAINT "limitations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports" ADD CONSTRAINT "sports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_user_id_idx" ON "availability" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "equipment_access_user_id_idx" ON "equipment_access" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "goals_user_id_effective_idx" ON "goals" USING btree ("user_id","effective_from");--> statement-breakpoint
CREATE INDEX "limitations_user_id_idx" ON "limitations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sports_user_id_idx" ON "sports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "body_measurements_user_date_idx" ON "body_measurements" USING btree ("user_id","date");