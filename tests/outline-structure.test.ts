import { describe, expect, it } from "vitest";
import {
  applyOutlineOp,
  applyOutlineOps,
  outlineApprovalProblems,
  StructureError,
  type OutlineOp,
} from "@/lib/course/structure";
import type { OutlineData } from "@/lib/course/types";

function fixture(): OutlineData {
  return {
    modules: [
      {
        id: "m1",
        ordinal: 1,
        numeral: "I",
        title: "Module one",
        lessons: [
          { id: "l1", ordinal: 1, title: "Lesson one", summary: "First.", minutes: 20 },
          { id: "l2", ordinal: 2, title: "Lesson two", summary: "Second.", minutes: 20 },
        ],
      },
      {
        id: "m2",
        ordinal: 2,
        numeral: "II",
        title: "Module two",
        lessons: [
          { id: "l3", ordinal: 3, title: "Lesson three", summary: "Third.", minutes: 20 },
          { id: "l4", ordinal: 4, title: "Lesson four", summary: "Fourth.", minutes: 20 },
        ],
      },
    ],
  };
}

let counter = 0;
const nextId = () => `new${++counter}`;

function apply(data: OutlineData, op: OutlineOp): OutlineData {
  return applyOutlineOp(data, op, nextId);
}

describe("rename and move preserve identity", () => {
  it("renames a Lesson without touching its id or its neighbours", () => {
    const next = apply(fixture(), {
      kind: "renameLesson",
      lessonId: "l2",
      title: "Renamed",
      summary: "Still second.",
    });
    const l2 = next.modules[0].lessons[1];
    expect(l2).toMatchObject({ id: "l2", title: "Renamed", summary: "Still second." });
    expect(next.modules[0].lessons.map((l) => l.id)).toEqual(["l1", "l2"]);
  });

  it("renames a Module", () => {
    const next = apply(fixture(), { kind: "renameModule", moduleId: "m2", title: "Later" });
    expect(next.modules[1]).toMatchObject({ id: "m2", title: "Later" });
  });

  it("moves a Lesson down inside its Module and renumbers", () => {
    const next = apply(fixture(), {
      kind: "moveLesson",
      lessonId: "l1",
      toModuleId: "m1",
      toIndex: 1,
    });
    expect(next.modules[0].lessons.map((l) => l.id)).toEqual(["l2", "l1"]);
    expect(next.modules[0].lessons.map((l) => l.ordinal)).toEqual([1, 2]);
    expect(next.modules[1].lessons.map((l) => l.ordinal)).toEqual([3, 4]);
  });

  it("moves a Lesson across Modules", () => {
    const next = apply(fixture(), {
      kind: "moveLesson",
      lessonId: "l1",
      toModuleId: "m2",
      toIndex: 2,
    });
    expect(next.modules[0].lessons.map((l) => l.id)).toEqual(["l2"]);
    expect(next.modules[1].lessons.map((l) => l.id)).toEqual(["l3", "l4", "l1"]);
  });

  it("moves a Module and rewrites numerals from position", () => {
    const next = apply(fixture(), { kind: "moveModule", moduleId: "m2", toIndex: 0 });
    expect(next.modules.map((m) => `${m.numeral}:${m.id}`)).toEqual(["I:m2", "II:m1"]);
  });
});

describe("split and merge identity rules", () => {
  it("split keeps the first half's id and gives the second half a new one", () => {
    const next = apply(fixture(), {
      kind: "splitLesson",
      lessonId: "l1",
      secondTitle: "Lesson one, later",
      secondSummary: "The part that comes after.",
    });
    const mod = next.modules[0];
    expect(mod.lessons.map((l) => l.id)).toEqual(["l1", "new1", "l2"]);
    expect(mod.lessons[1].title).toBe("Lesson one, later");
    expect(mod.lessons[0].minutes).toBe(10);
    expect(mod.lessons[1].minutes).toBe(10);
  });

  it("merging the next Lesson keeps this Lesson's id and drops the next", () => {
    const next = apply(fixture(), {
      kind: "mergeLesson",
      lessonId: "l1",
      direction: "next",
    });
    const mod = next.modules[0];
    expect(mod.lessons.map((l) => l.id)).toEqual(["l1"]);
    expect(mod.lessons[0].summary).toBe("First. Second.");
    expect(mod.lessons[0].minutes).toBe(40);
  });

  it("merging into the previous Lesson keeps the previous id", () => {
    const next = apply(fixture(), {
      kind: "mergeLesson",
      lessonId: "l2",
      direction: "previous",
    });
    expect(next.modules[0].lessons.map((l) => l.id)).toEqual(["l1"]);
    expect(next.modules[0].lessons[0].summary).toBe("First. Second.");
  });
});

describe("guards", () => {
  it("refuses to remove the only Module or the only Lesson", () => {
    const single: OutlineData = {
      modules: [
        {
          id: "m1",
          ordinal: 1,
          numeral: "I",
          title: "Only",
          lessons: [{ id: "l1", ordinal: 1, title: "Only", summary: "S", minutes: 10 }],
        },
      ],
    };
    expect(() => apply(single, { kind: "removeModule", moduleId: "m1" })).toThrow(StructureError);
    expect(() => apply(single, { kind: "removeLesson", lessonId: "l1" })).toThrow(StructureError);
  });

  it("refuses merges and moves that do not apply", () => {
    expect(() =>
      apply(fixture(), { kind: "mergeLesson", lessonId: "l2", direction: "next" }),
    ).toThrow(StructureError);
    expect(() =>
      apply(fixture(), { kind: "moveLesson", lessonId: "l1", toModuleId: "m1", toIndex: 9 }),
    ).toThrow(StructureError);
    expect(() => apply(fixture(), { kind: "moveModule", moduleId: "m1", toIndex: 5 })).toThrow(
      StructureError,
    );
    expect(() =>
      apply(fixture(), { kind: "renameLesson", lessonId: "nope", title: "X", summary: "S" }),
    ).toThrow(StructureError);
  });

  it("refuses empty titles", () => {
    expect(() => apply(fixture(), { kind: "addModule", title: "   " })).toThrow(StructureError);
    expect(() =>
      apply(fixture(), { kind: "renameLesson", lessonId: "l1", title: "", summary: "S" }),
    ).toThrow(StructureError);
  });

  it("batches operations and fails the batch on the first bad one", () => {
    expect(() =>
      applyOutlineOps(fixture(), [
        { kind: "renameModule", moduleId: "m1", title: "Renamed" },
        { kind: "removeModule", moduleId: "nope" },
      ]),
    ).toThrow(StructureError);
  });
});

describe("approval sanity", () => {
  it("flags empty Modules and an empty Outline, which are not Depth bounds", () => {
    const withEmptyModule = apply(fixture(), { kind: "removeLesson", lessonId: "l1" });
    expect(outlineApprovalProblems(withEmptyModule)).toEqual([]);

    const emptied = apply(withEmptyModule, { kind: "removeLesson", lessonId: "l2" });
    expect(outlineApprovalProblems(emptied)).toEqual(['Module "Module one" has no Lessons.']);
  });
});
