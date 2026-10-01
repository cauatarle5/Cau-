ALTER TABLE "planned_workouts" DROP CONSTRAINT "planned_workouts_workout_template_id_workout_templates_id_fk";
--> statement-breakpoint
ALTER TABLE "planned_workouts" DROP CONSTRAINT "planned_workouts_mesocycle_id_mesocycles_id_fk";
--> statement-breakpoint
ALTER TABLE "planned_workouts" ALTER COLUMN "workout_template_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "planned_workouts" ADD COLUMN "program_id" uuid;--> statement-breakpoint
ALTER TABLE "planned_workouts" ADD COLUMN "template_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "planned_workouts" ADD CONSTRAINT "planned_workouts_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_workouts" ADD CONSTRAINT "planned_workouts_workout_template_id_workout_templates_id_fk" FOREIGN KEY ("workout_template_id") REFERENCES "public"."workout_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_workouts" ADD CONSTRAINT "planned_workouts_mesocycle_id_mesocycles_id_fk" FOREIGN KEY ("mesocycle_id") REFERENCES "public"."mesocycles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "planned_workouts" pw SET "template_name" = wt."name", "program_id" = wt."program_id" FROM "workout_templates" wt WHERE wt."id" = pw."workout_template_id";