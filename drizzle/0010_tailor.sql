CREATE TABLE "change_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"undo" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"base_outline_version" integer NOT NULL,
	"base_revision_number" integer,
	"status" text DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tailor_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tailor_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "change_operations" ADD CONSTRAINT "change_operations_plan_id_change_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."change_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_plans" ADD CONSTRAINT "change_plans_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailor_conversations" ADD CONSTRAINT "tailor_conversations_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailor_messages" ADD CONSTRAINT "tailor_messages_conversation_id_tailor_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."tailor_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "change_operations_plan_position_key" ON "change_operations" USING btree ("plan_id","position");--> statement-breakpoint
CREATE INDEX "change_plans_course_id_idx" ON "change_plans" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tailor_conversations_course_id_key" ON "tailor_conversations" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tailor_messages_conversation_seq_key" ON "tailor_messages" USING btree ("conversation_id","seq");