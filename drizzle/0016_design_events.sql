CREATE TABLE "design_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "design_events" ADD CONSTRAINT "design_events_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_events" ADD CONSTRAINT "design_events_run_id_design_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."design_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "design_events_course_id_idx" ON "design_events" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "design_events_run_id_idx" ON "design_events" USING btree ("run_id");
