import "server-only";

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
import {
  applyOutlineOps,
  outlineApprovalProblems,
  outlineLessonRefs,
  StructureError,
} from "@/lib/course/structure";
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
import { findOwnedCourse } from "./courses";
import { latestOutline } from "./design";
import type { LessonAdjustment, OutlineData } from "@/lib/course/types";
import { currentRevision, resetGenerationRun } from "./review";
import { recomputeCourseCompletion } from "./completion";

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
  stagedOutlineVersion: number | null;
  publishedRevisionNumber: number | null;
  touchedLessons: string[] | null;
  touchedModules: string[] | null;
  regeneratedLessons: string[] | null;
  operations: ChangeOperationRow[];
  createdAt: Date;
};

async function findTailorConversationId(
  db: Db,
  ownerId: string,
  courseId: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ id: tailorConversations.id })
    .from(tailorConversations)
    .innerJoin(courses, eq(courses.id, tailorConversations.courseId))
    .where(and(eq(tailorConversations.courseId, courseId), eq(courses.ownerId, ownerId)))
    .limit(1);
  return row?.id;
}

export async function findTailorConversation(
  db: Db,
  ownerId: string,
  courseId: string,
): Promise<string | undefined> {
  return findTailorConversationId(db, ownerId, courseId);
}

function toTailorTurnRow(r: {
  id: string;
  seq: number;
  role: string;
  content: string;
  createdAt: Date;
}): TailorTurnRow {
  return {
    id: r.id,
    seq: r.seq,
    role: r.role as TailorTurnRow["role"],
    content: r.content,
    createdAt: r.createdAt,
  };
}

export async function getOrCreateTailorConversation(
  db: Db,
  ownerId: string,
  courseId: string,
): Promise<string | undefined> {
  const course = await findOwnedCourse(db, ownerId, courseId);
  if (!course) return undefined;

  // Parallel calls can create the row twice: the unique index decides the
  // winner, and the loser rereads the winning row instead of failing.
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

export async function listTailorMessages(db: Db, conversationId: string): Promise<TailorTurnRow[]> {
  const rows = await db
    .select()
    .from(tailorMessages)
    .where(eq(tailorMessages.conversationId, conversationId))
    .orderBy(asc(tailorMessages.seq));
  return rows.map(toTailorTurnRow);
}

export async function loadTailorHistory(
  db: Db,
  ownerId: string,
  courseId: string,
): Promise<TailorTurnRow[]> {
  const conversationId = await findTailorConversationId(db, ownerId, courseId);
  if (!conversationId) return [];
  return listTailorMessages(db, conversationId);
}

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

export async function createChangePlan(
  db: Db,
  ownerId: string,
  courseId: string,
  ops: ChangePlanOp[],
): Promise<
  | { ok: true; plan: ChangePlanRow }
  | { ok: false; reason: "not-found" | "invalid"; message: string }
> {
  const course = await findOwnedCourse(db, ownerId, courseId);
  if (!course) return { ok: false, reason: "not-found", message: "Course not found." };

  const outline = await latestOutline(db, courseId);
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

  const operations = await loadOperations(db, plan.id);

  return {
    ok: true,
    plan: toChangePlanRow(plan, operations),
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

type PlanFields = Pick<
  typeof changePlans.$inferSelect,
  | "id"
  | "status"
  | "baseOutlineVersion"
  | "baseRevisionNumber"
  | "stagedOutlineVersion"
  | "publishedRevisionNumber"
  | "touchedLessons"
  | "touchedModules"
  | "regeneratedLessons"
  | "createdAt"
>;

function toChangePlanRow(plan: PlanFields, operations: ChangeOperationRow[]): ChangePlanRow {
  return {
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
    operations,
  };
}

async function loadOperations(db: Db, planId: string): Promise<ChangeOperationRow[]> {
  const operations = await db
    .select()
    .from(changeOperations)
    .where(eq(changeOperations.planId, planId))
    .orderBy(asc(changeOperations.position));
  return operations.map(toOperationRow);
}

function acceptedOps(operations: { status: string; payload: unknown }[]): ChangePlanOp[] {
  return operations.filter((o) => o.status === "accepted").map((o) => o.payload as ChangePlanOp);
}

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
  const operations = await loadOperations(db, plan.change_plans.id);
  return toChangePlanRow(plan.change_plans, operations);
}

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

  const [plan] = await db.select().from(changePlans).where(eq(changePlans.id, planId)).limit(1);
  if (!plan || plan.status !== "proposed") {
    return { ok: false, message: "This plan is no longer under review." };
  }

  await db
    .update(changeOperations)
    .set({ status })
    .where(and(eq(changeOperations.id, operationId), eq(changeOperations.planId, planId)));
  return { ok: true };
}

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
  const operations = await loadOperations(db, planId);
  return toChangePlanRow(plan.change_plans, operations);
}

export async function listPlansWithOperations(db: Db, courseId: string): Promise<ChangePlanRow[]> {
  const plans = await db
    .select()
    .from(changePlans)
    .where(eq(changePlans.courseId, courseId))
    .orderBy(asc(changePlans.createdAt));
  return Promise.all(
    plans.map(async (plan) => toChangePlanRow(plan, await loadOperations(db, plan.id))),
  );
}

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
    const course = await findOwnedCourse(tx, ownerId, courseId);
    if (!course) {
      return { ok: false, reason: "not-found", message: "Course not found." };
    }

    const [plan] = await tx.select().from(changePlans).where(eq(changePlans.id, planId)).limit(1);
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
        message: "This Course has left the Outline checkpoint; it changes through revisions now.",
      };
    }

    const operations = await tx
      .select()
      .from(changeOperations)
      .where(eq(changeOperations.planId, planId))
      .orderBy(asc(changeOperations.position));
    const accepted = acceptedOps(operations);
    if (accepted.length === 0) {
      return {
        ok: false,
        reason: "nothing-accepted",
        message: "Accept at least one operation to apply the plan.",
      };
    }

    const structureOps = accepted.filter(isStructureOp);

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

function mergeAdjustment(byLesson: Map<string, LessonAdjustment>, op: ChangePlanOp): void {
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
      mergeAdjustment(byLesson, operation.payload);
    }
  }
  const live = new Set(outlineLessonRefs(outline));
  return [...byLesson.values()].filter((a) => live.has(a.lessonId));
}

export async function planContentAdjustments(db: Db, planId: string): Promise<LessonAdjustment[]> {
  const operations = await db
    .select()
    .from(changeOperations)
    .where(eq(changeOperations.planId, planId))
    .orderBy(asc(changeOperations.position));
  const byLesson = new Map<string, LessonAdjustment>();
  for (const operation of operations) {
    if (operation.status !== "accepted") continue;
    mergeAdjustment(byLesson, operation.payload as ChangePlanOp);
  }
  return [...byLesson.values()];
}

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
      regenerateLessonRefs: string[];
      embedLessonRefs: string[];
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
 * Stages a plan as a new outline version without touching the published
 * revision. A newer revision or outline version rejects the whole plan,
 * and only one staged candidate exists at a time.
 */
export async function stagePlanRevision(
  db: Db,
  ownerId: string,
  courseId: string,
  planId: string,
): Promise<StageRevisionResult> {
  return db.transaction(async (tx) => {
    const course = await findOwnedCourse(tx, ownerId, courseId);
    if (!course) {
      return { ok: false, reason: "not-found", message: "Course not found." };
    }

    const [plan] = await tx.select().from(changePlans).where(eq(changePlans.id, planId)).limit(1);
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

    const revision = await currentRevision(tx, courseId);
    if (!revision || plan.baseRevisionNumber !== revision.revisionNumber) {
      return {
        ok: false,
        reason: "stale",
        message:
          "The Course has a newer revision than this plan was drawn against. Review the Course as it is now and ask again.",
      };
    }
    const baseOutline = await latestOutline(tx, courseId);
    if (!baseOutline || plan.baseOutlineVersion !== baseOutline.version) {
      return {
        ok: false,
        reason: "stale",
        message:
          "The Outline has moved past this plan. Review the Course as it is now and ask again.",
      };
    }

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
    const accepted = acceptedOps(operations);
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
      return {
        ok: false,
        reason: "invalid",
        message: "The published Course specification is gone.",
      };
    }
    await tx.insert(courseSpecs).values({
      courseId,
      outlineVersion: stagedVersion,
      spec: baseSpec.spec,
    });

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
    for (const m of nextData.modules) for (const l of m.lessons) newTitles.set(l.id, l.title);
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

    const touched = touchedIdentities(accepted, baseOutline.data);
    const baseLessonIds = new Set(outlineLessonRefs(baseOutline.data));
    for (const id of outlineLessonRefs(nextData)) {
      if (!baseLessonIds.has(id)) touched.lessons.push(id);
    }
    const baseModuleIds = new Set(baseOutline.data.modules.map((m) => m.id));
    for (const m of nextData.modules) {
      if (!baseModuleIds.has(m.id)) touched.modules.push(m.id);
    }

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
  const operations = await loadOperations(db, plan.change_plans.id);
  return toChangePlanRow(plan.change_plans, operations);
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

export async function resumeStagedRevision(
  db: Db,
  ownerId: string,
  courseId: string,
  planId: string,
): Promise<ResumeStagedRevision> {
  const course = await findOwnedCourse(db, ownerId, courseId);
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
    .where(and(eq(outlines.courseId, courseId), eq(outlines.version, plan.stagedOutlineVersion)))
    .limit(1);
  if (!stagedOutline) {
    return { ok: false, reason: "not-retryable", message: "The staged Outline is gone." };
  }
  const [baseOutline] = await db
    .select()
    .from(outlines)
    .where(and(eq(outlines.courseId, courseId), eq(outlines.version, plan.baseOutlineVersion)))
    .limit(1);
  if (!baseOutline) {
    return { ok: false, reason: "not-retryable", message: "The base Outline is gone." };
  }

  const accepted = plan.operations.filter((o) => o.status === "accepted").map((o) => o.payload);
  const affected = affectedLessonSets(baseOutline.data, stagedOutline.data, accepted);
  // Retry retains the expanded correction set: corrections may have reached
  // related Lessons beyond the original regenerate list. Union the stored
  // touched set so Undo overlap checks and embeddings see the full set.
  const touchedLessons = plan.touchedLessons ?? [];
  const storedTouched = new Set([...touchedLessons, ...(plan.regeneratedLessons ?? [])]);
  const regenerate = [
    ...new Set([
      ...affected.regenerate,
      ...[...storedTouched].filter((r) => touchedLessons.includes(r)),
    ]),
  ];
  const embed = [...new Set([...affected.embed, ...touchedLessons])];

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
    regenerateLessonRefs: regenerate,
    embedLessonRefs: embed,
  };
}

export type DiscardStagedRevision =
  | { ok: true }
  | { ok: false; reason: "not-found" | "not-discardable"; message: string };

/** Discards a settled staged revision. Refuses while work is still running: a discard could kill a revision about to publish. */
export async function discardStagedRevision(
  db: Db,
  ownerId: string,
  courseId: string,
  planId: string,
): Promise<DiscardStagedRevision> {
  const course = await findOwnedCourse(db, ownerId, courseId);
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

export async function markRevisionPublished(
  db: Db,
  planId: string,
  revisionNumber: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [plan] = await tx.select().from(changePlans).where(eq(changePlans.id, planId)).limit(1);
    if (!plan) throw new Error("The published plan vanished.");

    const operations = await tx
      .select()
      .from(changeOperations)
      .where(eq(changeOperations.planId, planId))
      .orderBy(asc(changeOperations.position));
    const accepted = acceptedOps(operations);

    const [baseOutline] = await tx
      .select()
      .from(outlines)
      .where(
        and(eq(outlines.courseId, plan.courseId), eq(outlines.version, plan.baseOutlineVersion)),
      )
      .limit(1);
    if (!baseOutline) throw new Error("The plan's base Outline vanished.");
    const resetRefs = completionResetRefs(accepted, baseOutline.data);

    const rows = await tx.select().from(completions).where(eq(completions.courseId, plan.courseId));
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
          and(eq(completions.courseId, plan.courseId), inArray(completions.lessonRef, resetRefs)),
        );
    }
    await recomputeCourseCompletion(tx, plan.courseId);
  });
}

export type UndoResult =
  | {
      ok: true;
      revisionNumber: number;
      outlineVersion: number;
      restoredLessons: string[];
      removedLessons: string[];
    }
  | {
      ok: false;
      reason: "not-found" | "not-undoable" | "blocked-overlap" | "blocked-inflight" | "invalid";
      message: string;
    };

/**
 * Undoes a published plan in one transaction. The overlap rule is the
 * safety: a later published plan that touched the same Lesson or Module
 * identities blocks the undo; independent later changes keep their place.
 */
export async function undoPlanRevision(
  db: Db,
  ownerId: string,
  courseId: string,
  planId: string,
): Promise<UndoResult> {
  return db.transaction(async (tx) => {
    const course = await findOwnedCourse(tx, ownerId, courseId);
    if (!course) {
      return { ok: false, reason: "not-found", message: "Course not found." };
    }

    const [plan] = await tx.select().from(changePlans).where(eq(changePlans.id, planId)).limit(1);
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

    const later = await tx
      .select()
      .from(changePlans)
      .where(and(eq(changePlans.courseId, courseId), eq(changePlans.status, "published")));
    const isLater = (q: (typeof later)[number]) =>
      q.id !== planId &&
      q.publishedRevisionNumber !== null &&
      q.publishedRevisionNumber > plan.publishedRevisionNumber!;
    const overlapping = later
      .filter(
        (q) => isLater(q) && (q.touchedLessons ?? []).some((l) => plan.touchedLessons!.includes(l)),
      )
      .map((q) => q.id);
    const overlappingModules = later
      .filter(
        (q) => isLater(q) && (q.touchedModules ?? []).some((m) => plan.touchedModules!.includes(m)),
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

    const revision = await currentRevision(tx, courseId);
    if (!revision) {
      return { ok: false, reason: "invalid", message: "The Course has no current revision." };
    }

    const [baseOutline] = await tx
      .select()
      .from(outlines)
      .where(and(eq(outlines.courseId, courseId), eq(outlines.version, plan.baseOutlineVersion)))
      .limit(1);
    const [currentOutline] = await tx
      .select()
      .from(outlines)
      .where(and(eq(outlines.courseId, courseId), eq(outlines.version, revision.outlineVersion)))
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
        and(eq(lessons.courseId, courseId), eq(lessons.outlineVersion, currentOutline.version)),
      );
    const baseByRef = new Map(baseRows.map((r) => [r.lessonRef, r]));
    const currentByRef = new Map(currentRows.map((r) => [r.lessonRef, r]));

    const undoVersion = currentOutline.version + 1;
    await tx.insert(outlines).values({ courseId, version: undoVersion, data: inverted });

    const undoRefs = new Set(outlineLessonRefs(inverted));
    const removedLessons = [...currentByRef.values()]
      .map((r) => r.lessonRef)
      .filter((ref) => !undoRefs.has(ref));

    const restoredLessons: string[] = [];
    const rows: (typeof lessons.$inferInsert)[] = [];
    for (const l of inverted.modules.flatMap((m) => m.lessons)) {
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
    if (rows.length > 0) await tx.insert(lessons).values(rows);

    const [newest] = await tx
      .select({ n: max(revisions.revisionNumber) })
      .from(revisions)
      .where(eq(revisions.courseId, courseId));
    const nextNumber = (newest?.n ?? 0) + 1;
    await tx
      .insert(revisions)
      .values({ courseId, revisionNumber: nextNumber, outlineVersion: undoVersion });

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
