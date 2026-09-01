-- The pgvector extension (Neon guide: /docs/extensions/pgvector), enabled
-- per database. Exact cosine retrieval needs no index, so none is created.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "lesson_fragments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"lesson_ref" text NOT NULL,
	"ordinal" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(768) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_fragments" ADD CONSTRAINT "lesson_fragments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_fragments_course_id_idx" ON "lesson_fragments" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "lesson_fragments_course_lesson_idx" ON "lesson_fragments" USING btree ("course_id","lesson_ref");