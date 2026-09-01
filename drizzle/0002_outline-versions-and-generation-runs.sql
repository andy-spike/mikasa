CREATE TABLE "generation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"outline_version" integer NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"workflow_run_id" text,
	"current_step" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_specs" ADD COLUMN "outline_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
-- Existing specifications were aligned to their Course's current Outline version.
UPDATE "course_specs" SET "outline_version" = (
  SELECT MAX("version") FROM "outlines" WHERE "outlines"."course_id" = "course_specs"."course_id"
);--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "generation_runs_course_id_version_key" ON "generation_runs" USING btree ("course_id","outline_version");--> statement-breakpoint
CREATE INDEX "generation_runs_course_id_idx" ON "generation_runs" USING btree ("course_id");