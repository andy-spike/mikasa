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
 * `baseVersion` is optimistic concurrency: a higher current version rejects
 * the whole change with no partial application.
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
    await tx.update(courses).set({ updatedAt: new Date() }).where(eq(courses.id, courseId));
    return { ok: true, outline: next };
  });
}

export function specIsStale(spec: CourseSpecRow, outlineVersion: number): boolean {
  return spec.outlineVersion < outlineVersion;
}

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

/** The unique (course, version) index turns a double approval into `duplicate: true`, not a second run. */
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
      return reject("not-approvable", "This Course is not waiting for Outline approval.");
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

/**
 * Records the Tutor search index state without touching the Course: an
 * embedding failure is repairable, not fatal.
 */
export async function recordFragmentsStatus(
  db: Db,
  courseId: string,
  outlineVersion: number,
  status: "done" | "failed",
  error?: string,
): Promise<void> {
  await db
    .update(generationRuns)
    .set({
      fragmentsStatus: status,
      fragmentsError: status === "failed" ? (error ?? "The embedding failed.") : null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(generationRuns.courseId, courseId), eq(generationRuns.outlineVersion, outlineVersion)),
    );
}

export type ApprovalContext = {
  course: Course;
  outline: Outline;
  specRow: CourseSpecRow | undefined;
};

/** Read outside the run-opening transaction: the model call must not happen inside it. */
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
