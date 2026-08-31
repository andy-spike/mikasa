import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { OutlineEditor } from "@/components/outline-editor";
import { findCourse } from "@/lib/demo-library";

export default async function OutlinePage({
  params,
}: PageProps<"/courses/[courseId]/outline">) {
  const { courseId } = await params;
  const course = findCourse(courseId);
  if (!course) notFound();

  return (
    <AppShell section={course.topic}>
      <OutlineEditor course={course} />
    </AppShell>
  );
}
