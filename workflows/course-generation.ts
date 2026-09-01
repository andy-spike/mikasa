/**
 * Durable Course generation (ADR 0005), started by Outline approval
 * (ticket #4). Ticket #5 fills in the Lesson work: every Lesson in
 * dependency order, one Module at a time, from the reconciled
 * specification and shared Sources.
 *
 * This stub pins the run to the Outline version it was approved for and
 * stops there, so the state the product reports ("generating") is honest:
 * a run exists, the Course waits, and retry (ticket #7) can address it.
 */
async function stepMarkGenerationStep(runId: string, step: string): Promise<void> {
  "use step";
  const { db } = await import("@/lib/db");
  const { generationRuns } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  await db
    .update(generationRuns)
    .set({ currentStep: step, updatedAt: new Date() })
    .where(eq(generationRuns.id, runId));
}

export async function generateCourseWorkflow(
  courseId: string,
  runId: string,
  outlineVersion: number,
) {
  "use workflow";

  await stepMarkGenerationStep(runId, "lessons");
  return { ok: false as const, reason: "generation-not-implemented", outlineVersion };
}
