DROP INDEX "tailor_conversations_course_id_key";--> statement-breakpoint
DROP INDEX "tutor_conversations_course_lesson_key";--> statement-breakpoint
DROP INDEX "tutor_conversations_course_id_idx";--> statement-breakpoint
CREATE INDEX "tailor_conversations_course_id_idx" ON "tailor_conversations" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "tutor_conversations_course_lesson_idx" ON "tutor_conversations" USING btree ("course_id","lesson_ref");