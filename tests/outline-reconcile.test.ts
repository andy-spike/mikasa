/**
 * Specification reconciliation with a scripted model: carried-over parts
 * stay, the graph and alignment re-align to the current Outline, and a
 * model that skips a Lesson fails instead of poisoning generation.
 */
import { describe, expect, it } from "vitest";
import { reconcileSpecification } from "@/lib/course/reconcile";
import type { CourseSpecification, OutlineData } from "@/lib/course/types";
import { json, scriptedModel } from "./helpers/fake-model";

const OUTLINE: OutlineData = {
  modules: [
    {
      id: "m1",
      ordinal: 1,
      numeral: "I",
      title: "Module one",
      lessons: [
        { id: "l1", ordinal: 1, title: "Kept", summary: "Survived the edit.", minutes: 20 },
        { id: "l5", ordinal: 2, title: "Added", summary: "Split in by hand.", minutes: 10 },
      ],
    },
  ],
};

const PREVIOUS: CourseSpecification = {
  contract: {
    topic: "the Vercel AI SDK",
    goal: "build my own AI chat app",
    background: "",
    depth: "reach",
    language: "en",
    terminalPerformances: ["Ship a chat app"],
    exclusions: [],
    learnerAssumptions: [],
  },
  throughline: { premise: "One app", runningExample: "The chat app", vocabulary: ["stream"] },
  learningGraph: [{ id: "g1", skill: "Stream text", requires: [], lessonId: "l1" }],
  alignment: [
    {
      lessonId: "l1",
      performance: "does the thing",
      prerequisiteNodes: [],
      moduleMilestone: "milestone",
      exerciseContribution: "contributes",
    },
    {
      lessonId: "l-gone",
      performance: "removed with its Lesson",
      prerequisiteNodes: [],
      moduleMilestone: "milestone",
      exerciseContribution: "contributes",
    },
  ],
  finalExercise: { task: "Build it", acceptanceChecks: ["It runs"] },
  evidence: [{ sourceRef: "src-1", supports: "The main claim" }],
};

describe("reconcileSpecification", () => {
  it("re-aligns the graph and alignment and carries the rest over", async () => {
    const model = scriptedModel([
      json({
        learningGraph: [
          { id: "g1", skill: "Stream text", requires: [], lessonId: "l1" },
          { id: "g2", skill: "The new part", requires: ["g1"], lessonId: "l5" },
        ],
        alignment: [
          {
            lessonId: "l1",
            performance: "kept",
            prerequisiteNodes: [],
            moduleMilestone: "m",
            exerciseContribution: "c",
          },
          {
            lessonId: "l5",
            performance: "new",
            prerequisiteNodes: ["g1"],
            moduleMilestone: "m",
            exerciseContribution: "c",
          },
        ],
      }),
    ]);

    const reconciled = await reconcileSpecification(model.model, OUTLINE, PREVIOUS);

    expect(reconciled.contract).toBe(PREVIOUS.contract);
    expect(reconciled.throughline).toBe(PREVIOUS.throughline);
    expect(reconciled.finalExercise).toBe(PREVIOUS.finalExercise);
    expect(reconciled.evidence).toEqual(PREVIOUS.evidence);
    expect(reconciled.learningGraph.map((n) => n.id)).toEqual(["g1", "g2"]);
    expect(reconciled.alignment.map((a) => a.lessonId)).toEqual(["l1", "l5"]);
    /* The model was shown the previous spec and the current lesson ids. */
    expect(model.prompts[0]).toContain("l-gone");
    expect(model.prompts[0]).toContain("l5");
  });

  it("fails when the model skips a Lesson instead of generating from a hole", async () => {
    const model = scriptedModel([
      json({
        learningGraph: [],
        alignment: [
          {
            lessonId: "l1",
            performance: "kept",
            prerequisiteNodes: [],
            moduleMilestone: "m",
            exerciseContribution: "c",
          },
        ],
      }),
    ]);

    await expect(
      reconcileSpecification(model.model, OUTLINE, PREVIOUS),
    ).rejects.toThrow(/skipped 1 Lesson/);
  });
});
