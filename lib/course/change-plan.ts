/**
 * Change plans (ticket #12): the Tailor proposes operations, the Learner
 * accepts or discards each one, and accepted operations apply together
 * later (tickets #13/#14). Structure operations are the manual editor's
 * own grammar (`OutlineOp`) — a change is the same change however it
 * arrives. Content operations describe what should be rewritten inside a
 * Lesson's prose or Exercise.
 */
import { z } from "zod";
import { applyOutlineOps, StructureError } from "./structure";
import type { OutlineOp } from "./structure";
import type { OutlineData } from "./types";

/** A Lesson prose rewrite: an instruction the generator carries out. */
export type LessonProseOp = {
  kind: "lessonProse";
  lessonId: string;
  instruction: string;
};

/** A rewritten Exercise: concrete task and check, not an instruction. */
export type ExerciseOp = {
  kind: "exercise";
  lessonId: string;
  task: string;
  check: string;
};

export type ChangePlanOp = OutlineOp | LessonProseOp | ExerciseOp;

export const changePlanOpSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("addModule"), title: z.string().min(1).max(200) }),
  z.object({ kind: z.literal("renameModule"), moduleId: z.string().min(1), title: z.string().min(1).max(200) }),
  z.object({ kind: z.literal("removeModule"), moduleId: z.string().min(1) }),
  z.object({ kind: z.literal("moveModule"), moduleId: z.string().min(1), toIndex: z.number().int().min(0) }),
  z.object({ kind: z.literal("addLesson"), moduleId: z.string().min(1), title: z.string().min(1).max(200), summary: z.string().max(500) }),
  z.object({ kind: z.literal("renameLesson"), lessonId: z.string().min(1), title: z.string().min(1).max(200), summary: z.string().max(500) }),
  z.object({ kind: z.literal("removeLesson"), lessonId: z.string().min(1) }),
  z.object({ kind: z.literal("moveLesson"), lessonId: z.string().min(1), toModuleId: z.string().min(1), toIndex: z.number().int().min(0) }),
  z.object({ kind: z.literal("splitLesson"), lessonId: z.string().min(1), secondTitle: z.string().min(1).max(200), secondSummary: z.string().max(500) }),
  z.object({ kind: z.literal("mergeLesson"), lessonId: z.string().min(1), direction: z.enum(["next", "previous"]) }),
  z.object({ kind: z.literal("lessonProse"), lessonId: z.string().min(1), instruction: z.string().min(1).max(2000) }),
  z.object({ kind: z.literal("exercise"), lessonId: z.string().min(1), task: z.string().min(1).max(2000), check: z.string().min(1).max(2000) }),
]) satisfies z.ZodType<ChangePlanOp>;

export const changePlanSchema = z.object({
  ops: z.array(changePlanOpSchema).min(1).max(20),
});

const STRUCTURE_KINDS = new Set([
  "addModule",
  "renameModule",
  "removeModule",
  "moveModule",
  "addLesson",
  "renameLesson",
  "removeLesson",
  "moveLesson",
  "splitLesson",
  "mergeLesson",
]);

/** A plan operation that is a plain Outline operation. */
export function isStructureOp(op: ChangePlanOp): op is OutlineOp {
  return STRUCTURE_KINDS.has(op.kind);
}

/**
 * Whether a plan would actually take: structure operations are applied to
 * a throwaway copy of the Outline in order (the manual editor's own
 * grammar, so the same refusals apply), and a content change needs its
 * Lesson to still exist once the structure operations before it have run.
 * Throws `StructureError` on the first operation that does not fit.
 */
export function validatePlanOps(data: OutlineData, ops: ChangePlanOp[]): void {
  let current = data;
  let structure: OutlineOp[] = [];

  const flush = () => {
    if (structure.length > 0) {
      current = applyOutlineOps(current, structure);
      structure = [];
    }
  };

  for (const op of ops) {
    if (isStructureOp(op)) {
      structure.push(op);
      continue;
    }
    flush();
    const lessonId = op.kind === "lessonProse" || op.kind === "exercise" ? op.lessonId : null;
    if (lessonId && !current.modules.some((m) => m.lessons.some((l) => l.id === lessonId))) {
      throw new StructureError("That Lesson is not in the Outline.");
    }
  }
  flush();
}

/** The verb the pane's label row reads. */
export function opVerb(op: ChangePlanOp): string {
  switch (op.kind) {
    case "addModule":
      return "add";
    case "renameModule":
      return "rename";
    case "removeModule":
      return "remove";
    case "moveModule":
      return "move";
    case "addLesson":
      return "add";
    case "renameLesson":
      return "rename";
    case "removeLesson":
      return "remove";
    case "moveLesson":
      return "move";
    case "splitLesson":
      return "split";
    case "mergeLesson":
      return "merge";
    case "lessonProse":
      return "rewrite";
    case "exercise":
      return "reexercise";
  }
}

/** What the change names, as the pane's dim right-hand entry. */
export function opEntry(op: ChangePlanOp): string {
  switch (op.kind) {
    case "addModule":
      return op.title;
    case "renameModule":
      return op.title;
    case "removeModule":
      return op.moduleId;
    case "moveModule":
      return op.moduleId;
    case "addLesson":
      return op.title;
    case "renameLesson":
      return op.title;
    case "removeLesson":
      return op.lessonId;
    case "moveLesson":
      return op.lessonId;
    case "splitLesson":
      return op.secondTitle;
    case "mergeLesson":
      return op.lessonId;
    case "lessonProse":
      return op.lessonId;
    case "exercise":
      return op.lessonId;
  }
}

/** One sentence on what changes and why it reads the way it does. */
export function opDetail(op: ChangePlanOp): string {
  switch (op.kind) {
    case "addModule":
      return `A new Module: "${op.title}".`;
    case "renameModule":
      return `The Module becomes "${op.title}".`;
    case "removeModule":
      return "The Module and its Lessons leave the Outline.";
    case "moveModule":
      return `The Module moves to position ${op.toIndex + 1}.`;
    case "addLesson":
      return `A new Lesson, "${op.title}": ${op.summary}`;
    case "renameLesson":
      return `The Lesson becomes "${op.title}": ${op.summary}`;
    case "removeLesson":
      return "The Lesson leaves the Course; its Completion is kept.";
    case "moveLesson":
      return `The Lesson moves into another Module at position ${op.toIndex + 1}.`;
    case "splitLesson":
      return `The Lesson splits in two; the second becomes "${op.secondTitle}".`;
    case "mergeLesson":
      return `The Lesson merges into the ${op.direction} Lesson.`;
    case "lessonProse":
      return op.instruction;
    case "exercise":
      return `Exercise becomes: ${op.task} Done when: ${op.check}`;
  }
}

/**
 * The Lesson ids an operation touches, used by the completion rules
 * (#15) and the undo-overlap check (#15).
 */
export function opLessonIds(op: ChangePlanOp): string[] {
  switch (op.kind) {
    case "renameLesson":
    case "removeLesson":
    case "moveLesson":
    case "splitLesson":
    case "mergeLesson":
    case "lessonProse":
    case "exercise":
      return [op.lessonId];
    case "addLesson":
    case "addModule":
    case "renameModule":
    case "removeModule":
    case "moveModule":
      return [];
  }
}

/** The Module ids an operation touches. */
export function opModuleIds(op: ChangePlanOp): string[] {
  switch (op.kind) {
    case "addModule":
    case "renameModule":
    case "removeModule":
    case "moveModule":
      if (op.kind === "addModule") return [];
      return [op.moduleId];
    case "addLesson":
      return [op.moduleId];
    case "moveLesson":
      return [op.toModuleId];
    default:
      return [];
  }
}

export type AffectedLessonSets = {
  /** Lessons whose content must be regenerated: new or rewritten. */
  regenerate: string[];
  /** Lessons to re-embed after publish: regenerated, retitled, or gone. */
  embed: string[];
  /** Lessons that left the Outline; their fragments are deleted. */
  removed: string[];
};

/**
 * The affected sets between the Outline a plan was drawn against and the
 * staged one (ticket #14). New ids (added Lessons, split halves) and
 * Lessons with content demands regenerate; renamed Lessons copy with
 * their new title and only re-embed (the title prefixes their search
 * fragments); removed Lessons leave no row behind.
 */
export function affectedLessonSets(
  base: OutlineData,
  next: OutlineData,
  accepted: ChangePlanOp[],
): AffectedLessonSets {
  const oldTitles = new Map<string, string>();
  for (const m of base.modules) for (const l of m.lessons) oldTitles.set(l.id, l.title);
  const newTitles = new Map<string, string>();
  for (const m of next.modules) for (const l of m.lessons) newTitles.set(l.id, l.title);

  const regenerate = new Set<string>();
  for (const op of accepted) {
    if (
      op.kind === "lessonProse" ||
      op.kind === "exercise" ||
      op.kind === "splitLesson" ||
      op.kind === "mergeLesson"
    ) {
      for (const id of opLessonIds(op)) if (newTitles.has(id)) regenerate.add(id);
    }
  }
  for (const id of newTitles.keys()) if (!oldTitles.has(id)) regenerate.add(id);

  const removed = [...oldTitles.keys()].filter((id) => !newTitles.has(id));
  const retitle = [...newTitles.keys()].filter(
    (id) => oldTitles.has(id) && oldTitles.get(id) !== newTitles.get(id),
  );
  return {
    regenerate: [...regenerate],
    embed: [...regenerate, ...retitle, ...removed],
    removed,
  };
}

/** Whether an operation changes only names or placement, not substance. */
export function preservesCompletion(op: ChangePlanOp): boolean {
  return (
    op.kind === "renameModule" ||
    op.kind === "moveModule" ||
    op.kind === "renameLesson" ||
    op.kind === "moveLesson" ||
    op.kind === "lessonProse"
  );
}
