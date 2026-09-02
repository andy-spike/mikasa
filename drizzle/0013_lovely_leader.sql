DROP INDEX "course_specs_course_id_key";--> statement-breakpoint
CREATE UNIQUE INDEX "course_specs_course_outline_key" ON "course_specs" USING btree ("course_id","outline_version");--> statement-breakpoint
CREATE INDEX "course_specs_course_id_idx" ON "course_specs" USING btree ("course_id");