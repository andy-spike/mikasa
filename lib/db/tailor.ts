import "server-only";

/**
 * The Tailor's server side (ticket #12): a per-Course conversation with
 * its own canonical history, and the Change plans its turns propose. A
 * plan pins itself to the Outline version (and, for a published Course,
 * the revision) it was drawn against; applying it later is rejected if
 * the Course has moved past that. Reviewing — accepting or discarding
 * operations — writes nothing to the Course itself.
 */
import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Db } from "./index";
import {
  changeOperations,
  changePlans,
  completions,
  courseSpecs,
  courses,
  generationRuns,
  lessons,
  outlines,
  revisions,
  tailorConversations,
  tailorMessages,
} from "./schema";
import { applyOutlineOps, StructureError } from "@/lib/course/structure";
import {
  validatePlanOps,
  isStructureOp,
  affectedLessonSets,
  completionResetRefs,
  touchedIdentities,
  undoOutline,
} from "@/lib/course/change-plan";
import type { ChangePlanOp } from "@/lib/course/change-plan";
import { applyOutlineChange } from "./outline";
import type { LessonAdjustment, OutlineData } from "@/lib/course/types";
import { currentRevision, resetGenerationRun } from "./review";
import { recomputeCourseCompletion } from "./completion";
import { outlineApprovalProblems } from "@/lib/course/structure";

export type TailorTurnRow = {
  id: string;
  seq: number;
  role: "learner" | "tailor";
  content: string;
  createdAt: Date;
};

export type ChangeOperationRow = {
  id: string;
  position: number;
  kind: string;
  payload: ChangePlanOp;
  status: "proposed" | "accepted" | "discarded";
};

export type ChangePlanRow = {
  id: string;
  status: string;
  baseOutlineVersion: number;
  baseRevisionNumber: number | null;
  /** Set once the plan has become a staged revision (#14). */
  stagedOutlineVersion: number | null;
  /** Set when the staged revision publishes (#14/#15). */
  publishedRevisionNumber: number | null;
  /** The identities the accepted operations touch (#15). */
  touchedLessons: string[] | null;
  touchedModules: string[] | null;
  /** Lessons whose content the plan regenerated (#15). */
  regeneratedLessons: string[] | null;
  operations: ChangeOperationRow[];
  createdAt: Date;
};

/** The conversation, if a turn has ever completed; none is born early. */
export async function findTailorConversation(
  db: Db,
  ownerId: string,
  courseId: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ id: tailorConversations.id })
    .from(tailorConversations)
    .innerJoin(courses, eq(courses.id, tailorConversations.courseId))
    .where(
      and(eq(tailorConversations.courseId, courseId), eq(courses.ownerId, ownerId)),
    )
    .limit(1);
  return row?.id;
}

/**
 * The Course's conversation, found or born. The Tailor talks about one
 * Course, not one Lesson, so the identity is the Course alone.
 */
export async function getOrCreateTailorConversation(
  db: Db,
  ownerId: string,
  courseId: string,
): Promise<string | undefined> {
  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.ownerId, ownerId), eq(courses.id, courseId)))
    .limit(1);
  if (!course) return undefined;

  const [existing] = await db
    .select()
    .from(tailorConversations)
    .where(eq(tailorConversations.courseId, courseId))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(tailorConversations)
    .values({ courseId })
    .onConflictDoNothing()
    .returning();
  if (created) return created.id;

  const [winner] = await db
    .select()
    .from(tailorConversations)
    .where(eq(tailorConversations.courseId, courseId))
    .limit(1);
  return winner?.id;
}

/** The conversation's completed turns, in order. */
export async function listTailorMessages(
  db: Db,
  conversationId: string,
): Promise<TailorTurnRow[]> {
  const rows = await db
    .select()
    .from(tailorMessages)
    .where(eq(tailorMessages.conversationId, conversationId))
    .orderBy(asc(tailorMessages.seq));
  return rows.map((r) => ({
    id: r.id,
    seq: r.seq,
    role: r.role as "learner" | "tailor",
    content: r.content,
    createdAt: r.createdAt,
  }));
}

/** The whole conversation, for restoring the pane on load. */
export async function loadTailorHistory(
  db: Db,
  ownerId: string,
  courseId: string,
): Promise<TailorTurnRow[]> {
  const [conversation] = await db
    .select({ id: tailorConversations.id })
    .from(tailorConversations)
    .innerJoin(courses, eq(courses.id, tailorConversations.courseId))
    .where(
      and(eq(tailorConversations.courseId, courseId), eq(courses.ownerId, ownerId)),
    )
    .limit(1);
  if (!conversation) return [];
  return listTailorMessages(db, conversation.id);
}

/**
 * One completed Tailor turn, both sides. The conversation is born here,
 * on the first completed turn — an interrupted stream leaves nothing.
 */
export async function appendTailorTurn(
  db: Db,
  ownerId: string,
  courseId: string,
  turn: { learner: string; tailor: string },
): Promise<void> {
  const conversationId = await getOrCreateTailorConversation(db, ownerId, courseId);
  if (!conversationId) return;
  await db.transaction(async (tx) => {
    const [head] = await tx
      .select({ seq: max(tailorMessages.seq) })
      .from(tailorMessages)
      .where(eq(tailorMessages.conversationId, conversationId));
    const base = head?.seq ?? 0;
    await tx.insert(tailorMessages).values([
      { conversationId, seq: base + 1, role: "learner", content: turn.learner },
      { conversationId, seq: base + 2, role: "tailor", content: turn.tailor },
    ]);
  });
}

/**
 * Stores a proposed plan. The operations are validated by applying them
 * to a throwaway copy of the pinned Outline: a plan the Course could not
 * accept is refused at the door, before the Learner reviews anything.
 */
export async function createChangePlan(
  db: Db,
  ownerId: string,
  courseId: string,
  ops: ChangePlanOp[],
): Promise<
  | { ok: true; plan: ChangePlanRow }
  | { ok: false; reason: "not-found" | "invalid"; message: string }
> {
  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.ownerId, ownerId), eq(courses.id, courseId)))
    .limit(1);
  if (!course) return { ok: false, reason: "not-found", message: "Course not found." };

  const [outline] = await db
    .select()
    .from(outlines)
    .where(eq(outlines.courseId, courseId))
    .orderBy(desc(outlines.version))
    .limit(1);
  if (!outline) {
    return { ok: false, reason: "invalid", message: "This Course has no Outline yet." };
  }

  const normalized = ops.map((op) =>
    op.kind === "addModule" && !op.moduleId ? { ...op, moduleId: nanoid() } : op,
  );
  try {
    validatePlanOps(outline.data, normalized);
  } catch (error) {
    if (error instanceof StructureError) {
      return { ok: false, reason: "invalid", message: error.message };
    }
    throw error;
  }

  const revision = await currentRevision(db, courseId);
  const baseRevisionNumber = revision ? revision.revisionNumber : null;

  const plan = await db.transaction(async (tx) => {
    /* One review at a time: a fresh proposal closes the previous one. */
    await tx
      .update(changePlans)
      .set({ status: "superseded", updatedAt: new Date() })
      .where(and(eq(changePlans.courseId, courseId), eq(changePlans.status, "proposed")));
    const [row] = await tx
      .insert(changePlans)
      .values({
        courseId,
        baseOutlineVersion: outline.version,
        baseRevisionNumber,
      })
      .returning();
    await tx.insert(changeOperations).values(
        normalized.map((op, position) => ({
        planId: row.id,
        position,
        kind: op.kind,
        payload: op,
      })),
    );
    return row;
  });

  const operations = await db
    .select()
    .from(changeOperations)
    .where(eq(changeOperations.planId, plan.id))
    .orderBy(asc(changeOperations.position));

  return {
    ok: true,
    plan: {
      id: plan.id,
      status: plan.status,
      baseOutlineVersion: plan.baseOutlineVersion,
      baseRevisionNumber: plan.baseRevisionNumber,
      stagedOutlineVersion: plan.stagedOutlineVersion,
      publishedRevisionNumber: plan.publishedRevisionNumber,
      touchedLessons: plan.touchedLessons,
      touchedModules: plan.touchedModules,
      regeneratedLessons: plan.regeneratedLessons,
      createdAt: plan.createdAt,
      operations: operations.map(toOperationRow),
    },
  };
}

function toOperationRow(row: typeof changeOperations.$inferSelect): ChangeOperationRow {
  return {
    id: row.id,
    position: row.position,
    kind: row.kind,
    payload: row.payload as ChangePlanOp,
    status: row.status as ChangeOperationRow["status"],
  };
}

/** The newest plan still under review, if any. */
export async function findProposedPlan(
  db: Db,
  ownerId: string,
  courseId: string,
): Promise<ChangePlanRow | undefined> {
  const [plan] = await db
    .select()
    .from(changePlans)
    .innerJoin(courses, eq(courses.id, changePlans.courseId))
    .where(
      and(
        eq(changePlans.courseId, courseId),
        eq(changePlans.status, "proposed"),
        eq(courses.ownerId, ownerId),
      ),
    )
    .orderBy(desc(changePlans.createdAt))
    .limit(1);
  if (!plan) return undefined;
  const operations = await db
    .select()
    .from(changeOperations)
    .where(eq(changeOperations.planId, plan.change_plans.id))
    .orderBy(asc(changeOperations.position));
  return {
    id: plan.change_plans.id,
    status: plan.change_plans.status,
    baseOutlineVersion: plan.change_plans.baseOutlineVersion,
    baseRevisionNumber: plan.change_plans.baseRevisionNumber,
    stagedOutlineVersion: plan.change_plans.stagedOutlineVersion,
    publishedRevisionNumber: plan.change_plans.publishedRevisionNumber,
    touchedLessons: plan.change_plans.touchedLessons,
    touchedModules: plan.change_plans.touchedModules,
    regeneratedLessons: plan.change_plans.regeneratedLessons,
    createdAt: plan.change_plans.createdAt,
    operations: operations.map(toOperationRow),
  };
}

/**
 * Sets one operation's review status. Only a plan still under review
 * accepts changes, and only from "proposed": an accepted operation goes
 * back to proposed on request, a discarded one can be brought back, but
 * a plan already applied is frozen.
 */
export async function setOperationStatus(
  db: Db,
  ownerId: string,
  planId: string,
  operationId: string,
  status: "accepted" | "discarded" | "proposed",
): Promise<{ ok: boolean; message?: string }> {
  const [course] = await db
    .select({ id: courses.id })
    .from(changePlans)
    .innerJoin(courses, eq(courses.id, changePlans.courseId))
    .where(and(eq(changePlans.id, planId), eq(courses.ownerId, ownerId)))
    .limit(1);
  if (!course) return { ok: false, message: "Plan not found." };

  const [plan] = await db
    .select()
    .from(changePlans)
    .where(eq(changePlans.id, planId))
    .limit(1);
  if (!plan || plan.status !== "proposed") {
    return { ok: false, message: "This plan is no longer under review." };
  }

  await db
    .update(changeOperations)
    .set({ status })
    .where(and(eq(changeOperations.id, operationId), eq(changeOperations.planId, planId)));
  return { ok: true };
}

/** The plan with its operations, for the apply paths (#13/#14). */
export async function findPlan(
  db: Db,
  ownerId: string,
  planId: string,
): Promise<ChangePlanRow | undefined> {
  const [plan] = await db
    .select()
    .from(changePlans)
    .innerJoin(courses, eq(courses.id, changePlans.courseId))
    .where(and(eq(changePlans.id, planId), eq(courses.ownerId, ownerId)))
    .limit(1);
  if (!plan) return undefined;
  const operations = await db
    .select()
    .from(changeOperations)
    .where(eq(changeOperations.planId, planId))
    .orderBy(asc(changeOperations.position));
  return {
    id: plan.change_plans.id,
    status: plan.change_plans.status,
    baseOutlineVersion: plan.change_plans.baseOutlineVersion,
    baseRevisionNumber: plan.change_plans.baseRevisionNumber,
    stagedOutlineVersion: plan.change_plans.stagedOutlineVersion,
    publishedRevisionNumber: plan.change_plans.publishedRevisionNumber,
    touchedLessons: plan.change_plans.touchedLessons,
    touchedModules: plan.change_plans.touchedModules,
    regeneratedLessons: plan.change_plans.regeneratedLessons,
    createdAt: plan.change_plans.createdAt,
    operations: operations.map(toOperationRow),
  };
}

/** Every plan of the Course, for the undo-overlap check (#15). */
export async function listPlansWithOperations(
  db: Db,
  courseId: string,
): Promise<ChangePlanRow[]> {
  const plans = await db
    .select()
    .from(changePlans)
    .where(eq(changePlans.courseId, courseId))
    .orderBy(asc(changePlans.createdAt));
  const all: ChangePlanRow[] = [];
  for (const plan of plans) {
    const operations = await db
      .select()
      .from(changeOperations)
      .where(eq(changeOperations.planId, plan.id))
      .orderBy(asc(changeOperations.position));
    all.push({
      id: plan.id,
      status: plan.status,
      baseOutlineVersion: plan.baseOutlineVersion,
      baseRevisionNumber: plan.baseRevisionNumber,
      stagedOutlineVersion: plan.stagedOutlineVersion,
      publishedRevisionNumber: plan.publishedRevisionNumber,
      touchedLessons: plan.touchedLessons,
      touchedModules: plan.touchedModules,
      regeneratedLessons: plan.regeneratedLessons,
      createdAt: plan.createdAt,
      operations: operations.map(toOperationRow),
    });
  }
  return all;
}

/**
 * Applies a plan's accepted operations to the Outline (ticket #13). All
 * accepted operations land in one transaction — the Outline's own change
 * door, so a conflict or a refused operation rejects the whole plan
 * without partial application. Applying always produces a new Outline
 * version (a content-only plan bumps the version with unchanged data), so
 * the Course specification reads as stale and approval reconciles it.
 *
 * Discarded operations are simply not in the list; they change nothing.
 */
export async function applyPlanToOutline(
  db: Db,
  ownerId: string,
  courseId: string,
  planId: string,
): Promise<
  | { ok: true; outlineVersion: number; appliedCount: number }
  | {
      ok: false;
      reason: "not-found" | "not-reviewable" | "nothing-accepted" | "conflict" | "invalid";
      message: string;
    }
> {
  return db.transaction(async (tx) => {
    const [course] = await tx
      .select()
      .from(courses)
      .where(and(eq(courses.ownerId, ownerId), eq(courses.id, courseId)))
      .limit(1);
    if (!course) {
      return { ok: false, reason: "not-found", message: "Course not found." };
    }

    const [plan] = await tx
      .select()
      .from(changePlans)
      .where(eq(changePlans.id, planId))
      .limit(1);
    if (!plan || plan.courseId !== courseId) {
      return { ok: false, reason: "not-found", message: "Plan not found." };
    }
    if (plan.status !== "proposed") {
      return {
        ok: false,
        reason: "not-reviewable",
        message: "This plan is no longer under review.",
      };
    }
    if (course.status !== "awaiting-outline-approval") {
      return {
        ok: false,
        reason: "not-reviewable",
        message:
          "This Course has left the Outline checkpoint; it changes through revisions now.",
      };
    }

    const operations = await tx
      .select()
      .from(changeOperations)
      .where(eq(changeOperations.planId, planId))
      .orderBy(asc(changeOperations.position));
    const accepted = operations
      .filter((o) => o.status === "accepted")
      .map((o) => o.payload as ChangePlanOp);
    if (accepted.length === 0) {
      return {
        ok: false,
        reason: "nothing-accepted",
        message: "Accept at least one operation to apply the plan.",
      };
    }

    const structureOps = accepted.filter(isStructureOp);

    /* The Outline's own door does the conflict check (base version),
       applies the grammar, and inserts the next version — all inside
       this transaction. Zero structure ops still bumps the version, so
       a content-only plan marks the specification stale. */
    const applied = await applyOutlineChange(
      tx,
      ownerId,
      courseId,
      plan.baseOutlineVersion,
      structureOps,
    );
    if (!applied.ok) {
      return {
        ok: false,
        reason: applied.reason === "conflict" ? "conflict" : "invalid",
        message: applied.message,
      };
    }

    /* The content demands ride in the plan until approval reconciles the
       specification; applying freezes the plan as their record. */
    await tx
      .update(changePlans)
      .set({ status: "applied", updatedAt: new Date() })
      .where(eq(changePlans.id, planId));

    return {
      ok: true,
      outlineVersion: applied.outline.version,
      appliedCount: accepted.length,
    };
  });
}

/**
 * The content demands still in force (ticket #13): every applied plan's
 * accepted prose/Exercise operations, the latest demand per Lesson winning,
 * filtered to Lessons the Outline still has. Approval feeds these to the
 * reconciliation, which bakes them into the specification.
 */
export async function activeContentAdjustments(
  db: Db,
  courseId: string,
  outline: OutlineData,
): Promise<LessonAdjustment[]> {
  const plans = await listPlansWithOperations(db, courseId);
  const byLesson = new Map<string, LessonAdjustment>();
  for (const plan of plans) {
    if (plan.status !== "applied") continue;
    for (const operation of plan.operations) {
      if (operation.status !== "accepted") continue;
      const op = operation.payload;
      if (op.kind === "lessonProse") {
        const existing = byLesson.get(op.lessonId) ?? { lessonId: op.lessonId };
        byLesson.set(op.lessonId, { ...existing, prose: op.instruction });
      } else if (op.kind === "exercise") {
        const existing = byLesson.get(op.lessonId) ?? { lessonId: op.lessonId };
        byLesson.set(op.lessonId, {
          ...existing,
          exercise: { task: op.task, check: op.check },
        });
      }
    }
  }
  const live = new Set(outline.modules.flatMap((m) => m.lessons.map((l) => l.id)));
  return [...byLesson.values()].filter((a) => live.has(a.lessonId));
}

/**
 * One plan's accepted content demands, as LessonAdjustments: the prose
 * instruction or the exact Exercise, per Lesson. The staged revision's
 * reconciliation (#17) bakes these into the specification, so generation
 * honors what the Learner accepted for the Lessons it regenerates.
 */
export async function planContentAdjustments(
  db: Db,
  planId: string,
): Promise<LessonAdjustment[]> {
  const operations = await db
    .select()
    .from(changeOperations)
    .where(eq(changeOperations.planId, planId))
    .orderBy(asc(changeOperations.position));
  const byLesson = new Map<string, LessonAdjustment>();
  for (const operation of operations) {
    if (operation.status !== "accepted") continue;
    const op = operation.payload as ChangePlanOp;
    if (op.kind === "lessonProse") {
      const existing = byLesson.get(op.lessonId) ?? { lessonId: op.lessonId };
      byLesson.set(op.lessonId, { ...existing, prose: op.instruction });
    } else if (op.kind === "exercise") {
      const existing = byLesson.get(op.lessonId) ?? { lessonId: op.lessonId };
      byLesson.set(op.lessonId, {
        ...existing,
        exercise: { task: op.task, check: op.check },
      });
    }
  }
  return [...byLesson.values()];
}

/** Any accepted structural operation changes the Course shape or sequence. */
export async function planHasStructuralChanges(db: Db, planId: string): Promise<boolean> {
  const operations = await db
    .select({ payload: changeOperations.payload, status: changeOperations.status })
    .from(changeOperations)
    .where(eq(changeOperations.planId, planId));
  return operations.some(
    (operation) =>
      operation.status === "accepted" && isStructureOp(operation.payload as ChangePlanOp),
  );
}

export type StageRevisionResult =
  | {
      ok: true;
      runId: string;
      baseRevisionNumber: number;
      stagedOutlineVersion: number;
      /** Lessons whose content must be regenerated (new or rewritten). */
      regenerateLessonRefs: string[];
      /** Lessons to re-embed after publish: regenerated, retitled, or gone. */
      embedLessonRefs: string[];
      /** Lessons that left the Course; their fragments are deleted. */
      removedLessonRefs: string[];
    }
  | {
      ok: false;
      reason:
        | "not-found"
        | "not-reviewable"
        | "nothing-accepted"
        | "stale"
        | "already-staged"
        | "invalid";
      message: string;
    };

/**
 * Stages a plan as a candidate Course revision (ticket #14), in one
 * transaction: the accepted structure operations produce a NEW Outline
 * version, the unaffected Lessons are copied into it (with their new
 * titles, so renames ride along), and the plan records the staged
 * version. Nothing here touches the current revision — the published
 * Course stays readable until the staged candidate publishes.
 *
 * The affected sets ride back to the workflow: only regenerated Lessons
 * rerun generation, review, and Sandbox work; only regenerated,
 * retitled, or removed Lessons re-embed.
 */
export async function stagePlanRevision(
  db: Db,
  ownerId: string,
  courseId: string,
  planId: string,
): Promise<StageRevisionResult> {
  return db.transaction(async (tx) => {
    const [course] = await tx
      .select()
      .from(courses)
      .where(and(eq(courses.ownerId, ownerId), eq(courses.id, courseId)))
      .limit(1);
    if (!course) {
      return { ok: false, reason: "not-found", message: "Course not found." };
    }

    const [plan] = await tx
      .select()
      .from(changePlans)
      .where(eq(changePlans.id, planId))
      .limit(1);
    if (!plan || plan.courseId !== courseId) {
      return { ok: false, reason: "not-found", message: "Plan not found." };
    }
    if (plan.status !== "proposed") {
      return {
        ok: false,
        reason: "not-reviewable",
        message: "This plan is no longer under review.",
      };
    }
    if (course.status !== "ready") {
      return {
        ok: false,
        reason: "not-reviewable",
        message: "Only a published Course stages a revision.",
      };
    }

    /* The Course the Learner reviewed is the Course that must still be
       current: a newer revision (or Outline) rejects the whole plan. */
    const revision = await currentRevision(tx, courseId);
    if (!revision || plan.baseRevisionNumber !== revision.revisionNumber) {
      return {
        ok: false,
        reason: "stale",
        message:
          "The Course has a newer revision than this plan was drawn against. Review the Course as it is now and ask again.",
      };
    }
    const [baseOutline] = await tx
      .select()
      .from(outlines)
      .where(eq(outlines.courseId, courseId))
      .orderBy(desc(outlines.version))
      .limit(1);
    if (!baseOutline || plan.baseOutlineVersion !== baseOutline.version) {
      return {
        ok: false,
        reason: "stale",
        message: "The Outline has moved past this plan. Review the Course as it is now and ask again.",
      };
    }

    /* One staged candidate at a time, so two plans cannot interleave. */
    const [staged] = await tx
      .select({ id: changePlans.id })
      .from(changePlans)
      .where(and(eq(changePlans.courseId, courseId), eq(changePlans.status, "staged")))
      .limit(1);
    if (staged) {
      return {
        ok: false,
        reason: "already-staged",
        message: "A revision is already being prepared from an earlier plan.",
      };
    }

    const operations = await tx
      .select()
      .from(changeOperations)
      .where(eq(changeOperations.planId, planId))
      .orderBy(asc(changeOperations.position));
    const accepted = operations
      .filter((o) => o.status === "accepted")
      .map((o) => o.payload as ChangePlanOp);
    if (accepted.length === 0) {
      return {
        ok: false,
        reason: "nothing-accepted",
        message: "Accept at least one operation to stage a revision.",
      };
    }

    const structureOps = accepted.filter(isStructureOp);
    let nextData: OutlineData;
    try {
      nextData = applyOutlineOps(baseOutline.data, structureOps);
    } catch (error) {
      if (error instanceof StructureError) {
        return { ok: false, reason: "invalid", message: error.message };
      }
      throw error;
    }
    const problems = outlineApprovalProblems(nextData);
    if (problems.length > 0) {
      return { ok: false, reason: "invalid", message: problems.join(" ") };
    }

    /* The affected sets, from the Outline the plan was drawn against and
       the staged one. New ids (added Lessons, split halves) and Lessons
       with content demands regenerate; renamed Lessons copy with their
       new title and only re-embed; removed Lessons leave no row. */
    const affected = affectedLessonSets(baseOutline.data, nextData, accepted);
    const stagedVersion = baseOutline.version + 1;
    await tx.insert(outlines).values({
      courseId,
      version: stagedVersion,
      data: nextData,
    });
    const [baseSpec] = await tx
      .select()
      .from(courseSpecs)
      .where(
        and(
          eq(courseSpecs.courseId, courseId),
          eq(courseSpecs.outlineVersion, baseOutline.version),
        ),
      )
      .limit(1);
    if (!baseSpec) {
      return { ok: false, reason: "invalid", message: "The published Course specification is gone." };
    }
    await tx.insert(courseSpecs).values({
      courseId,
      outlineVersion: stagedVersion,
      spec: baseSpec.spec,
    });

    /* Copy the untouched Lessons into the staged version. The workflow's
       resume machinery then sees them as written and regenerates only
       the affected ones. A plan staged after a discarded staged revision
       (bug 10) draws against a base version whose regenerated Lessons
       were never written; their content comes from the published
       revision instead. */
    const rows = await tx
      .select()
      .from(lessons)
      .where(and(eq(lessons.courseId, courseId), eq(lessons.outlineVersion, baseOutline.version)));
    const byRef = new Map(rows.map((r) => [r.lessonRef, r]));
    const publishedRows =
      revision && revision.outlineVersion !== baseOutline.version
        ? await tx
            .select()
            .from(lessons)
            .where(
              and(
                eq(lessons.courseId, courseId),
                eq(lessons.outlineVersion, revision.outlineVersion),
              ),
            )
        : [];
    const publishedByRef = new Map(publishedRows.map((r) => [r.lessonRef, r]));
    const copies: (typeof lessons.$inferInsert)[] = [];
    const newTitles = new Map<string, string>();
    for (const m of nextData.modules)
      for (const l of m.lessons) newTitles.set(l.id, l.title);
    for (const [id, title] of newTitles) {
      if (affected.regenerate.includes(id)) continue;
      const row = byRef.get(id) ?? publishedByRef.get(id);
      if (!row) {
        return {
          ok: false,
          reason: "invalid",
          message: `The staged Outline references Lesson "${id}" that the published Course never wrote.`,
        };
      }
      copies.push({
        courseId,
        outlineVersion: stagedVersion,
        lessonRef: row.lessonRef,
        title,
        body: row.body,
        workedExample: row.workedExample,
        recallPrompt: row.recallPrompt,
        selfExplanationPrompt: row.selfExplanationPrompt,
        exercise: row.exercise,
        bridge: row.bridge,
      });
    }
    if (copies.length > 0) await tx.insert(lessons).values(copies);

    const [run] = await tx
      .insert(generationRuns)
      .values({ courseId, outlineVersion: stagedVersion })
      .returning();

    /* The identities the accepted operations touch, for the undo rule
       (#15): the operations' own ids, the Lessons of removed Modules,
       and the Lessons the plan adds. */
    const touched = touchedIdentities(accepted, baseOutline.data);
    for (const m of nextData.modules)
      for (const l of m.lessons)
        if (!baseOutline.data.modules.some((bm) => bm.lessons.some((bl) => bl.id === l.id)))
          touched.lessons.push(l.id);
    for (const m of nextData.modules)
      if (!baseOutline.data.modules.some((base) => base.id === m.id)) touched.modules.push(m.id);

    await tx
      .update(changePlans)
      .set({
        status: "staged",
        stagedOutlineVersion: stagedVersion,
        touchedLessons: touched.lessons,
        touchedModules: touched.modules,
        regeneratedLessons: affected.regenerate,
        updatedAt: new Date(),
      })
      .where(eq(changePlans.id, planId));

    return {
      ok: true,
      runId: run.id,
      baseRevisionNumber: plan.baseRevisionNumber!,
      stagedOutlineVersion: stagedVersion,
      regenerateLessonRefs: affected.regenerate,
      embedLessonRefs: affected.embed,
      removedLessonRefs: affected.removed,
    };
  });
}

/** The plan's staged candidate, if it has one (#14). */
export async function findStagedPlan(
  db: Db,
  ownerId: string,
  courseId: string,
): Promise<ChangePlanRow | undefined> {
  const [plan] = await db
    .select()
    .from(changePlans)
    .innerJoin(courses, eq(courses.id, changePlans.courseId))
    .where(
      and(
        eq(changePlans.courseId, courseId),
        eq(changePlans.status, "staged"),
        eq(courses.ownerId, ownerId),
      ),
    )
    .orderBy(desc(changePlans.updatedAt))
    .limit(1);
  if (!plan) return undefined;
  const operations = await db
    .select()
    .from(changeOperations)
    .where(eq(changeOperations.planId, plan.change_plans.id))
    .orderBy(asc(changeOperations.position));
  return {
    id: plan.change_plans.id,
    status: plan.change_plans.status,
    baseOutlineVersion: plan.change_plans.baseOutlineVersion,
    baseRevisionNumber: plan.change_plans.baseRevisionNumber,
    stagedOutlineVersion: plan.change_plans.stagedOutlineVersion,
    publishedRevisionNumber: plan.change_plans.publishedRevisionNumber,
    touchedLessons: plan.change_plans.touchedLessons,
    touchedModules: plan.change_plans.touchedModules,
    regeneratedLessons: plan.change_plans.regeneratedLessons,
    createdAt: plan.change_plans.createdAt,
    operations: operations.map(toOperationRow),
  };
}

export type ResumeStagedRevision =
  | {
      ok: true;
      runId: string;
      baseRevisionNumber: number;
      stagedOutlineVersion: number;
      regenerateLessonRefs: string[];
      embedLessonRefs: string[];
    }
  | { ok: false; reason: "not-found" | "not-retryable"; message: string };

/**
 * Re-arms a staged revision whose workflow failed (ticket #14): the
 * affected sets are recomputed from the plan's own accepted operations
 * against the staged Outline, and the failed run is reopened so the
 * engine's memoization resumes past every step that succeeded. The
 * current Course was never touched by the failure.
 */
export async function resumeStagedRevision(
  db: Db,
  ownerId: string,
  courseId: string,
  planId: string,
): Promise<ResumeStagedRevision> {
  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.ownerId, ownerId), eq(courses.id, courseId)))
    .limit(1);
  if (!course) return { ok: false, reason: "not-found", message: "Course not found." };

  const plan = await findPlan(db, ownerId, planId);
  if (!plan) {
    return { ok: false, reason: "not-found", message: "Plan not found." };
  }
  if (plan.status !== "staged" || !plan.stagedOutlineVersion) {
    return { ok: false, reason: "not-retryable", message: "This plan has no revision to retry." };
  }

  const [stagedOutline] = await db
    .select()
    .from(outlines)
    .where(
      and(eq(outlines.courseId, courseId), eq(outlines.version, plan.stagedOutlineVersion)),
    )
    .limit(1);
  if (!stagedOutline) {
    return { ok: false, reason: "not-retryable", message: "The staged Outline is gone." };
  }
  const [baseOutline] = await db
    .select()
    .from(outlines)
    .where(
      and(
        eq(outlines.courseId, courseId),
        eq(outlines.version, plan.baseOutlineVersion),
      ),
    )
    .limit(1);
  if (!baseOutline) {
    return { ok: false, reason: "not-retryable", message: "The base Outline is gone." };
  }

  const accepted = plan.operations
    .filter((o) => o.status === "accepted")
    .map((o) => o.payload);
  const affected = affectedLessonSets(baseOutline.data, stagedOutline.data, accepted);

  const [run] = await db
    .select()
    .from(generationRuns)
    .where(
      and(
        eq(generationRuns.courseId, courseId),
        eq(generationRuns.outlineVersion, plan.stagedOutlineVersion),
        eq(generationRuns.status, "failed"),
      ),
    )
    .limit(1);
  if (!run) {
    return { ok: false, reason: "not-retryable", message: "This revision is not retryable." };
  }
  const reopened = await resetGenerationRun(db, courseId, run.id);
  if (!reopened) {
    return { ok: false, reason: "not-retryable", message: "This run cannot be retried." };
  }

  return {
    ok: true,
    runId: run.id,
    baseRevisionNumber: plan.baseRevisionNumber!,
    stagedOutlineVersion: plan.stagedOutlineVersion,
    regenerateLessonRefs: affected.regenerate,
    embedLessonRefs: affected.embed,
  };
}

export type DiscardStagedRevision =
  | { ok: true }
  | { ok: false; reason: "not-found" | "not-discardable"; message: string };

/**
 * Gives up on a staged revision (bug 10): a plan whose run failed — or
 * crashed between publication and the plan mark — can be discarded, so
 * the Tailor can propose a fresh one. Only the plan moves, to
 * superseded, the terminal status for dead plans. The published Course,
 * the staged Outline rows, and the run stay exactly as they are:
 * versions are append-only, and an unread version harms nothing.
 */
export async function discardStagedRevision(
  db: Db,
  ownerId: string,
  courseId: string,
  planId: string,
): Promise<DiscardStagedRevision> {
  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.ownerId, ownerId), eq(courses.id, courseId)))
    .limit(1);
  if (!course) return { ok: false, reason: "not-found", message: "Course not found." };

  const plan = await findPlan(db, ownerId, planId);
  if (!plan) return { ok: false, reason: "not-found", message: "Plan not found." };
  if (plan.status !== "staged" || !plan.stagedOutlineVersion) {
    return {
      ok: false,
      reason: "not-discardable",
      message: "This plan has no staged revision to discard.",
    };
  }

  /* The run must have settled: failed, or succeeded without publishing
     the staged version (the crash-between-publish-and-mark edge). While
     work is still going, the Learner waits or retries — a discard could
     kill a revision about to publish. */
  const [run] = await db
    .select({ status: generationRuns.status })
    .from(generationRuns)
    .where(
      and(
        eq(generationRuns.courseId, courseId),
        eq(generationRuns.outlineVersion, plan.stagedOutlineVersion),
      ),
    )
    .limit(1);
  if (run && run.status !== "failed" && run.status !== "succeeded") {
    return {
      ok: false,
      reason: "not-discardable",
      message: "The revision is still being prepared. Wait for it to settle.",
    };
  }
  if (run?.status === "succeeded") {
    const [published] = await db
      .select({ id: revisions.id })
      .from(revisions)
      .where(
        and(
          eq(revisions.courseId, courseId),
          eq(revisions.outlineVersion, plan.stagedOutlineVersion),
        ),
      )
      .limit(1);
    if (published) {
      return {
        ok: false,
        reason: "not-discardable",
        message: "This revision has already published.",
      };
    }
  }

  await db
    .update(changePlans)
    .set({ status: "superseded", updatedAt: new Date() })
    .where(eq(changePlans.id, planId));
  return { ok: true };
}

/**
 * Records a staged revision's publication and applies the Completion
 * rules (#15), in the transaction: the Course's Completion state is
 * snapshotted exactly as the revision swaps (undo restores it), and the
 * operations that redefine "done" — Exercise rewrites, splits, merges —
 * reset the Lessons they touched. Prose, renames, and moves preserve;
 * added Lessons start incomplete; removed Lessons keep their Completion
 * with their content, orphaned but retained.
 */
export async function markRevisionPublished(
  db: Db,
  planId: string,
  revisionNumber: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [plan] = await tx
      .select()
      .from(changePlans)
      .where(eq(changePlans.id, planId))
      .limit(1);
    if (!plan) throw new Error("The published plan vanished.");

    const operations = await tx
      .select()
      .from(changeOperations)
      .where(eq(changeOperations.planId, planId))
      .orderBy(asc(changeOperations.position));
    const accepted = operations
      .filter((o) => o.status === "accepted")
      .map((o) => o.payload as ChangePlanOp);

    /* The resets resolve against the Outline the plan was drawn against:
       a merge's survivor depends on the direction and the shape then. */
    const [baseOutline] = await tx
      .select()
      .from(outlines)
      .where(
        and(eq(outlines.courseId, plan.courseId), eq(outlines.version, plan.baseOutlineVersion)),
      )
      .limit(1);
    if (!baseOutline) throw new Error("The plan's base Outline vanished.");
    const resetRefs = completionResetRefs(accepted, baseOutline.data);

    const rows = await tx
      .select()
      .from(completions)
      .where(eq(completions.courseId, plan.courseId));
    const snapshot = rows.map((r) => ({
      lessonRef: r.lessonRef,
      doneAt: r.doneAt.toISOString(),
    }));

    await tx
      .update(changePlans)
      .set({
        status: "published",
        publishedRevisionNumber: revisionNumber,
        completionSnapshot: snapshot,
        updatedAt: new Date(),
      })
      .where(eq(changePlans.id, planId));

    if (resetRefs.length > 0) {
      await tx
        .delete(completions)
        .where(
          and(
            eq(completions.courseId, plan.courseId),
            inArray(completions.lessonRef, resetRefs),
          ),
        );
    }
    await recomputeCourseCompletion(tx, plan.courseId);
  });
}

export type UndoResult =
  | {
      ok: true;
      revisionNumber: number;
      /** The Outline version the undo wrote (the new current revision's). */
      outlineVersion: number;
      restoredLessons: string[];
      /** Lessons the undo removed from the Course, whose fragments must go. */
      removedLessons: string[];
    }
  | {
      ok: false;
      reason:
        | "not-found"
        | "not-undoable"
        | "blocked-overlap"
        | "blocked-inflight"
        | "invalid";
      message: string;
    };

/**
 * Undoes a published plan (#15), in one transaction: a new current
 * revision whose Outline is the current shape with the plan's touched
 * identities restored to what the base revision had — later, independent
 * changes keep their place, which is exactly what the overlap rule
 * guarantees is safe. Content comes back from the base revision for
 * everything the plan regenerated or removed; Completion comes back from
 * the plan's snapshot for the touched identities. Any refusal leaves the
 * current revision and Completion untouched.
 */
export async function undoPlanRevision(
  db: Db,
  ownerId: string,
  courseId: string,
  planId: string,
): Promise<UndoResult> {
  return db.transaction(async (tx) => {
    const [course] = await tx
      .select()
      .from(courses)
      .where(and(eq(courses.ownerId, ownerId), eq(courses.id, courseId)))
      .limit(1);
    if (!course) {
      return { ok: false, reason: "not-found", message: "Course not found." };
    }

    const [plan] = await tx
      .select()
      .from(changePlans)
      .where(eq(changePlans.id, planId))
      .limit(1);
    if (!plan || plan.courseId !== courseId) {
      return { ok: false, reason: "not-found", message: "Plan not found." };
    }
    if (
      plan.status !== "published" ||
      !plan.publishedRevisionNumber ||
      !plan.baseRevisionNumber ||
      !plan.touchedLessons ||
      !plan.touchedModules
    ) {
      return {
        ok: false,
        reason: "not-undoable",
        message: "Only a published change with a recorded shape can be undone.",
      };
    }

    /* Nothing may be in flight: a staged candidate is being built on top
       of the very revision this undo would swap away. */
    const [inflight] = await tx
      .select({ id: changePlans.id })
      .from(changePlans)
      .where(and(eq(changePlans.courseId, courseId), eq(changePlans.status, "staged")))
      .limit(1);
    if (inflight) {
      return {
        ok: false,
        reason: "blocked-inflight",
        message: "A revision is being prepared; undo is unavailable until it settles.",
      };
    }

    /* The overlap rule: a later published plan that touched the same
       Module or Lesson identities blocks the undo. */
    const later = await tx
      .select()
      .from(changePlans)
      .where(and(eq(changePlans.courseId, courseId), eq(changePlans.status, "published")));
    const overlapping = later
      .filter(
        (q) =>
          q.id !== planId &&
          q.publishedRevisionNumber !== null &&
          q.publishedRevisionNumber > plan.publishedRevisionNumber! &&
          (q.touchedLessons ?? []).some((l) => plan.touchedLessons!.includes(l)),
      )
      .map((q) => q.id);
    const overlappingModules = later
      .filter(
        (q) =>
          q.id !== planId &&
          q.publishedRevisionNumber !== null &&
          q.publishedRevisionNumber > plan.publishedRevisionNumber! &&
          (q.touchedModules ?? []).some((m) => plan.touchedModules!.includes(m)),
      )
      .map((q) => q.id);
    if (overlapping.length > 0 || overlappingModules.length > 0) {
      return {
        ok: false,
        reason: "blocked-overlap",
        message:
          "A later change touched the same Lessons or Modules; undoing this one would undo that too.",
      };
    }

    /* The overlap rule above is the staleness guard, so an older plan
       undoes fine once nothing overlapping stands after it: the undo
       rebuilds only the touched identities and leaves independent later
       changes exactly where they are. */
    const revision = await currentRevision(tx, courseId);
    if (!revision) {
      return { ok: false, reason: "invalid", message: "The Course has no current revision." };
    }

    const [baseOutline] = await tx
      .select()
      .from(outlines)
      .where(
        and(eq(outlines.courseId, courseId), eq(outlines.version, plan.baseOutlineVersion)),
      )
      .limit(1);
    const [currentOutline] = await tx
      .select()
      .from(outlines)
      .where(
        and(
          eq(outlines.courseId, courseId),
          eq(outlines.version, revision.outlineVersion),
        ),
      )
      .limit(1);
    if (!baseOutline || !currentOutline) {
      return { ok: false, reason: "invalid", message: "The Outline to undo from is gone." };
    }

    let inverted;
    try {
      inverted = undoOutline(
        baseOutline.data,
        currentOutline.data,
        plan.touchedLessons,
        plan.touchedModules,
      );
    } catch (error) {
      if (error instanceof StructureError) {
        return { ok: false, reason: "invalid", message: error.message };
      }
      throw error;
    }

    /* Content: everything the plan regenerated or removed comes back
       from the base revision; every other Lesson keeps the content the
       current revision has. The base REVISION's version is the faithful
       source: a plan drawn after a discarded staged revision (bug 10)
       has a base Outline version whose regenerated Lessons were never
       written. */
    const restored = new Set([...(plan.regeneratedLessons ?? []), ...plan.touchedLessons]);
    const [baseRevisionRow] = await tx
      .select({ outlineVersion: revisions.outlineVersion })
      .from(revisions)
      .where(
        and(
          eq(revisions.courseId, courseId),
          eq(revisions.revisionNumber, plan.baseRevisionNumber!),
        ),
      )
      .limit(1);
    const baseRows = await tx
      .select()
      .from(lessons)
      .where(
        and(
          eq(lessons.courseId, courseId),
          eq(lessons.outlineVersion, baseRevisionRow?.outlineVersion ?? baseOutline.version),
        ),
      );
    const currentRows = await tx
      .select()
      .from(lessons)
      .where(
        and(
          eq(lessons.courseId, courseId),
          eq(lessons.outlineVersion, currentOutline.version),
        ),
      );
    const baseByRef = new Map(baseRows.map((r) => [r.lessonRef, r]));
    const currentByRef = new Map(currentRows.map((r) => [r.lessonRef, r]));

    const undoVersion = currentOutline.version + 1;
    await tx.insert(outlines).values({ courseId, version: undoVersion, data: inverted });

    /* Lessons the undo removes (an added Lesson leaving): their fragments
       must be deleted, not just left behind. */
    const undoRefs = new Set(
      inverted.modules.flatMap((m) => m.lessons.map((l) => l.id)),
    );
    const removedLessons = [...currentByRef.values()]
      .map((r) => r.lessonRef)
      .filter((ref) => !undoRefs.has(ref));

    const restoredLessons: string[] = [];
    const rows: (typeof lessons.$inferInsert)[] = [];
    for (const m of inverted.modules) {
      for (const l of m.lessons) {
        const source = restored.has(l.id) ? baseByRef.get(l.id) : currentByRef.get(l.id);
        if (!source) {
          return {
            ok: false,
            reason: "invalid",
            message: `The Lesson "${l.title}" has no content to restore.`,
          };
        }
        if (restored.has(l.id)) restoredLessons.push(l.id);
        rows.push({
          courseId,
          outlineVersion: undoVersion,
          lessonRef: source.lessonRef,
          title: l.title,
          body: source.body,
          workedExample: source.workedExample,
          recallPrompt: source.recallPrompt,
          selfExplanationPrompt: source.selfExplanationPrompt,
          exercise: source.exercise,
          bridge: source.bridge,
        });
      }
    }
    if (rows.length > 0) await tx.insert(lessons).values(rows);

    /* The swap: a new revision number over the undo version. */
    const [newest] = await tx
      .select({ n: max(revisions.revisionNumber) })
      .from(revisions)
      .where(eq(revisions.courseId, courseId));
    const nextNumber = (newest?.n ?? 0) + 1;
    await tx
      .insert(revisions)
      .values({ courseId, revisionNumber: nextNumber, outlineVersion: undoVersion });

    /* Completion: the touched identities go back to the moment before
       the plan published. */
    await tx
      .delete(completions)
      .where(
        and(
          eq(completions.courseId, courseId),
          inArray(completions.lessonRef, plan.touchedLessons),
        ),
      );
    const snapshot = plan.completionSnapshot ?? [];
    const back = snapshot.filter((s) => plan.touchedLessons!.includes(s.lessonRef));
    if (back.length > 0) {
      await tx.insert(completions).values(
        back.map((s) => ({
          courseId,
          lessonRef: s.lessonRef,
          doneAt: new Date(s.doneAt),
        })),
      );
    }

    await tx
      .update(changePlans)
      .set({ status: "undone", updatedAt: new Date() })
      .where(eq(changePlans.id, planId));

    await recomputeCourseCompletion(tx, courseId);

    return {
      ok: true,
      revisionNumber: nextNumber,
      outlineVersion: undoVersion,
      restoredLessons,
      removedLessons,
    };
  });
}
