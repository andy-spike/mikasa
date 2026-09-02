/**
 * The Tutor search index's repair (bug 9). An embedding failure at
 * publication leaves the Course ready and the revision published — the
 * failure is only recorded — and this workflow finishes the job later:
 * the whole revision re-embeds, or exactly the named Lessons (restored
 * and removed ones after an undo). A re-run replaces fragments
 * wholesale, so the repair is always safe to repeat.
 */
import type { Db } from "@/lib/db";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === "string" ? error : "The embedding failed.";
}

/**
 * The repair body, injectable so tests run it directly (Vercel Workflow
 * does not execute locally): embeds the named Lessons — delete-only for
 * refs the version no longer has — or the whole revision, then records
 * the run's fragments state. The status write is skipped when the
 * version has no run (an undo's version), since the missing rows are
 * what the reading page's check looks for.
 */
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
    /* The Course stays exactly as it is; the failure is recorded for the
       reading page's rebuild control to find again. */
    await recordFragmentsStatus(db, courseId, outlineVersion, "failed", errorMessage(error));
  }
}

/**
 * One durable repair pass. `lessonRefs` narrows the work to the affected
 * Lessons; absent or empty, the whole revision re-embeds.
 */
export async function repairFragmentsWorkflow(
  courseId: string,
  outlineVersion: number,
  lessonRefs?: string[],
) {
  "use workflow";
  await stepRepairFragments(courseId, outlineVersion, lessonRefs ?? null);
}
