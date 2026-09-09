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

const title = z.string().min(1).max(200);
const summary = z.string().max(500);
const lessonId = z.string().min(1);
const moduleId = z.string().min(1);

export const changePlanOpSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("addModule"),
    title,
    moduleId: moduleId.optional(),
  }),
  z.object({
    kind: z.literal("renameModule"),
    moduleId,
    title,
  }),
  z.object({ kind: z.literal("removeModule"), moduleId }),
  z.object({
    kind: z.literal("moveModule"),
    moduleId,
    toIndex: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal("addLesson"),
    moduleId,
    title,
    summary,
  }),
  z.object({
    kind: z.literal("renameLesson"),
    lessonId,
    title,
    summary,
  }),
  z.object({ kind: z.literal("removeLesson"), lessonId }),
  z.object({
    kind: z.literal("moveLesson"),
    lessonId,
    toModuleId: z.string().min(1),
    toIndex: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal("splitLesson"),
    lessonId,
    secondTitle: z.string().min(1).max(200),
    secondSummary: z.string().max(500),
  }),
  z.object({
    kind: z.literal("mergeLesson"),
    lessonId,
    direction: z.enum(["next", "previous"]),
  }),
  z.object({
    kind: z.literal("lessonProse"),
    lessonId,
    instruction: z.string().min(1).max(2000),
  }),
  z.object({
    kind: z.literal("exercise"),
    lessonId,
    task: z.string().min(1).max(2000),
    check: z.string().min(1).max(2000),
  }),
]) satisfies z.ZodType<ChangePlanOp>;

export const changePlanSchema = z.object({
  ops: z.array(changePlanOpSchema).min(1).max(10),
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
    if (!current.modules.some((m) => m.lessons.some((l) => l.id === op.lessonId))) {
      throw new StructureError("That Lesson is not in the Outline.");
    }
  }
  flush();

  const problems = outlineApprovalProblems(current);
  if (problems.length > 0) {
    throw new StructureError(problems.join(" "));
  }
}

const OP_VERBS: Record<ChangePlanOp["kind"], string> = {
  addModule: "add",
  renameModule: "rename",
  removeModule: "remove",
  moveModule: "move",
  addLesson: "add",
  renameLesson: "rename",
  removeLesson: "remove",
  moveLesson: "move",
  splitLesson: "split",
  mergeLesson: "merge",
  lessonProse: "rewrite",
  exercise: "reexercise",
};

export function opVerb(op: ChangePlanOp): string {
  return OP_VERBS[op.kind];
}

export function opEntry(op: ChangePlanOp): string {
  if ("title" in op) return op.title;
  if (op.kind === "splitLesson") return op.secondTitle;
  if ("lessonId" in op) return op.lessonId;
  return op.moduleId;
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
  return "lessonId" in op ? [op.lessonId] : [];
}

export function opModuleIds(op: ChangePlanOp): string[] {
  if (op.kind === "moveLesson") return [op.toModuleId];
  if (op.kind === "addModule") return [];
  return "moduleId" in op ? [op.moduleId] : [];
}

export type AffectedLessonSets = {
  regenerate: string[];
  embed: string[];
  removed: string[];
};

function titlesById(outline: OutlineData): Map<string, string> {
  const titles = new Map<string, string>();
  for (const mod of outline.modules)
    for (const lesson of mod.lessons) titles.set(lesson.id, lesson.title);
  return titles;
}

export function affectedLessonSets(
  base: OutlineData,
  next: OutlineData,
  accepted: ChangePlanOp[],
): AffectedLessonSets {
  const oldTitles = titlesById(base);
  const newTitles = titlesById(next);

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
  for (const mod of base.modules) {
    const index = mod.lessons.findIndex((l) => l.id === op.lessonId);
    if (index === -1) continue;
    return mod.lessons[op.direction === "next" ? index + 1 : index - 1]?.id ?? null;
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
    if (op.kind === "removeModule") {
      const removed = base.modules.find((m) => m.id === op.moduleId);
      if (removed) for (const l of removed.lessons) lessons.add(l.id);
    }
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
  for (const mod of base.modules) {
    for (const [index, lesson] of mod.lessons.entries()) {
      baseLessons.set(lesson.id, { module: mod.id, index, lesson });
    }
  }
  const baseModules = new Map(base.modules.map((mod) => [mod.id, mod]));

  let working: OutlineModule[] = current.modules
    .filter((mod) => !(modules.has(mod.id) && !baseModules.has(mod.id)))
    .map((mod) => ({
      ...mod,
      lessons: mod.lessons.filter((lesson) => !lessons.has(lesson.id)),
    }));

  working = working.map((mod) => {
    if (!modules.has(mod.id)) return mod;
    const baseModule = baseModules.get(mod.id);
    return baseModule ? { ...mod, title: baseModule.title } : mod;
  });

  for (const mod of base.modules) {
    if (!modules.has(mod.id) || working.some((w) => w.id === mod.id)) continue;
    const baseIndex = base.modules.findIndex((b) => b.id === mod.id);
    working.splice(Math.min(baseIndex, working.length), 0, {
      ...mod,
      lessons: mod.lessons.map((lesson) => ({ ...lesson })),
    });
  }

  for (const [id, at] of baseLessons) {
    if (!lessons.has(id)) continue;
    const targetIndex = working.findIndex((mod) => mod.id === at.module);
    if (targetIndex === -1) continue;
    working[targetIndex] = {
      ...working[targetIndex],
      lessons: working[targetIndex].lessons.toSpliced(at.index, 0, { ...at.lesson }),
    };
  }

  return renumberOutline(working);
}
