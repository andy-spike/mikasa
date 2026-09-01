ALTER TABLE "change_plans" ADD COLUMN "published_revision_number" integer;--> statement-breakpoint
ALTER TABLE "change_plans" ADD COLUMN "touched_lessons" jsonb;--> statement-breakpoint
ALTER TABLE "change_plans" ADD COLUMN "touched_modules" jsonb;--> statement-breakpoint
ALTER TABLE "change_plans" ADD COLUMN "regenerated_lessons" jsonb;--> statement-breakpoint
ALTER TABLE "change_plans" ADD COLUMN "completion_snapshot" jsonb;