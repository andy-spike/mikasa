/**
 * The Outline's structure grammar: the one set of operations the manual
 * editor (ticket #4) and the Tailor's Change plans (ticket #13) both use,
 * so a change is the same change however it arrives.
 *
 * Identity rules, which everything downstream (generation, Completion,
 * revisions) depends on:
 * - rename and move never change an id;
 * - split keeps the first half's Lesson id and gives the second half a new
 *   one;
 * - merge keeps the surviving Lesson's id (the one merged INTO) and drops
 *   the other.
 *
 * Every function is pure, renumbers ordinals, and throws `StructureError`
 * on an operation that does not apply. Numbers across the Course are
 * derived from position at render time; the stored ordinals exist so the
 * JSON document reads correctly on its own.
 */
import { nanoid } from "nanoid";
import type { OutlineData, OutlineLesson, OutlineModule } from "./types";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/** An operation the Outline does not accept, as opposed to a bug. */
export class StructureError extends Error {
  name = "StructureError";
}

export type OutlineOp =
  | { kind: "addModule"; title: string }
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

function findLesson(
  data: OutlineData,
  lessonId: string,
): { module: OutlineModule; lesson: OutlineLesson; lessonIndex: number; moduleIndex: number } {
  for (let mi = 0; mi < data.modules.length; mi++) {
    const li = data.modules[mi].lessons.findIndex((l) => l.id === lessonId);
    if (li !== -1) {
      return {
        module: data.modules[mi],
        lesson: data.modules[mi].lessons[li],
        lessonIndex: li,
        moduleIndex: mi,
      };
    }
  }
  throw new StructureError("That Lesson does not exist.");
}

/** Recomputes positions and numerals from order; the source of truth. */
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

/** Re-derives ordinals and numerals after surgery on the shape (#15). */
export function renumberOutline(modules: OutlineModule[]): OutlineData {
  return renumber(modules);
}

function clone(data: OutlineData): OutlineModule[] {
  return data.modules.map((m) => ({ ...m, lessons: m.lessons.map((l) => ({ ...l })) }));
}

/**
 * Applies one operation to a copy of the Outline and returns the new
 * document. `newId` is injectable so tests get predictable ids; production
 * uses nanoid.
 */
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
        id: newId(),
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
      const index = modules.findIndex((m) => m.id === op.moduleId);
      if (index === -1) throw new StructureError("That Module does not exist.");
      if (modules.length === 1) {
        throw new StructureError("A Course needs at least one Module.");
      }
      modules.splice(index, 1);
      return renumber(modules);
    }

    case "moveModule": {
      const index = modules.findIndex((m) => m.id === op.moduleId);
      if (index === -1) throw new StructureError("That Module does not exist.");
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
      const total = modules.reduce((n, m) => n + m.lessons.length, 0);
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
      if (op.direction === "next") {
        const next = mod.lessons[lessonIndex + 1];
        if (!next) {
          throw new StructureError("There is no next Lesson in this Module to merge into it.");
        }
        lesson.title = checkTitle(lesson.title, "Lesson");
        lesson.summary = [lesson.summary, next.summary].filter(Boolean).join(" ");
        lesson.minutes += next.minutes;
        mod.lessons.splice(lessonIndex + 1, 1);
      } else {
        const previous = mod.lessons[lessonIndex - 1];
        if (!previous) {
          throw new StructureError("There is no previous Lesson in this Module to merge into.");
        }
        previous.title = checkTitle(previous.title, "Lesson");
        previous.summary = [previous.summary, lesson.summary].filter(Boolean).join(" ");
        previous.minutes += lesson.minutes;
        mod.lessons.splice(lessonIndex, 1);
      }
      return renumber(modules);
    }
  }
}

/** Applies operations in order; the first failure fails the whole batch. */
export function applyOutlineOps(
  data: OutlineData,
  ops: OutlineOp[],
  newId: () => string = () => nanoid(),
): OutlineData {
  let current = data;
  for (const op of ops) current = applyOutlineOp(current, op, newId);
  return current;
}

/**
 * Approval's sanity rule: generation writes one Lesson per Outline Lesson,
 * so an Outline with no Lessons, or a Module with none, is not approvable.
 * This is not a Depth bound — manual shapes may be any size above zero.
 */
export function outlineApprovalProblems(data: OutlineData): string[] {
  const problems: string[] = [];
  if (data.modules.length === 0) problems.push("The Outline has no Modules.");
  for (const mod of data.modules) {
    if (mod.lessons.length === 0) {
      problems.push(`Module "${mod.title}" has no Lessons.`);
    }
  }
  return problems;
}
