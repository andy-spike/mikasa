import "server-only";

/**
 * The Tailor's server side (ticket #12): a per-Course conversation with
 * its own canonical history, and the Change plans its turns propose. A
 * plan pins itself to the Outline version (and, for a published Course,
 * the revision) it was drawn against; applying it later is rejected if
 * the Course has moved past that. Reviewing — accepting or discarding
 * operations — writes nothing to the Course itself.
 */
import { and, asc, desc, eq, max } from "drizzle-orm";
import type { Db } from "./index";
import {
  changeOperations,
  changePlans,
  courses,
  outlines,
  tailorConversations,
  tailorMessages,
} from "./schema";
import { StructureError } from "@/lib/course/structure";
import { validatePlanOps } from "@/lib/course/change-plan";
import type { ChangePlanOp } from "@/lib/course/change-plan";
import { applyOutlineChange } from "./outline";
import type { LessonAdjustment } from "@/lib/course/types";
import type { OutlineData } from "@/lib/course/types";
import { isStructureOp } from "@/lib/course/change-plan";
import { currentRevision } from "./review";

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

  try {
    validatePlanOps(outline.data, ops);
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
      ops.map((op, position) => ({
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
