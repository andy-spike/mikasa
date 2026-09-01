CREATE TABLE "course_specs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"spec" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"workflow_run_id" text,
	"current_step" text DEFAULT 'sources' NOT NULL,
	"error" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outlines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"ref" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"excerpt" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "courses" ALTER COLUMN "grounding" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "courses" ALTER COLUMN "status" SET DEFAULT 'designing';--> statement-breakpoint
ALTER TABLE "course_specs" ADD CONSTRAINT "course_specs_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_runs" ADD CONSTRAINT "design_runs_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlines" ADD CONSTRAINT "outlines_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "course_specs_course_id_key" ON "course_specs" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "design_runs_course_id_idx" ON "design_runs" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outlines_course_id_version_key" ON "outlines" USING btree ("course_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_course_id_url_key" ON "sources" USING btree ("course_id","url");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_course_id_ref_key" ON "sources" USING btree ("course_id","ref");--> statement-breakpoint
-- Courses created before design state existed read as their nearest
-- documented state: "outline" was the Outline checkpoint, "reading" the
-- generated Course.
UPDATE "courses" SET "status" = 'awaiting-outline-approval' WHERE "status" = 'outline';
--> statement-breakpoint
UPDATE "courses" SET "status" = 'ready' WHERE "status" = 'reading';
