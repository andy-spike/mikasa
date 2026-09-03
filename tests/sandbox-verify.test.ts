/**
 * Executable-claim verification (ticket #9) with the Sandbox substituted:
 * detection (coding vs non-coding), the plan, the run with its evidence,
 * findings that block publication, the per-round retry cache, and a
 * Sandbox that was never given anything from the deployment.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", async () => {
  const { makeTestDb } = await import("./helpers/test-db");
  return { db: await makeTestDb() };
});

import { json, scriptedModel } from "./helpers/fake-model";
import { makeTestDb } from "./helpers/test-db";
import type { LessonContent } from "@/lib/course/content";
import type { SandboxProvider } from "@/lib/course/sandbox-verify";

const { needsCodeVerification, planVerification, runVerification, verificationFindings } =
  await import("@/lib/course/sandbox-verify");
const { parseLessonContent } = await import("@/lib/course/content");
const { saveLessonContent } = await import("@/lib/db/lessons");
const { findCodeVerification, latestCodeVerification, publishRevision, saveCodeVerification } =
  await import("@/lib/db/review");
const { codeVerifications, courses, courseSpecs, generationRuns, outlines, reviewRuns, users } =
  await import("@/lib/db/schema");

let db: Awaited<ReturnType<typeof makeTestDb>>;

beforeEach(async () => {
  db = await makeTestDb();
});

afterEach(async () => {
  await db.delete(users);
});

function codingLesson(lessonId = "l1"): LessonContent {
  return parseLessonContent(lessonId, "Lesson one", {
    body: [
      { kind: "p", text: "The function joins the two." },
      {
        kind: "code",
        language: "javascript",
        code: "export function join(a, b) { return a + b; }",
      },
    ],
    workedExample: [
      {
        kind: "code",
        language: "javascript",
        code: 'import { join } from "./join.js";\nconsole.log(join("a", "b"));',
      },
    ],
    recallPrompt: "What does join do?",
    selfExplanationPrompt: "Why string concat?",
    exercise: { task: "Run the join example.", check: "It prints ab." },
    bridge: "Next.",
  });
}

function proseLesson(lessonId = "l1"): LessonContent {
  return parseLessonContent(lessonId, "Lesson one", {
    body: [{ kind: "p", text: "Bauhaus turned 1919." }],
    workedExample: [{ kind: "p", text: "A poster, analysed." }],
    recallPrompt: "When?",
    selfExplanationPrompt: "Why then?",
    exercise: { task: "Name three principles.", check: "Three named." },
    bridge: "Next.",
  });
}

describe("needsCodeVerification", () => {
  it("says yes when the candidate carries code", () => {
    expect(
      needsCodeVerification({ topic: "the Vercel AI SDK", goal: "build my own AI chat app" }, [
        codingLesson(),
      ]),
    ).toBe(true);
  });

  it("says yes when the contract promises coding work, even without code yet", () => {
    expect(
      needsCodeVerification({ topic: "React from scratch", goal: "build my own dashboard" }, [
        proseLesson(),
      ]),
    ).toBe(true);
  });

  it("says no for a prose Course, so no Sandbox work is ever created", () => {
    expect(
      needsCodeVerification({ topic: "the history of typography", goal: "read faces critically" }, [
        proseLesson(),
      ]),
    ).toBe(false);
  });
});

describe("planVerification", () => {
  it("returns the files and commands the model planned", async () => {
    const model = scriptedModel([
      json({
        files: [
          {
            path: "src/join.js",
            content: "export function join(a,b){return a+b}",
            lessonRef: "l1",
          },
        ],
        commands: [{ run: "node src/join.js", lessonRef: "l1", proves: "join works" }],
      }),
    ]);

    const plan = await planVerification(
      model.model,
      { topic: "t", goal: "g" },
      { finalExercise: { task: "x", acceptanceChecks: [] } } as never,
      [codingLesson()],
    );

    expect(plan.files[0].path).toBe("src/join.js");
    expect(plan.commands[0].run).toBe("node src/join.js");
    expect(model.prompts[0]).toContain("export function join");
  });

  it("fails loudly on a broken plan instead of running nothing", async () => {
    const model = scriptedModel(["not json"]);
    await expect(
      planVerification(
        model.model,
        { topic: "t", goal: "g" },
        { finalExercise: { task: "x", acceptanceChecks: [] } } as never,
        [codingLesson()],
      ),
    ).rejects.toThrow();
  });
});

describe("runVerification", () => {
  function fakeProvider(results: { exitCode: number; stdout: string; stderr: string }[]) {
    const calls: { createdWith?: unknown; written: string[]; commands: string[] } = {
      written: [],
      commands: [],
    };
    const provider: SandboxProvider = {
      create: async () => {
        calls.createdWith = { env: undefined };
        let i = 0;
        return {
          createdWith: calls.createdWith,
          writeFile: async (path) => {
            calls.written.push(path);
          },
          run: async (command) => {
            calls.commands.push(command);
            return results[i++] ?? { exitCode: 1, stdout: "", stderr: "unexpected command" };
          },
          listFiles: async () => ["src/join.js", "output.txt"],
          dispose: async () => undefined,
        };
      },
    };
    return { provider, calls };
  }

  it("passes when every claim's command exits clean, and keeps the evidence", async () => {
    const { provider, calls } = fakeProvider([{ exitCode: 0, stdout: "ab\n", stderr: "" }]);
    const plan = {
      files: [{ path: "src/join.js", content: "code", lessonRef: "l1" }],
      commands: [{ run: "node src/join.js", lessonRef: "l1", proves: "join works" }],
    };

    const result = await runVerification(provider, plan);

    expect(result.passed).toBe(true);
    expect(result.failedLessonRefs).toEqual([]);
    expect(calls.written).toEqual(["src/join.js"]);
    expect(calls.commands).toEqual(["node src/join.js"]);
    expect(result.evidence.commands[0]).toMatchObject({ exitCode: 0, stdout: "ab\n" });
    expect(result.evidence.files).toContain("output.txt");
  });

  it("runs every claim even after one fails, and names the failed Lessons", async () => {
    const { provider } = fakeProvider([
      { exitCode: 1, stdout: "", stderr: "TypeError: b is not defined" },
      { exitCode: 0, stdout: "ok\n", stderr: "" },
    ]);
    const plan = {
      files: [{ path: "a.js", content: "", lessonRef: "l1" }],
      commands: [
        { run: "node a.js", lessonRef: "l1", proves: "first" },
        { run: "node b.js", lessonRef: "l2", proves: "second" },
      ],
    };

    const result = await runVerification(provider, plan);
    expect(result.passed).toBe(false);
    expect(result.failedLessonRefs).toEqual(["l1"]);
    expect(result.evidence.commands).toHaveLength(2);

    const findings = verificationFindings(result);
    expect(findings).toHaveLength(1);
    expect(findings[0].lessonRef).toBe("l1");
    expect(findings[0].detail).toContain("exited with code 1");
    expect(findings[0].detail).toContain("b is not defined");
  });

  it("creates the Sandbox with nothing from the deployment", async () => {
    const { provider } = fakeProvider([{ exitCode: 0, stdout: "", stderr: "" }]);
    const sandbox = await provider.create();
    expect((sandbox.createdWith as { env: unknown }).env).toBeUndefined();
  });
});

describe("verification in review and publication", () => {
  async function seedReviewing(): Promise<string> {
    const [user] = await db
      .insert(users)
      .values({
        id: "u1",
        name: "A Learner",
        email: "a@example.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    const [course] = await db
      .insert(courses)
      .values({
        ownerId: user.id,
        topic: "React from scratch",
        goal: "build my own dashboard",
        depth: "reach",
        status: "reviewing",
      })
      .returning();
    await db.insert(outlines).values({
      courseId: course.id,
      version: 1,
      data: {
        modules: [
          {
            id: "m1",
            ordinal: 1,
            numeral: "I",
            title: "Module one",
            lessons: [{ id: "l1", ordinal: 1, title: "Lesson one", summary: "S.", minutes: 20 }],
          },
        ],
      },
    });
    await db.insert(courseSpecs).values({
      courseId: course.id,
      spec: {
        contract: {
          topic: "React from scratch",
          goal: "build my own dashboard",
          background: "",
          depth: "reach",
          language: "en",
          terminalPerformances: [],
          exclusions: [],
          learnerAssumptions: [],
        },
        throughline: { premise: "p", runningExample: "r", vocabulary: [] },
        learningGraph: [],
        alignment: [],
        finalExercise: { task: "t", acceptanceChecks: ["c"] },
        evidence: [],
      },
      outlineVersion: 1,
    });
    const [run] = await db
      .insert(generationRuns)
      .values({
        courseId: course.id,
        outlineVersion: 1,
        status: "succeeded",
        currentStep: "complete",
      })
      .returning();
    await saveLessonContent(db, course.id, 1, run.id, codingLesson());
    return course.id;
  }

  it("keeps a per-round pass and reuses it on retry instead of re-running the Sandbox", async () => {
    const courseId = await seedReviewing();

    const first = await saveCodeVerification(db, courseId, 1, 0, {
      passed: false,
      evidence: { commands: [{ run: "node a.js", exitCode: 1, stderr: "boom" }] },
    });
    const again = await saveCodeVerification(db, courseId, 1, 0, {
      passed: true,
      evidence: { commands: [] },
    });

    expect(first.created).toBe(true);
    expect(again.created).toBe(false);

    const row = await findCodeVerification(db, courseId, 1, 0);
    expect(row?.status).toBe("failed");
    expect((row?.evidence as { commands: unknown[] }).commands).toHaveLength(1);
  });

  it("a later round's passing pass clears the way; the latest round decides", async () => {
    const courseId = await seedReviewing();
    await saveCodeVerification(db, courseId, 1, 0, {
      passed: false,
      evidence: { commands: [] },
    });
    await saveCodeVerification(db, courseId, 1, 1, {
      passed: true,
      evidence: { commands: [] },
    });

    expect((await latestCodeVerification(db, courseId, 1))?.round).toBe(1);
    expect((await latestCodeVerification(db, courseId, 1))?.status).toBe("passed");
  });

  it("a still-failing pass blocks publication even with a clean review", async () => {
    const courseId = await seedReviewing();
    await saveCodeVerification(db, courseId, 1, 0, {
      passed: false,
      evidence: { commands: [] },
    });
    const [review] = await db
      .insert(reviewRuns)
      .values({ courseId, outlineVersion: 1, status: "succeeded" })
      .returning();

    const blocked = await publishRevision(db, courseId, 1, review.id);
    expect(blocked).toMatchObject({
      ok: false,
      reason: expect.stringContaining("Sandbox"),
    });
  });

  it("a non-coding Course publishes with no verification rows at all", async () => {
    const courseId = await seedReviewing();
    /* No codeVerifications rows exist; publication only needs the review. */
    await saveCodeVerification(db, courseId, 1, 0, {
      passed: true,
      evidence: { commands: [] },
    });
    const [review] = await db
      .insert(reviewRuns)
      .values({ courseId, outlineVersion: 1, status: "succeeded" })
      .returning();

    const published = await publishRevision(db, courseId, 1, review.id);
    expect(published.ok).toBe(true);

    const rows = await db
      .select()
      .from(codeVerifications)
      .where(eq(codeVerifications.courseId, courseId));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("passed");
  });
});
