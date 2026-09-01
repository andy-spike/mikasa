CREATE TABLE "code_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"outline_version" integer NOT NULL,
	"round" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "code_verifications" ADD CONSTRAINT "code_verifications_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "code_verifications_course_version_round_key" ON "code_verifications" USING btree ("course_id","outline_version","round");--> statement-breakpoint
CREATE INDEX "code_verifications_course_id_idx" ON "code_verifications" USING btree ("course_id");