CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"outline_version" integer NOT NULL,
	"lesson_ref" text NOT NULL,
	"title" text NOT NULL,
	"body" jsonb NOT NULL,
	"worked_example" jsonb NOT NULL,
	"recall_prompt" text NOT NULL,
	"self_explanation_prompt" text NOT NULL,
	"exercise" jsonb NOT NULL,
	"bridge" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lessons_course_version_ref_key" ON "lessons" USING btree ("course_id","outline_version","lesson_ref");--> statement-breakpoint
CREATE INDEX "lessons_course_id_idx" ON "lessons" USING btree ("course_id");