import { and, desc, eq, max } from "drizzle-orm";
import type { Db } from "./index";
import {
  courses,
  codeVerifications,
  generationRuns,
  lessons,
  outlines,
  reviewFindings,
  reviewRuns,
  revisions,
  sources,
  type CodeVerification,
  type Course,
  type Revision,
  type ReviewFindingRow,
  type ReviewRun,
} from "./schema";
import type { Finding, FindingKind } from "../course/review";
import { outlineApprovalProblems } from "@/lib/course/structure";
import { recomputeCourseCompletion } from "./completion";

export async function openReviewRun(
  db: Db,
  courseId: string,
  outlineVersion: number,
  options?: { touchCourse?: boolean },
): Promise<ReviewRun> {
  const [run] = await db.insert(reviewRuns).values({ courseId, outlineVersion }).returning();
  if (options?.touchCourse === false) return run;
  await db
    .update(courses)
    .set({ status: "reviewing", updatedAt: new Date() })
    .where(eq(courses.id, courseId));
  return run;
}

export async function recordReviewStep(db: Db, runId: string, round: number): Promise<void> {
  await db.update(reviewRuns).set({ round, updatedAt: new Date() }).where(eq(reviewRuns.id, runId));
}

export async function saveFindings(
  db: Db,
  runId: string,
  courseId: string,
  outlineVersion: number,
  round: number,
  findings: Finding[],
): Promise<ReviewFindingRow[]> {
  return db.transaction(async (tx) => {
    await tx
      .delete(reviewFindings)
      .where(and(eq(reviewFindings.reviewRunId, runId), eq(reviewFindings.round, round)));
    if (findings.length === 0) return [];
    return tx
      .insert(reviewFindings)
      .values(
        findings.map((f) => ({
          reviewRunId: runId,
          courseId,
          outlineVersion,
          round,
          kind: f.kind,
          lessonRef: f.lessonRef,
          detail: f.detail,
          correction: f.correction,
        })),
      )
      .returning();
  });
}

export async function getFindings(
  db: Db,
  runId: string,
  round: number,
): Promise<ReviewFindingRow[]> {
  return db
    .select()
    .from(reviewFindings)
    .where(and(eq(reviewFindings.reviewRunId, runId), eq(reviewFindings.round, round)));
}

export async function markFindingsCorrected(db: Db, runId: string, round: number): Promise<void> {
  await db
    .update(reviewFindings)
    .set({ status: "corrected" })
    .where(and(eq(reviewFindings.reviewRunId, runId), eq(reviewFindings.round, round)));
}

export async function finishReviewRun(
  db: Db,
  runId: string,
  status: "succeeded" | "failed",
  error?: string,
): Promise<void> {
  await db
    .update(reviewRuns)
    .set({ status, error: error ?? null, updatedAt: new Date() })
    .where(eq(reviewRuns.id, runId));
}

export type PublishResult = { ok: true; revision: Revision } | { ok: false; reason: string };

/**
 * Publication is one atomic transaction and idempotent per outline version:
 * a repeated retry reuses the existing revision instead of minting a second.
 */
export async function publishRevision(
  db: Db,
  courseId: string,
  outlineVersion: number,
  reviewRunId: string,
): Promise<PublishResult> {
  return db.transaction(async (tx) => {
    const [outline] = await tx
      .select()
      .from(outlines)
      .where(and(eq(outlines.courseId, courseId), eq(outlines.version, outlineVersion)))
      .limit(1);
    if (!outline) return { ok: false as const, reason: "The Outline for this candidate is gone." };
    const problems = outlineApprovalProblems(outline.data);
    if (problems.length > 0) {
      return { ok: false as const, reason: `Refusing to publish: ${problems.join(" ")}` };
    }

    const planned = outline.data.modules.flatMap((m) => m.lessons.map((l) => l.id));
    const written = await tx
      .select({ lessonRef: lessons.lessonRef })
      .from(lessons)
      .where(and(eq(lessons.courseId, courseId), eq(lessons.outlineVersion, outlineVersion)));
    const writtenSet = new Set(written.map((w) => w.lessonRef));
    const missing = planned.filter((id) => !writtenSet.has(id));
    if (missing.length > 0) {
      return {
        ok: false as const,
        reason: `Refusing to publish: ${missing.length} Lesson(s) were never written.`,
      };
    }

    const [run] = await tx.select().from(reviewRuns).where(eq(reviewRuns.id, reviewRunId)).limit(1);
    if (!run || run.status !== "succeeded") {
      return { ok: false as const, reason: "Refusing to publish before the review passes." };
    }

    const open = await tx
      .select({ id: reviewFindings.id })
      .from(reviewFindings)
      .where(and(eq(reviewFindings.reviewRunId, reviewRunId), eq(reviewFindings.status, "open")))
      .limit(1);
    if (open.length > 0) {
      return { ok: false as const, reason: "Refusing to publish with open review findings." };
    }

    /* A failed Sandbox pass blocks publication until a later round passes. */
    const verification = await tx
      .select()
      .from(codeVerifications)
      .where(
        and(
          eq(codeVerifications.courseId, courseId),
          eq(codeVerifications.outlineVersion, outlineVersion),
        ),
      )
      .orderBy(desc(codeVerifications.round))
      .limit(1);
    if (verification[0]?.status === "failed") {
      return {
        ok: false as const,
        reason: "Refusing to publish: the code did not run cleanly in the Sandbox.",
      };
    }

    const [current] = await tx
      .select({ revisionNumber: max(revisions.revisionNumber) })
      .from(revisions)
      .where(eq(revisions.courseId, courseId));
    const nextNumber = (current?.revisionNumber ?? 0) + 1;

    const [existing] = await tx
      .select()
      .from(revisions)
      .where(and(eq(revisions.courseId, courseId), eq(revisions.outlineVersion, outlineVersion)))
      .limit(1);
    if (existing) return { ok: true as const, revision: existing };

    const [revision] = await tx
      .insert(revisions)
      .values({ courseId, revisionNumber: nextNumber, outlineVersion })
      .returning();

    await tx
      .update(courses)
      .set({ status: "ready", updatedAt: new Date() })
      .where(eq(courses.id, courseId));
    await recomputeCourseCompletion(tx, courseId);

    return { ok: true as const, revision };
  });
}

/** A retry reuses the existing row for the round instead of re-running the Sandbox. */
export async function saveCodeVerification(
  db: Db,
  courseId: string,
  outlineVersion: number,
  round: number,
  result: { passed: boolean; evidence: unknown },
): Promise<{ created: boolean }> {
  const [existing] = await db
    .select()
    .from(codeVerifications)
    .where(
      and(
        eq(codeVerifications.courseId, courseId),
        eq(codeVerifications.outlineVersion, outlineVersion),
        eq(codeVerifications.round, round),
      ),
    )
    .limit(1);
  if (existing) return { created: false };

  await db.insert(codeVerifications).values({
    courseId,
    outlineVersion,
    round,
    status: result.passed ? "passed" : "failed",
    evidence: result.evidence,
  });
  return { created: true };
}

export async function findCodeVerification(
  db: Db,
  courseId: string,
  outlineVersion: number,
  round: number,
): Promise<CodeVerification | undefined> {
  const [row] = await db
    .select()
    .from(codeVerifications)
    .where(
      and(
        eq(codeVerifications.courseId, courseId),
        eq(codeVerifications.outlineVersion, outlineVersion),
        eq(codeVerifications.round, round),
      ),
    )
    .limit(1);
  return row;
}

export async function latestCodeVerification(
  db: Db,
  courseId: string,
  outlineVersion: number,
): Promise<CodeVerification | undefined> {
  const [row] = await db
    .select()
    .from(codeVerifications)
    .where(
      and(
        eq(codeVerifications.courseId, courseId),
        eq(codeVerifications.outlineVersion, outlineVersion),
      ),
    )
    .orderBy(desc(codeVerifications.round))
    .limit(1);
  return row;
}

export async function failReview(
  db: Db,
  courseId: string,
  runId: string,
  message: string,
  options?: { touchCourse?: boolean },
): Promise<void> {
  await db.transaction(async (tx) => {
    await finishReviewRun(tx, runId, "failed", message);
    const [review] = await tx
      .select({ outlineVersion: reviewRuns.outlineVersion })
      .from(reviewRuns)
      .where(eq(reviewRuns.id, runId))
      .limit(1);
    if (review) {
      await tx
        .update(generationRuns)
        .set({ status: "failed", error: message, updatedAt: new Date() })
        .where(
          and(
            eq(generationRuns.courseId, courseId),
            eq(generationRuns.outlineVersion, review.outlineVersion),
          ),
        );
    }
    if (options?.touchCourse === false) return;
    await tx
      .update(courses)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(courses.id, courseId));
  });
}

export async function currentRevision(db: Db, courseId: string): Promise<Revision | undefined> {
  const [revision] = await db
    .select()
    .from(revisions)
    .where(eq(revisions.courseId, courseId))
    .orderBy(desc(revisions.revisionNumber))
    .limit(1);
  return revision;
}

export async function latestReviewRun(db: Db, courseId: string): Promise<ReviewRun | undefined> {
  const [run] = await db
    .select()
    .from(reviewRuns)
    .where(eq(reviewRuns.courseId, courseId))
    .orderBy(desc(reviewRuns.startedAt))
    .limit(1);
  return run;
}

export async function resetGenerationRun(
  db: Db,
  courseId: string,
  runId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(generationRuns)
      .where(and(eq(generationRuns.id, runId), eq(generationRuns.courseId, courseId)))
      .limit(1);
    if (!run || run.status !== "failed") return false;

    await tx
      .update(generationRuns)
      .set({ status: "running", error: null, updatedAt: new Date() })
      .where(eq(generationRuns.id, runId));
    const [published] = await tx
      .select({ id: revisions.id })
      .from(revisions)
      .where(eq(revisions.courseId, courseId))
      .limit(1);
    if (!published) {
      await tx
        .update(courses)
        .set({ status: "generating", updatedAt: new Date() })
        .where(eq(courses.id, courseId));
    }
    return true;
  });
}

export type CancelGenerationResult =
  | { ok: true; outlineVersion: number }
  | { ok: false; reason: "not-found" | "too-late" };

/**
 * Discards an in-flight generation run and returns the Course to its last
 * stable checkpoint. The approved Outline and specification stay; partial
 * candidate Lessons and review work for the run's Outline version go.
 * A later approval starts that version fresh. Repeating the call on a
 * stranded Course (no run row left) still restores the checkpoint.
 */
export async function cancelGenerationRun(
  db: Db,
  ownerId: string,
  courseId: string,
): Promise<CancelGenerationResult> {
  return db.transaction(async (tx) => {
    const [course] = await tx
      .select()
      .from(courses)
      .where(and(eq(courses.ownerId, ownerId), eq(courses.id, courseId)))
      .limit(1);
    if (!course) return { ok: false as const, reason: "not-found" as const };
    if (course.status !== "generating" && course.status !== "reviewing") {
      return { ok: false as const, reason: "too-late" as const };
    }

    const [run] = await tx
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.courseId, courseId))
      .orderBy(desc(generationRuns.startedAt))
      .limit(1);
    if (run && run.status === "succeeded") {
      return { ok: false as const, reason: "too-late" as const };
    }

    const [outline] = await tx
      .select({ version: outlines.version })
      .from(outlines)
      .where(eq(outlines.courseId, courseId))
      .orderBy(desc(outlines.version))
      .limit(1);
    const version = run?.outlineVersion ?? outline?.version ?? 1;

    await tx
      .delete(lessons)
      .where(and(eq(lessons.courseId, courseId), eq(lessons.outlineVersion, version)));
    await tx
      .delete(reviewRuns)
      .where(and(eq(reviewRuns.courseId, courseId), eq(reviewRuns.outlineVersion, version)));
    if (run) await tx.delete(generationRuns).where(eq(generationRuns.id, run.id));

    const [published] = await tx
      .select({ id: revisions.id })
      .from(revisions)
      .where(eq(revisions.courseId, courseId))
      .limit(1);
    await tx
      .update(courses)
      .set({ status: published ? "ready" : "awaiting-outline-approval", updatedAt: new Date() })
      .where(eq(courses.id, courseId));
    return { ok: true as const, outlineVersion: version };
  });
}

export type PublishedCourse = {
  course: Course;
  revision: Revision;
  outline: { version: number; data: typeof outlines.$inferSelect.data };
  lessonRows: (typeof lessons.$inferSelect)[];
  sourceRows: (typeof sources.$inferSelect)[];
};

export async function findOwnedPublishedCourse(
  db: Db,
  ownerId: string,
  courseId: string,
): Promise<PublishedCourse | undefined> {
  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.ownerId, ownerId), eq(courses.id, courseId)))
    .limit(1);
  if (!course) return undefined;

  const revision = await currentRevision(db, courseId);
  if (!revision) return undefined;

  const [outline] = await db
    .select()
    .from(outlines)
    .where(and(eq(outlines.courseId, courseId), eq(outlines.version, revision.outlineVersion)))
    .limit(1);
  if (!outline) return undefined;

  const lessonRows = await db
    .select()
    .from(lessons)
    .where(
      and(eq(lessons.courseId, courseId), eq(lessons.outlineVersion, revision.outlineVersion)),
    );
  const sourceRows = await db.select().from(sources).where(eq(sources.courseId, courseId));

  return { course, revision, outline, lessonRows, sourceRows };
}

export async function findGenerationRunFor(
  db: Db,
  courseId: string,
  outlineVersion: number,
): Promise<typeof generationRuns.$inferSelect | undefined> {
  const [run] = await db
    .select()
    .from(generationRuns)
    .where(
      and(eq(generationRuns.courseId, courseId), eq(generationRuns.outlineVersion, outlineVersion)),
    )
    .limit(1);
  return run;
}

export type { FindingKind };
