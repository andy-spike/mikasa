/**
 * Repositories for review and publication (ticket #6). Findings, review
 * rounds, and the published revision ledger live here; the Workflow calls
 * these from its steps, and the reading path (tickets #6/#8) reads only
 * through the current revision.
 */
import { and, desc, eq, max } from "drizzle-orm";
import type { Db } from "./index";
import {
  courses,
  generationRuns,
  lessons,
  outlines,
  reviewFindings,
  reviewRuns,
  revisions,
  sources,
  type Course,
  type Revision,
  type ReviewFindingRow,
  type ReviewRun,
} from "./schema";
import type { Finding, FindingKind } from "../course/review";

/** Opens the review run for a generated candidate. */
export async function openReviewRun(
  db: Db,
  courseId: string,
  outlineVersion: number,
): Promise<ReviewRun> {
  const [run] = await db
    .insert(reviewRuns)
    .values({ courseId, outlineVersion })
    .returning();
  await db
    .update(courses)
    .set({ status: "reviewing", updatedAt: new Date() })
    .where(eq(courses.id, courseId));
  return run;
}

export async function recordReviewStep(
  db: Db,
  runId: string,
  round: number,
): Promise<void> {
  await db
    .update(reviewRuns)
    .set({ round, updatedAt: new Date() })
    .where(eq(reviewRuns.id, runId));
}

/** Replaces the round's findings (a re-run of a round overwrites, not appends). */
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
      .where(
        and(
          eq(reviewFindings.reviewRunId, runId),
          eq(reviewFindings.round, round),
        ),
      );
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

/** The round's findings, oldest first. */
export async function getFindings(
  db: Db,
  runId: string,
  round: number,
): Promise<ReviewFindingRow[]> {
  return db
    .select()
    .from(reviewFindings)
    .where(
      and(eq(reviewFindings.reviewRunId, runId), eq(reviewFindings.round, round)),
    );
}

/** Marks a round's findings corrected by the corrections that just ran. */
export async function markFindingsCorrected(
  db: Db,
  runId: string,
  round: number,
): Promise<void> {
  await db
    .update(reviewFindings)
    .set({ status: "corrected" })
    .where(
      and(eq(reviewFindings.reviewRunId, runId), eq(reviewFindings.round, round)),
    );
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

export type PublishResult =
  | { ok: true; revision: Revision }
  | { ok: false; reason: string };

/**
 * Publication: one transaction that verifies the candidate is whole, the
 * review passed with no open findings, and then writes the revision row
 * and flips the Course to "ready". A stale outlineVersion (a newer
 * revision exists) refuses to publish over it (ticket #14 reuses this).
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

    const planned = outline.data.modules.flatMap((m) => m.lessons.map((l) => l.id));
    const written = await tx
      .select({ lessonRef: lessons.lessonRef })
      .from(lessons)
      .where(
        and(eq(lessons.courseId, courseId), eq(lessons.outlineVersion, outlineVersion)),
      );
    const writtenSet = new Set(written.map((w) => w.lessonRef));
    const missing = planned.filter((id) => !writtenSet.has(id));
    if (missing.length > 0) {
      return {
        ok: false as const,
        reason: `Refusing to publish: ${missing.length} Lesson(s) were never written.`,
      };
    }

    const [run] = await tx
      .select()
      .from(reviewRuns)
      .where(eq(reviewRuns.id, reviewRunId))
      .limit(1);
    if (!run || run.status !== "succeeded") {
      return { ok: false as const, reason: "Refusing to publish before the review passes." };
    }

    const open = await tx
      .select({ id: reviewFindings.id })
      .from(reviewFindings)
      .where(
        and(
          eq(reviewFindings.reviewRunId, reviewRunId),
          eq(reviewFindings.status, "open"),
        ),
      )
      .limit(1);
    if (open.length > 0) {
      return { ok: false as const, reason: "Refusing to publish with open review findings." };
    }

    const [current] = await tx
      .select({ revisionNumber: max(revisions.revisionNumber) })
      .from(revisions)
      .where(eq(revisions.courseId, courseId));
    const nextNumber = (current?.revisionNumber ?? 0) + 1;

    /* A revision of this Outline version already exists: publication is
       idempotent, and a repeated retry cannot mint a second one. */
    const [existing] = await tx
      .select()
      .from(revisions)
      .where(
        and(eq(revisions.courseId, courseId), eq(revisions.outlineVersion, outlineVersion)),
      )
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

    return { ok: true as const, revision };
  });
}

/** A failed review keeps the Course unpublished with a usable message. */
export async function failReview(
  db: Db,
  courseId: string,
  runId: string,
  message: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await finishReviewRun(tx, runId, "failed", message);
    await tx
      .update(courses)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(courses.id, courseId));
  });
}

/** The current published revision, if the Course has one. */
export async function currentRevision(
  db: Db,
  courseId: string,
): Promise<Revision | undefined> {
  const [revision] = await db
    .select()
    .from(revisions)
    .where(eq(revisions.courseId, courseId))
    .orderBy(desc(revisions.revisionNumber))
    .limit(1);
  return revision;
}

/** The Course's newest review run, if any. */
export async function latestReviewRun(
  db: Db,
  courseId: string,
): Promise<ReviewRun | undefined> {
  const [run] = await db
    .select()
    .from(reviewRuns)
    .where(eq(reviewRuns.courseId, courseId))
    .orderBy(desc(reviewRuns.startedAt))
    .limit(1);
  return run;
}

/**
 * Reopens a failed generation run for retry (ticket #7): running again
 * with the error cleared, same id and Outline version, so the Lessons it
 * already wrote are the ones a retry skips.
 */
export async function resetGenerationRun(
  db: Db,
  courseId: string,
  runId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(generationRuns)
      .where(
        and(eq(generationRuns.id, runId), eq(generationRuns.courseId, courseId)),
      )
      .limit(1);
    if (!run || run.status !== "failed") return false;

    await tx
      .update(generationRuns)
      .set({ status: "running", error: null, currentStep: "resuming", updatedAt: new Date() })
      .where(eq(generationRuns.id, runId));
    await tx
      .update(courses)
      .set({ status: "generating", updatedAt: new Date() })
      .where(eq(courses.id, courseId));
    return true;
  });
}

/**
 * The one Learner-facing read of a Course: ownership in the query, the
 * current revision only. An unpublished candidate — generating, reviewing,
 * failed — reads as not-found here, which is exactly the privacy the
 * product promises between generation and publication.
 */
export type PublishedCourse = {
  course: Course;
  revision: Revision;
  outline: { version: number; data: typeof outlines.$inferSelect.data };
  lessonRows: typeof lessons.$inferSelect[];
  sourceRows: typeof sources.$inferSelect[];
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
    .where(
      and(eq(outlines.courseId, courseId), eq(outlines.version, revision.outlineVersion)),
    )
    .limit(1);
  if (!outline) return undefined;

  const lessonRows = await db
    .select()
    .from(lessons)
    .where(
      and(eq(lessons.courseId, courseId), eq(lessons.outlineVersion, revision.outlineVersion)),
    );
  const sourceRows = await db
    .select()
    .from(sources)
    .where(eq(sources.courseId, courseId));

  return { course, revision, outline, lessonRows, sourceRows };
}

/**
 * The generation run for a version that reached "reviewing" but has no
 * review run yet — the handoff point between tickets #5 and #6. Kept as a
 * query because the review workflow starts from the Course state.
 */
export async function findGenerationRunFor(
  db: Db,
  courseId: string,
  outlineVersion: number,
): Promise<typeof generationRuns.$inferSelect | undefined> {
  const [run] = await db
    .select()
    .from(generationRuns)
    .where(
      and(
        eq(generationRuns.courseId, courseId),
        eq(generationRuns.outlineVersion, outlineVersion),
      ),
    )
    .limit(1);
  return run;
}

export type { FindingKind };
