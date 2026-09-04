// Re-embedding replaces fragments wholesale, so repair is safe to repeat.
import type { Db } from "@/lib/db";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === "string" ? error : "The embedding failed.";
}

// Injectable so tests run it directly without a Workflow engine.
export async function repairFragmentsBody(
  db: Db,
  embedTexts: (texts: string[]) => Promise<number[][]>,
  courseId: string,
  outlineVersion: number,
  lessonRefs: string[] | null,
): Promise<void> {
  const { embedCourseFragments, embedLessonFragments } = await import("@/lib/course/fragments");
  const { recordFragmentsStatus } = await import("@/lib/db/outline");
  if (lessonRefs && lessonRefs.length > 0) {
    await embedLessonFragments(db, embedTexts, courseId, outlineVersion, lessonRefs);
  } else {
    await embedCourseFragments(db, embedTexts, courseId, outlineVersion);
  }
  await recordFragmentsStatus(db, courseId, outlineVersion, "done");
}

async function stepRepairFragments(
  courseId: string,
  outlineVersion: number,
  lessonRefs: string[] | null,
): Promise<void> {
  "use step";
  const { db } = await import("@/lib/db");
  const { embedTexts } = await import("@/lib/model");
  const { recordFragmentsStatus } = await import("@/lib/db/outline");
  try {
    await repairFragmentsBody(db, embedTexts, courseId, outlineVersion, lessonRefs);
  } catch (error) {
    await recordFragmentsStatus(db, courseId, outlineVersion, "failed", errorMessage(error));
  }
}

export async function repairFragmentsWorkflow(
  courseId: string,
  outlineVersion: number,
  lessonRefs?: string[],
) {
  "use workflow";
  await stepRepairFragments(courseId, outlineVersion, lessonRefs ?? null);
}
