import { describe, expect, it } from "vitest";
import { buildCourseLibrary, GROUP_LABELS, type CourseLibraryInput } from "@/lib/course/library";
import type { OutlineData } from "@/lib/course/types";

const NOW = new Date("2026-03-12T09:00:00Z");
const DAY = 86_400_000;

function outline(): OutlineData {
  return {
    modules: [
      {
        id: "m1",
        ordinal: 1,
        numeral: "I",
        title: "Foundations",
        lessons: [
          { id: "l1", ordinal: 1, title: "First things", summary: "Start.", minutes: 20 },
          { id: "l2", ordinal: 2, title: "Second things", summary: "Go on.", minutes: 15 },
        ],
      },
      {
        id: "m2",
        ordinal: 2,
        numeral: "II",
        title: "Practice",
        lessons: [
          { id: "l3", ordinal: 3, title: "Third things", summary: "Keep going.", minutes: 25 },
        ],
      },
    ],
  };
}

function course(overrides: Partial<CourseLibraryInput> = {}): CourseLibraryInput {
  return {
    id: "c1",
    topic: "Systems",
    goal: "understand them",
    status: "ready",
    createdAt: new Date(NOW.getTime() - 30 * DAY),
    updatedAt: new Date(NOW.getTime() - 7 * DAY),
    completedAt: null,
    outline: outline(),
    completions: [],
    plan: null,
    proposedChanges: 0,
    ...overrides,
  };
}

function at(daysAgo: number): Date {
  return new Date(NOW.getTime() - daysAgo * DAY);
}

describe("buildCourseLibrary rows", () => {
  it("reads the next Lesson in reading order, with the module it sits in", () => {
    const [item] = buildCourseLibrary([course()], NOW);

    expect(item.nextLessonTitle).toBe("First things");
    expect(item.nextLessonMinutes).toBe(20);
    expect(item.position).toEqual({
      moduleNumeral: "I",
      moduleTitle: "Foundations",
      lesson: 1,
      total: 3,
    });
  });

  it("skips the Lessons already marked and keeps counting across modules", () => {
    const [item] = buildCourseLibrary(
      [
        course({
          completions: [
            { lessonRef: "l1", doneAt: at(3) },
            { lessonRef: "l2", doneAt: at(2) },
          ],
        }),
      ],
      NOW,
    );

    expect(item.state).toBe("resume");
    expect(item.fact).toBe("2 / 3");
    expect(item.nextLessonTitle).toBe("Third things");
    expect(item.position).toEqual({
      moduleNumeral: "II",
      moduleTitle: "Practice",
      lesson: 3,
      total: 3,
    });
  });

  it("ignores a completion whose Lesson is no longer in the published Outline", () => {
    const [item] = buildCourseLibrary(
      [
        course({
          completions: [
            { lessonRef: "l1", doneAt: at(3) },
            { lessonRef: "gone", doneAt: at(1) },
          ],
        }),
      ],
      NOW,
    );

    expect(item.fact).toBe("1 / 3");
    // The dropped Lesson is not in this Outline, so its date cannot be the row's last activity.
    expect(item.lastTouched).toBe("3 days ago");
  });

  it("dates the row from its last completion, not from the Course record", () => {
    const [item] = buildCourseLibrary(
      [course({ completions: [{ lessonRef: "l1", doneAt: at(1) }] })],
      NOW,
    );

    expect(item.lastTouched).toBe("yesterday");
  });

  it("calls a Course complete only when every published Lesson is marked", () => {
    const done = ["l1", "l2", "l3"].map((lessonRef, index) => ({
      lessonRef,
      doneAt: at(index + 1),
    }));
    const [item] = buildCourseLibrary(
      [course({ completions: done, completedAt: at(1), plan: null })],
      NOW,
    );

    expect(item.group).toBe("done");
    expect(item.state).toBe("complete");
    expect(item.fact).toBe("3 / 3");
    expect(item.note).toBe("Completed 11 MAR 2026");
    expect(item.nextLessonTitle).toBeNull();
    expect(item.position).toBeNull();
  });

  it("never calls a Course with no published Outline complete", () => {
    const [item] = buildCourseLibrary([course({ outline: null })], NOW);

    expect(item.fact).toBe("0 / 0");
    expect(item.group).toBe("in-progress");
  });
});

describe("the state a row speaks in", () => {
  it("puts a failed build first, on its Outline", () => {
    const [item] = buildCourseLibrary([course({ status: "failed" })], NOW);

    expect(item.group).toBe("needs");
    expect(item.state).toBe("retry");
    expect(item.fact).toBe("Build failed");
    expect(item.href).toBe("/courses/c1/outline");
  });

  it("asks for the Outline review without inventing a Lesson count", () => {
    const [item] = buildCourseLibrary(
      [course({ status: "awaiting-outline-approval", updatedAt: at(2) })],
      NOW,
    );

    expect(item.group).toBe("needs");
    expect(item.state).toBe("outline-ready");
    expect(item.fact).toBe("Outline ready");
    expect(item.note).toBe("Drafted 2 days ago");
    expect(item.href).toBe("/courses/c1/outline");
  });

  it("names each stage of a build in flight", () => {
    const states = [
      ["designing", "Designing"],
      ["generating", "Writing Lessons"],
      ["reviewing", "Reviewing"],
    ] as const;

    for (const [status, fact] of states) {
      const [item] = buildCourseLibrary([course({ status })], NOW);
      expect(item.group).toBe("in-progress");
      expect(item.fact).toBe(fact);
      expect(item.href).toBe("/courses/c1/outline");
    }
  });

  it("counts the Tailor's proposed changes for the learner", () => {
    const [one] = buildCourseLibrary([course({ plan: "proposed", proposedChanges: 1 })], NOW);
    const [many] = buildCourseLibrary([course({ plan: "proposed", proposedChanges: 3 })], NOW);

    expect(one.group).toBe("needs");
    expect(one.state).toBe("changes");
    expect(one.fact).toBe("Changes to review");
    expect(one.detail).toBe("One change from the Tailor waits for your decision.");
    expect(one.href).toBe("/courses/c1");
    expect(one).toMatchObject({ actionLabel: "Review the changes" });
    expect(many.detail).toBe("3 changes from the Tailor wait for your decision.");
  });

  it("keeps a Course readable while its revision is staged", () => {
    const [item] = buildCourseLibrary([course({ plan: "staged" })], NOW);

    expect(item.group).toBe("in-progress");
    expect(item.state).toBe("revising");
    expect(item.fact).toBe("0 / 3");
    expect(item.actionLabel).toBe("Continue");
    expect(item.href).toBe("/courses/c1");
  });

  it("gives the pane a recency line instead of repeating the row's fraction", () => {
    const [item] = buildCourseLibrary([course()], NOW);

    expect(item.state).toBe("resume");
    expect(item.note).toBe("Last touched a week ago");
  });

  it("lets a proposed plan outrank the Course's own progress", () => {
    const [item] = buildCourseLibrary(
      [
        course({
          plan: "proposed",
          proposedChanges: 1,
          completions: ["l1", "l2", "l3"].map((lessonRef, index) => ({
            lessonRef,
            doneAt: at(index + 1),
          })),
        }),
      ],
      NOW,
    );

    expect(item.state).toBe("changes");
    expect(item.group).toBe("needs");
  });
});

describe("ordering the index", () => {
  it("reads needs-you, then in-progress, then done", () => {
    const items = buildCourseLibrary(
      [
        course({
          id: "done",
          completedAt: at(1),
          completions: ["l1", "l2", "l3"].map((lessonRef, i) => ({ lessonRef, doneAt: at(i + 1) })),
        }),
        course({ id: "reading", updatedAt: at(2) }),
        course({ id: "asking", plan: "proposed", proposedChanges: 2 }),
      ],
      NOW,
    );

    expect(items.map((item) => item.group)).toEqual(["needs", "in-progress", "done"]);
    expect(items.map((item) => item.id)).toEqual(["asking", "reading", "done"]);
  });

  it("leads each group with the most recently touched Course", () => {
    const items = buildCourseLibrary(
      [
        course({ id: "old", updatedAt: at(9) }),
        course({ id: "new", updatedAt: at(1) }),
        course({ id: "middle", updatedAt: at(4) }),
      ],
      NOW,
    );

    expect(items.map((item) => item.id)).toEqual(["new", "middle", "old"]);
  });

  it("orders the done group by when each Course was finished", () => {
    const finished = (id: string, daysAgo: number) =>
      course({
        id,
        completedAt: at(daysAgo),
        completions: ["l1", "l2", "l3"].map((lessonRef, i) => ({
          lessonRef,
          doneAt: at(i + 1 + daysAgo),
        })),
      });
    const items = buildCourseLibrary([finished("first", 10), finished("last", 1)], NOW);

    expect(items.map((item) => item.id)).toEqual(["last", "first"]);
  });

  it("marks exactly one Course live, preferring one that is being read", () => {
    const items = buildCourseLibrary(
      [
        course({ id: "waiting", plan: "proposed", proposedChanges: 1 }),
        course({ id: "reading", updatedAt: at(2) }),
      ],
      NOW,
    );

    expect(items.filter((item) => item.isLive).map((item) => item.id)).toEqual(["reading"]);
  });

  it("falls back to the first row when nothing is being read or finished", () => {
    const items = buildCourseLibrary(
      [
        course({ id: "asking", plan: "proposed", proposedChanges: 1, updatedAt: at(1) }),
        course({ id: "outline", status: "awaiting-outline-approval", updatedAt: at(9) }),
      ],
      NOW,
    );

    expect(items.filter((item) => item.isLive).map((item) => item.id)).toEqual(["asking"]);
  });

  it("opens on a Course being read even when a decision leads the index", () => {
    const items = buildCourseLibrary(
      [
        course({ id: "asking", plan: "proposed", proposedChanges: 1, updatedAt: at(1) }),
        course({ id: "reading", updatedAt: at(9) }),
      ],
      NOW,
    );

    expect(items.map((item) => item.id)).toEqual(["asking", "reading"]);
    expect(items.filter((item) => item.isLive).map((item) => item.id)).toEqual(["reading"]);
  });

  it("prefers a revision in flight over a Course already finished", () => {
    const items = buildCourseLibrary(
      [
        course({
          id: "done",
          completedAt: at(1),
          completions: ["l1", "l2", "l3"].map((lessonRef, i) => ({ lessonRef, doneAt: at(i + 1) })),
        }),
        course({ id: "revising", plan: "staged" }),
      ],
      NOW,
    );

    expect(items.filter((item) => item.isLive).map((item) => item.id)).toEqual(["revising"]);
  });
});

describe("GROUP_LABELS", () => {
  it("says what each group is", () => {
    expect(GROUP_LABELS).toEqual({
      needs: "Needs you",
      "in-progress": "In progress",
      done: "Done",
    });
  });
});
