CREATE TYPE "public"."energy_confidence" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."insight_category" AS ENUM('training', 'nutrition', 'body', 'recovery', 'integration');--> statement-breakpoint
CREATE TYPE "public"."insight_severity" AS ENUM('info', 'attention', 'warning');--> statement-breakpoint
CREATE TYPE "public"."insight_status" AS ENUM('new', 'seen', 'dismissed', 'acted');--> statement-breakpoint
CREATE TABLE "energy_estimates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"tdee_formula" double precision NOT NULL,
	"tdee_observed" double precision,
	"tdee_used" double precision NOT NULL,
	"confidence" "energy_confidence" NOT NULL,
	"weight_trend_kg" double precision,
	"intake_avg_kcal" double precision,
	"logged_days" smallint NOT NULL,
	"weigh_in_count" smallint NOT NULL,
	"inputs" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"category" "insight_category" NOT NULL,
	"type" text NOT NULL,
	"dedup_key" text NOT NULL,
	"severity" "insight_severity" NOT NULL,
	"title_pt" text NOT NULL,
	"body_pt" text NOT NULL,
	"data" jsonb NOT NULL,
	"status" "insight_status" DEFAULT 'new' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "energy_estimates" ADD CONSTRAINT "energy_estimates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "energy_estimates_user_week_uq" ON "energy_estimates" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "insights_user_type_key_uq" ON "insights" USING btree ("user_id","type","dedup_key");--> statement-breakpoint
CREATE INDEX "insights_user_status_idx" ON "insights" USING btree ("user_id","status","expires_at");