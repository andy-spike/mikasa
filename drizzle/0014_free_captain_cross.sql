ALTER TABLE "generation_runs" ADD COLUMN "fragments_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "fragments_error" text;