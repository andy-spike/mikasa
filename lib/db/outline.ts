/**
 * Repositories for the Outline checkpoint (ticket #4): applying structure
 * changes as new Outline versions, reading specification staleness, and
 * opening the generation run that approval starts. Every entry point takes
 * the Drizzle instance and, where a Learner is involved, enforces
 * ownership in the query.
 */
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "./index";
import {
  courseSpecs,
  courses,
  generationRuns,
  outlines,
  type Course,
  type CourseSpecRow,
  type GenerationRun,
  type Outline,
} from "./schema";
import {
  applyOutlineOps,
  outlineApprovalProblems,
  StructureError,
  type OutlineOp,
} from "../course/structure";

/** Why an Outline change or an approval did not go through. */
export type OutlineRejection =
  | "not-found"
  | "conflict"
  | "invalid"
  | "not-editable"
  | "not-approvable";

export type OutlineChangeResult =
  | { ok: true; outline: Outline }
  | { ok: false; reason: OutlineRejection; message: string };

function reject(
  reason: OutlineRejection,
  message: string,
): { ok: false; reason: OutlineRejection; message: string } {
  return { ok: false, reason, message };
}

/**
 * One Outline change, applied as a new version inside one transaction.
 * `baseVersion` is the version the Learner was looking at: if the current
 * version is higher, someone changed the Outline first and the whole
 * change is rejected without partial application.
 *
 * A Course may only be reshaped while it waits for Outline approval; a
 * generating or published Course changes through revisions (tickets
 * #13/#14), never through this door.
 */
export async function applyOutlineChange(
  db: Db,
  ownerId: string,
  courseId: string,
  baseVersion: number,
  ops: OutlineOp[],
): Promise<OutlineChangeResult> {
  return db.transaction(async (tx) => {
    const [course] = await tx
      .select()
      .from(courses)
      .where(and(eq(courses.ownerId, ownerId), eq(courses.id, courseId)))
      .limit(1);
    if (!course) return reject("not-found", "Course not found.");

    if (course.status !== "awaiting-outline-approval") {
      return reject(
        "not-editable",
        "This Course has left the Outline checkpoint; its shape changes through the Tailor now.",
      );
    }

    const [current] = await tx
      .select()
      .from(outlines)
      .where(eq(outlines.courseId, courseId))
      .orderBy(desc(outlines.version))
      .limit(1);
    if (!current) return reject("not-found", "This Course has no Outline yet.");

    if (current.version !== baseVersion) {
      return reject(
        "conflict",
        "The Outline changed while you were editing. Reload to see the current shape; your change was not applied.",
      );
    }

    let data = current.data;
    try {
      data = applyOutlineOps(data, ops);
    } catch (error) {
      if (error instanceof StructureError) {
        return reject("invalid", error.message);
      }
      throw error;
    }

    const [next] = await tx
      .insert(outlines)
      .values({ courseId, version: current.version + 1, data })
      .returning();
    await tx
      .update(courses)
      .set({ updatedAt: new Date() })
      .where(eq(courses.id, courseId));
    return { ok: true, outline: next };
  });
}

/** The specification reads as stale when the Outline moved past it. */
export function specIsStale(spec: CourseSpecRow, outlineVersion: number): boolean {
  return spec.outlineVersion < outlineVersion;
}

/** The Course's specification row, if design produced one. */
export async function findCourseSpecRow(
  db: Db,
  courseId: string,
  outlineVersion?: number,
): Promise<CourseSpecRow | undefined> {
  const [row] = await db
    .select()
    .from(courseSpecs)
    .where(
      outlineVersion === undefined
        ? eq(courseSpecs.courseId, courseId)
        : and(eq(courseSpecs.courseId, courseId), eq(courseSpecs.outlineVersion, outlineVersion)),
    )
    .orderBy(desc(courseSpecs.outlineVersion))
    .limit(1);
  return row;
}

/** Saves the specification for the Outline version it fits. */
export async function saveReconciledSpec(
  db: Db,
  courseId: string,
  spec: CourseSpecRow["spec"],
  outlineVersion: number,
): Promise<void> {
  await db
    .insert(courseSpecs)
    .values({ courseId, spec, outlineVersion })
    .onConflictDoUpdate({
      target: [courseSpecs.courseId, courseSpecs.outlineVersion],
      set: { spec },
    });
}

export type ApprovalStart =
  | { ok: true; run: GenerationRun; duplicate: boolean }
  | { ok: false; reason: OutlineRejection; message: string };

/**
 * Approval's transactional half: re-checks the version the Learner
 * approved, sanity-checks the shape, and opens the generation run pinned
 * to exactly this Outline version. The unique (course, version) index on
 * generation runs turns a double approval into `duplicate: true` instead
 * of a second run.
 */
export async function openGenerationRun(
  db: Db,
  ownerId: string,
  courseId: string,
  baseVersion: number,
): Promise<ApprovalStart> {
  return db.transaction(async (tx) => {
    const [course] = await tx
      .select()
      .from(courses)
      .where(and(eq(courses.ownerId, ownerId), eq(courses.id, courseId)))
      .limit(1);
    if (!course) return reject("not-found", "Course not found.");

    const [outline] = await tx
      .select()
      .from(outlines)
      .where(eq(outlines.courseId, courseId))
      .orderBy(desc(outlines.version))
      .limit(1);
    if (!outline) return reject("not-found", "This Course has no Outline yet.");

    if (outline.version !== baseVersion) {
      return reject(
        "conflict",
        "The Outline changed while you were reviewing it. Reload and approve the current shape.",
      );
    }

    if (course.status !== "awaiting-outline-approval") {
      // An earlier approval already opened a run for a version; only a
      // matching one is an idempotent re-approval.
      const [existing] = await tx
        .select()
        .from(generationRuns)
        .where(
          and(
            eq(generationRuns.courseId, courseId),
            eq(generationRuns.outlineVersion, baseVersion),
          ),
        )
        .limit(1);
      if (existing) return { ok: true, run: existing, duplicate: true };
      return reject(
        "not-approvable",
        "This Course is not waiting for Outline approval.",
      );
    }

    const problems = outlineApprovalProblems(outline.data);
    if (problems.length > 0) {
      return reject("invalid", problems.join(" "));
    }

    const [run] = await tx
      .insert(generationRuns)
      .values({ courseId, outlineVersion: outline.version })
      .onConflictDoNothing()
      .returning();

    if (!run) {
      const [existing] = await tx
        .select()
        .from(generationRuns)
        .where(
          and(
            eq(generationRuns.courseId, courseId),
            eq(generationRuns.outlineVersion, baseVersion),
          ),
        )
        .limit(1);
      return { ok: true, run: existing!, duplicate: true };
    }

    await tx
      .update(courses)
      .set({ status: "generating", updatedAt: new Date() })
      .where(eq(courses.id, courseId));

    return { ok: true, run, duplicate: false };
  });
}

/** The newest generation run for a Course, if any. */
export async function latestGenerationRun(
  db: Db,
  courseId: string,
): Promise<GenerationRun | undefined> {
  const [run] = await db
    .select()
    .from(generationRuns)
    .where(eq(generationRuns.courseId, courseId))
    .orderBy(desc(generationRuns.startedAt))
    .limit(1);
  return run;
}

/** A generation run that failed before doing any work keeps the Course retryable. */
export async function failGenerationRun(
  db: Db,
  courseId: string,
  runId: string,
  message: string,
  options?: { touchCourse?: boolean },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(generationRuns)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(generationRuns.id, runId));
    if (options?.touchCourse === false) return;
    await tx
      .update(courses)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(courses.id, courseId));
  });
}

export type ApprovalContext = {
  course: Course;
  outline: Outline;
  specRow: CourseSpecRow | undefined;
};

/**
 * Everything the approval action needs to decide and reconcile, read
 * outside the run-opening transaction: the model call must not happen
 * inside a database transaction.
 */
export async function loadApprovalContext(
  db: Db,
  ownerId: string,
  courseId: string,
): Promise<ApprovalContext | undefined> {
  const course = await db
    .select()
    .from(courses)
    .where(and(eq(courses.ownerId, ownerId), eq(courses.id, courseId)))
    .limit(1)
    .then((rows) => rows[0]);
  if (!course) return undefined;

  const outline = await db
    .select()
    .from(outlines)
    .where(eq(outlines.courseId, courseId))
    .orderBy(desc(outlines.version))
    .limit(1)
    .then((rows) => rows[0]);
  if (!outline) return undefined;

  const specRow = await findCourseSpecRow(db, courseId);
  return { course, outline, specRow };
}
