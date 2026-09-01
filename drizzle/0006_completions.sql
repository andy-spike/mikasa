CREATE TABLE "completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"lesson_ref" text NOT NULL,
	"done_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "completions" ADD CONSTRAINT "completions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "completions_course_lesson_key" ON "completions" USING btree ("course_id","lesson_ref");--> statement-breakpoint
CREATE INDEX "completions_course_id_idx" ON "completions" USING btree ("course_id");