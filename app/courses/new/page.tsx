import { AppShell } from "@/components/app-shell";
import { NewCourseForm } from "@/components/new-course-form";
import { requireLearner } from "@/lib/session";

export default async function NewCoursePage() {
  await requireLearner();

  return (
    <AppShell section="New Course">
      <NewCourseForm />
    </AppShell>
  );
}
