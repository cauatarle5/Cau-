ALTER TABLE "workout_sessions" ADD COLUMN "adapted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "adaptation_note" text;