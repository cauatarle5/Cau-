DROP INDEX "foods_source_ref_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "foods_source_ref_uq" ON "foods" USING btree ("source_code","source_ref");