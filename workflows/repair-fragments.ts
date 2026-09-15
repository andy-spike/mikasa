function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === "string" ? error : "The embedding failed.";
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
  // Imported here, not at module scope, so the workflow build never walks the
  // helper's server imports and records their serde classes (a false-positive
  // "No class registration IIFE" warning on every build).
  const { repairFragmentsBody } = await import("./repair-fragments-body");
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
