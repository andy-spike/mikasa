import { z } from "zod";
import {
  applyOutlineOps,
  outlineApprovalProblems,
  renumberOutline,
  StructureError,
} from "./structure";
import type { OutlineOp } from "./structure";
import type { OutlineData, OutlineLesson, OutlineModule } from "./types";

export type LessonProseOp = {
  kind: "lessonProse";
  lessonId: string;
  instruction: string;
};

export type ExerciseOp = {
  kind: "exercise";
  lessonId: string;
  task: string;
  check: string;
};

export type ChangePlanOp = OutlineOp | LessonProseOp | ExerciseOp;

export const changePlanOpSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("addModule"),
    title: z.string().min(1).max(200),
    moduleId: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal("renameModule"),
    moduleId: z.string().min(1),
    title: z.string().min(1).max(200),
  }),
  z.object({ kind: z.literal("removeModule"), moduleId: z.string().min(1) }),
  z.object({
    kind: z.literal("moveModule"),
    moduleId: z.string().min(1),
    toIndex: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal("addLesson"),
    moduleId: z.string().min(1),
    title: z.string().min(1).max(200),
    summary: z.string().max(500),
  }),
  z.object({
    kind: z.literal("renameLesson"),
    lessonId: z.string().min(1),
    title: z.string().min(1).max(200),
    summary: z.string().max(500),
  }),
  z.object({ kind: z.literal("removeLesson"), lessonId: z.string().min(1) }),
  z.object({
    kind: z.literal("moveLesson"),
    lessonId: z.string().min(1),
    toModuleId: z.string().min(1),
    toIndex: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal("splitLesson"),
    lessonId: z.string().min(1),
    secondTitle: z.string().min(1).max(200),
    secondSummary: z.string().max(500),
  }),
  z.object({
    kind: z.literal("mergeLesson"),
    lessonId: z.string().min(1),
    direction: z.enum(["next", "previous"]),
  }),
  z.object({
    kind: z.literal("lessonProse"),
    lessonId: z.string().min(1),
    instruction: z.string().min(1).max(2000),
  }),
  z.object({
    kind: z.literal("exercise"),
    lessonId: z.string().min(1),
    task: z.string().min(1).max(2000),
    check: z.string().min(1).max(2000),
  }),
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

export function isStructureOp(op: ChangePlanOp): op is OutlineOp {
  return STRUCTURE_KINDS.has(op.kind);
}

// Validated against a throwaway copy before anything is stored, so a bad plan is refused up front.
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

  const problems = outlineApprovalProblems(current);
  if (problems.length > 0) {
    throw new StructureError(problems.join(" "));
  }
}

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
  regenerate: string[];
  embed: string[];
  removed: string[];
};

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

export function preservesCompletion(op: ChangePlanOp): boolean {
  return (
    op.kind === "renameModule" ||
    op.kind === "moveModule" ||
    op.kind === "renameLesson" ||
    op.kind === "moveLesson" ||
    op.kind === "lessonProse"
  );
}

function mergeAbsorbedId(
  op: Extract<ChangePlanOp, { kind: "mergeLesson" }>,
  base: OutlineData,
): string | null {
  for (const m of base.modules) {
    const index = m.lessons.findIndex((l) => l.id === op.lessonId);
    if (index === -1) continue;
    const neighbor = op.direction === "next" ? m.lessons[index + 1] : m.lessons[index - 1];
    return neighbor?.id ?? null;
  }
  return null;
}

export function completionResetRefs(accepted: ChangePlanOp[], base: OutlineData): string[] {
  const reset = new Set<string>();
  for (const op of accepted) {
    if (op.kind === "exercise" || op.kind === "splitLesson") {
      reset.add(op.lessonId);
    } else if (op.kind === "mergeLesson") {
      const survivor = op.direction === "next" ? op.lessonId : mergeAbsorbedId(op, base);
      if (survivor) reset.add(survivor);
    }
  }
  return [...reset];
}

export function touchedIdentities(
  accepted: ChangePlanOp[],
  base: OutlineData,
): { lessons: string[]; modules: string[] } {
  const lessons = new Set<string>();
  const modules = new Set<string>();
  for (const op of accepted) {
    for (const id of opLessonIds(op)) lessons.add(id);
    for (const id of opModuleIds(op)) modules.add(id);
    // A merge takes the absorbed Lesson's identity with it: undo must bring it back.
    if (op.kind === "mergeLesson") {
      const absorbed = mergeAbsorbedId(op, base);
      if (absorbed) lessons.add(absorbed);
    }
  }
  for (const op of accepted) {
    if (op.kind !== "removeModule") continue;
    const removed = base.modules.find((m) => m.id === op.moduleId);
    if (removed) for (const l of removed.lessons) lessons.add(l.id);
  }
  return { lessons: [...lessons], modules: [...modules] };
}

export function undoOutline(
  base: OutlineData,
  current: OutlineData,
  touchedLessons: string[],
  touchedModules: string[],
): OutlineData {
  const lessons = new Set(touchedLessons);
  const modules = new Set(touchedModules);
  const baseLessons = new Map<string, { module: string; index: number; lesson: OutlineLesson }>();
  for (const m of base.modules) {
    for (const [index, l] of m.lessons.entries()) {
      baseLessons.set(l.id, { module: m.id, index, lesson: l });
    }
  }
  const baseModules = new Map(base.modules.map((m) => [m.id, m]));

  let working: OutlineModule[] = current.modules
    .filter((m) => !(modules.has(m.id) && !baseModules.has(m.id)))
    .map((m) => ({
      ...m,
      lessons: m.lessons.filter((l) => !lessons.has(l.id)),
    }));

  working = working.map((m) => {
    if (!modules.has(m.id)) return m;
    const baseModule = baseModules.get(m.id);
    return baseModule ? { ...m, title: baseModule.title } : m;
  });

  for (const m of base.modules) {
    if (!modules.has(m.id) || working.some((w) => w.id === m.id)) continue;
    const baseIndex = base.modules.findIndex((b) => b.id === m.id);
    working.splice(Math.min(baseIndex, working.length), 0, {
      ...m,
      lessons: m.lessons.map((l) => ({ ...l })),
    });
  }

  for (const [id, at] of baseLessons) {
    if (!lessons.has(id)) continue;
    const targetIndex = working.findIndex((m) => m.id === at.module);
    if (targetIndex === -1) continue;
    working[targetIndex] = {
      ...working[targetIndex],
      lessons: [
        ...working[targetIndex].lessons.slice(0, at.index),
        { ...at.lesson },
        ...working[targetIndex].lessons.slice(at.index),
      ],
    };
  }

  return renumberOutline(working);
}
