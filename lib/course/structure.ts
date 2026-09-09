// Identity rules downstream depends on: rename/move keep ids; split keeps the first half's id;
// merge keeps the surviving Lesson's id and drops the other.
import { nanoid } from "nanoid";
import type { OutlineData, OutlineLesson, OutlineModule } from "./types";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export class StructureError extends Error {
  name = "StructureError";
}

export type OutlineOp =
  | { kind: "addModule"; title: string; moduleId?: string }
  | { kind: "renameModule"; moduleId: string; title: string }
  | { kind: "removeModule"; moduleId: string }
  | { kind: "moveModule"; moduleId: string; toIndex: number }
  | { kind: "addLesson"; moduleId: string; title: string; summary: string }
  | { kind: "renameLesson"; lessonId: string; title: string; summary: string }
  | { kind: "removeLesson"; lessonId: string }
  | { kind: "moveLesson"; lessonId: string; toModuleId: string; toIndex: number }
  | {
      kind: "splitLesson";
      lessonId: string;
      secondTitle: string;
      secondSummary: string;
    }
  | { kind: "mergeLesson"; lessonId: string; direction: "next" | "previous" };

export const TITLE_MAX = 200;
export const SUMMARY_MAX = 500;

function checkTitle(title: string, what: string): string {
  const trimmed = title.trim();
  if (!trimmed) throw new StructureError(`A ${what} needs a title.`);
  if (trimmed.length > TITLE_MAX) {
    throw new StructureError(`A ${what} title is at most ${TITLE_MAX} characters.`);
  }
  return trimmed;
}

function checkSummary(summary: string): string {
  const trimmed = summary.trim();
  if (trimmed.length > SUMMARY_MAX) {
    throw new StructureError(`A summary is at most ${SUMMARY_MAX} characters.`);
  }
  return trimmed;
}

function findModule(data: OutlineData, moduleId: string): OutlineModule {
  const mod = data.modules.find((m) => m.id === moduleId);
  if (!mod) throw new StructureError("That Module does not exist.");
  return mod;
}

function findModuleIndex(modules: OutlineModule[], moduleId: string): number {
  const index = modules.findIndex((m) => m.id === moduleId);
  if (index === -1) throw new StructureError("That Module does not exist.");
  return index;
}

function findLesson(
  data: OutlineData,
  lessonId: string,
): { module: OutlineModule; lesson: OutlineLesson; lessonIndex: number; moduleIndex: number } {
  for (const [mi, mod] of data.modules.entries()) {
    const li = mod.lessons.findIndex((l) => l.id === lessonId);
    if (li !== -1) {
      return {
        module: mod,
        lesson: mod.lessons[li],
        lessonIndex: li,
        moduleIndex: mi,
      };
    }
  }
  throw new StructureError("That Lesson does not exist.");
}

function renumber(modules: OutlineModule[]): OutlineData {
  let lessonOrdinal = 0;
  return {
    modules: modules.map((m, mi) => ({
      ...m,
      ordinal: mi + 1,
      numeral: ROMAN[mi] ?? String(mi + 1),
      lessons: m.lessons.map((l) => ({ ...l, ordinal: ++lessonOrdinal })),
    })),
  };
}

export const renumberOutline = renumber;

function clone(data: OutlineData): OutlineModule[] {
  return data.modules.map((m) => ({ ...m, lessons: m.lessons.map((l) => ({ ...l })) }));
}

export function outlineLessonRefs(outline: OutlineData): string[] {
  return outline.modules.flatMap((m) => m.lessons.map((l) => l.id));
}

export function applyOutlineOp(
  data: OutlineData,
  op: OutlineOp,
  newId: () => string = () => nanoid(),
): OutlineData {
  const modules = clone(data);

  switch (op.kind) {
    case "addModule": {
      if (modules.length >= ROMAN.length + 12) {
        throw new StructureError("An Outline cannot keep growing forever.");
      }
      modules.push({
        id: op.moduleId ?? newId(),
        ordinal: 0,
        numeral: "",
        title: checkTitle(op.title, "Module"),
        lessons: [],
      });
      return renumber(modules);
    }

    case "renameModule": {
      findModule({ modules }, op.moduleId).title = checkTitle(op.title, "Module");
      return renumber(modules);
    }

    case "removeModule": {
      const index = findModuleIndex(modules, op.moduleId);
      if (modules.length === 1) {
        throw new StructureError("A Course needs at least one Module.");
      }
      modules.splice(index, 1);
      return renumber(modules);
    }

    case "moveModule": {
      const index = findModuleIndex(modules, op.moduleId);
      const to = Math.floor(op.toIndex);
      if (to < 0 || to > modules.length - 1) {
        throw new StructureError("A Module cannot move there.");
      }
      const [moved] = modules.splice(index, 1);
      modules.splice(to, 0, moved);
      return renumber(modules);
    }

    case "addLesson": {
      const mod = findModule({ modules }, op.moduleId);
      mod.lessons.push({
        id: newId(),
        ordinal: 0,
        title: checkTitle(op.title, "Lesson"),
        summary: checkSummary(op.summary),
        minutes: 10,
      });
      return renumber(modules);
    }

    case "renameLesson": {
      const { lesson } = findLesson({ modules }, op.lessonId);
      lesson.title = checkTitle(op.title, "Lesson");
      lesson.summary = checkSummary(op.summary);
      return renumber(modules);
    }

    case "removeLesson": {
      const { module: mod, lessonIndex } = findLesson({ modules }, op.lessonId);
      const total = modules.reduce((total, mod) => total + mod.lessons.length, 0);
      if (total === 1) {
        throw new StructureError("A Course needs at least one Lesson.");
      }
      mod.lessons.splice(lessonIndex, 1);
      return renumber(modules);
    }

    case "moveLesson": {
      const { module: from, lessonIndex } = findLesson({ modules }, op.lessonId);
      const target = findModule({ modules }, op.toModuleId);
      const [moved] = from.lessons.splice(lessonIndex, 1);
      const to = Math.floor(op.toIndex);
      if (to < 0 || to > target.lessons.length) {
        throw new StructureError("A Lesson cannot move there.");
      }
      target.lessons.splice(to, 0, moved);
      return renumber(modules);
    }

    case "splitLesson": {
      const { module: mod, lesson, lessonIndex } = findLesson({ modules }, op.lessonId);
      mod.lessons.splice(lessonIndex + 1, 0, {
        id: newId(),
        ordinal: 0,
        title: checkTitle(op.secondTitle, "Lesson"),
        summary: checkSummary(op.secondSummary),
        minutes: Math.max(1, Math.floor(lesson.minutes / 2)),
      });
      lesson.minutes = Math.max(1, Math.ceil(lesson.minutes / 2));
      return renumber(modules);
    }

    case "mergeLesson": {
      const { module: mod, lesson, lessonIndex } = findLesson({ modules }, op.lessonId);
      const neighbor = mod.lessons[op.direction === "next" ? lessonIndex + 1 : lessonIndex - 1];
      if (!neighbor) {
        throw new StructureError(
          op.direction === "next"
            ? "There is no next Lesson in this Module to merge into it."
            : "There is no previous Lesson in this Module to merge into.",
        );
      }
      const keeper = op.direction === "next" ? lesson : neighbor;
      const dropped = op.direction === "next" ? neighbor : lesson;
      keeper.title = checkTitle(keeper.title, "Lesson");
      keeper.summary = [keeper.summary, dropped.summary].filter(Boolean).join(" ");
      keeper.minutes += dropped.minutes;
      mod.lessons.splice(mod.lessons.indexOf(dropped), 1);
      return renumber(modules);
    }
  }
}

export function applyOutlineOps(
  data: OutlineData,
  ops: OutlineOp[],
  newId: () => string = () => nanoid(),
): OutlineData {
  let current = data;
  for (const op of ops) current = applyOutlineOp(current, op, newId);
  return current;
}

export function outlineApprovalProblems(data: OutlineData): string[] {
  const problems: string[] = [];
  if (data.modules.length === 0) problems.push("The Outline has no Modules.");
  problems.push(
    ...data.modules
      .filter((mod) => mod.lessons.length === 0)
      .map((mod) => `Module "${mod.title}" has no Lessons.`),
  );
  return problems;
}
