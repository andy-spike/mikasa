/**
 * Course design, step by step, with every provider scripted: the model
 * answers from `tests/helpers/fake-model`, Firecrawl from
 * `tests/helpers/fake-firecrawl`, and Postgres is PGlite. The Workflow
 * wrapper calls exactly these functions, so proving them here is proving
 * the design; the wrapper itself stays directives and glue.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  buildOutline,
  collectSources,
  DesignError,
  designSpecification,
  draftOutline,
  gatherSources,
  selectExcerpts,
  type DesignCourse,
  type OutlineDraft,
} from "@/lib/course/design";
import {
  failDesignRun,
  findCourseSpec,
  latestDesignRun,
  latestOutline,
  listCourseSources,
  saveDesignResult,
  startDesignRun,
} from "@/lib/db/design";
import { courses, designRuns, users } from "@/lib/db/schema";
import { makeTestDb } from "./helpers/test-db";
import { fakeFirecrawl, page } from "./helpers/fake-firecrawl";
import { json, scriptedModel } from "./helpers/fake-model";

const course: DesignCourse = {
  topic: "the Vercel AI SDK",
  goal: "build my own AI chat app",
  background: "I know some React.",
  language: "en",
  depth: "reach",
  grounding: true,
};

function draftOf(modules: number, lessons: number): OutlineDraft {
  return {
    modules: Array.from({ length: modules }, (_, m) => ({
      title: `Module ${m + 1}`,
      lessons: Array.from({ length: lessons }, (_, l) => ({
        title: `Lesson ${m + 1}.${l + 1}`,
        summary: `What lesson ${m + 1}.${l + 1} gets you.`,
        minutes: 10,
      })),
    })),
    terminalPerformances: ["Ship a working chat app"],
    exclusions: [],
    learnerAssumptions: ["Comfortable with React"],
    throughline: {
      premise: "One app, grown lesson by lesson",
      runningExample: "The chat app",
      vocabulary: ["stream", "tool"],
    },
  };
}

/** Three Modules of two Lessons: inside the reach bounds. */
const REACH_DRAFT = draftOf(3, 2);

const fetched = [
  page({
    title: "AI SDK docs",
    url: "https://sdk.vercel.example/docs",
    content: "The AI SDK has a generateText function. ".repeat(30),
  }),
  page({
    title: "Streaming guide",
    url: "https://sdk.vercel.example/streaming",
    content: "streamText streams tokens as they arrive. ".repeat(30),
  }),
  page({ title: "Empty page", url: "https://example.com/empty", content: "   " }),
];

describe("gatherSources", () => {
  it("asks for nothing when Grounding is off", async () => {
    const firecrawl = fakeFirecrawl(fetched);
    const pages = await gatherSources(firecrawl.searcher, { ...course, grounding: false });

    expect(pages).toEqual([]);
    expect(firecrawl.queries).toEqual([]);
  });

  it("searches with the topic and goal, and drops pages with no content", async () => {
    const firecrawl = fakeFirecrawl(fetched);
    const pages = await gatherSources(firecrawl.searcher, course);

    expect(firecrawl.queries).toEqual(["the Vercel AI SDK — build my own AI chat app"]);
    expect(firecrawl.limits).toHaveLength(1);
    expect(pages.map((p) => p.url)).toEqual([
      "https://sdk.vercel.example/docs",
      "https://sdk.vercel.example/streaming",
    ]);
  });
});

describe("selectExcerpts", () => {
  it("uses the model's excerpt per url and slices it to the ceiling", async () => {
    const excerptModel = scriptedModel([
      json({
        excerpts: [
          { url: "https://sdk.vercel.example/docs", excerpt: "x".repeat(700) },
          { url: "https://sdk.vercel.example/streaming", excerpt: "streamText streams tokens." },
        ],
      }),
    ]);
    const found = await gatherSources(fakeFirecrawl(fetched).searcher, course);
    const excerpts = await selectExcerpts(excerptModel.model, course, found);

    expect(excerpts.get("https://sdk.vercel.example/docs")).toHaveLength(600);
    expect(excerpts.get("https://sdk.vercel.example/streaming")).toBe(
      "streamText streams tokens.",
    );
  });

  it("falls back to the page's opening lines when the model skips a url", async () => {
    const excerptModel = scriptedModel([
      json({
        excerpts: [{ url: "https://sdk.vercel.example/docs", excerpt: "The one that matters." }],
      }),
    ]);
    const found = await gatherSources(fakeFirecrawl(fetched).searcher, course);
    const excerpts = await selectExcerpts(excerptModel.model, course, found);

    expect(excerpts.get("https://sdk.vercel.example/docs")).toBe("The one that matters.");
    expect(excerpts.get("https://sdk.vercel.example/streaming")).toContain(
      "streamText streams tokens",
    );
  });

  it("survives a broken model response with fallbacks for every page", async () => {
    const broken = scriptedModel(["not json at all"]);
    const found = await gatherSources(fakeFirecrawl(fetched).searcher, course);
    const excerpts = await selectExcerpts(broken.model, course, found);

    expect(excerpts.size).toBe(2);
    /* Every page falls back to its own opening lines. */
    for (const p of found) {
      expect(excerpts.get(p.url)).toBe(p.content.slice(0, 600).trim());
    }
  });
});

describe("collectSources", () => {
  it("produces Sources with title, url, fetched time and relevant excerpt", async () => {
    const firecrawl = fakeFirecrawl(fetched);
    const excerptModel = scriptedModel([
      json({
        excerpts: [
          { url: "https://sdk.vercel.example/docs", excerpt: "generateText builds courses." },
          { url: "https://sdk.vercel.example/streaming", excerpt: "streamText streams." },
        ],
      }),
    ]);

    const sources = await collectSources(firecrawl.searcher, excerptModel.model, course);

    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({
      title: "AI SDK docs",
      url: "https://sdk.vercel.example/docs",
      excerpt: "generateText builds courses.",
    });
    for (const s of sources) {
      expect(s.ref).toMatch(/^src-/);
      expect(new Date(s.fetchedAt).toISOString()).toBe(s.fetchedAt);
    }
  });
});

describe("draftOutline and buildOutline", () => {
  it("asks the model for the course's language, depth intent and sources", async () => {
    const model = scriptedModel([json(REACH_DRAFT)]);
    const sources = await collectSources(
      fakeFirecrawl(fetched.slice(0, 2)).searcher,
      scriptedModel([json({ excerpts: [] })]).model,
      course,
    );

    await draftOutline(model.model, course, sources);

    const prompt = model.prompts[0];
    expect(prompt).toContain("the Vercel AI SDK");
    expect(prompt).toContain("build my own AI chat app");
    expect(prompt).toContain("English");
    expect(prompt).toContain("3–4 Modules with 2–3 Lessons each");
    expect(prompt).toContain("https://sdk.vercel.example/docs");
  });

  it("freezes the draft into an Outline inside the Depth bounds", () => {
    let n = 0;
    const outline = buildOutline(REACH_DRAFT, course.depth, () => `id-${++n}`);

    expect(outline.modules).toHaveLength(3);
    expect(outline.modules.flatMap((m) => m.lessons)).toHaveLength(6);
    expect(outline.modules.map((m) => m.numeral)).toEqual(["I", "II", "III"]);
    expect(outline.modules.map((m) => m.ordinal)).toEqual([1, 2, 3]);
    /* Lesson ordinals run across the whole Course, not per Module. */
    expect(outline.modules[0].lessons.map((l) => l.ordinal)).toEqual([1, 2]);
    expect(outline.modules[1].lessons.map((l) => l.ordinal)).toEqual([3, 4]);
    expect(outline.modules[2].lessons.map((l) => l.ordinal)).toEqual([5, 6]);
    /* Ids are unique, stable strings: module first, then its lessons. */
    const ids = [
      outline.modules[0].id,
      ...outline.modules[0].lessons.map((l) => l.id),
      outline.modules[1].id,
      ...outline.modules[1].lessons.map((l) => l.id),
      outline.modules[2].id,
      ...outline.modules[2].lessons.map((l) => l.id),
    ];
    expect(ids).toEqual(["id-1", "id-2", "id-3", "id-4", "id-5", "id-6", "id-7", "id-8", "id-9"]);
    expect(new Set(ids).size).toBe(9);
  });

  it.each([2, 3])("keeps a %s-lesson-per-module reach outline inside the bounds", (lessons) => {
    const outline = buildOutline(draftOf(3, lessons), "reach");
    const total = outline.modules.reduce((n, m) => n + m.lessons.length, 0);
    expect(total).toBe(3 * lessons);
  });

  it("fails a draft outside the Depth bounds instead of trimming it", () => {
    expect(() => buildOutline(draftOf(2, 2), "reach")).toThrow(DesignError);
    expect(() => buildOutline(draftOf(5, 2), "reach")).toThrow(DesignError);
    expect(() => buildOutline(draftOf(3, 4), "reach")).toThrow(DesignError);
  });

  it("fails a module with no lessons", () => {
    const draft = draftOf(3, 2);
    draft.modules[1].lessons = [];
    expect(() => buildOutline(draft, "reach")).toThrow(DesignError);
  });
});

describe("designSpecification", () => {
  let n = 0;
  const outline = buildOutline(REACH_DRAFT, course.depth, () => `id-${++n}`);
  const lessonIds = outline.modules.flatMap((m) => m.lessons.map((l) => l.id));

  function specResponse() {
    return {
      learningGraph: [
        { id: "g1", skill: "Start a project", requires: [], lessonId: lessonIds[0] },
        { id: "g2", skill: "Stream a reply", requires: ["g1"], lessonId: lessonIds[1] },
      ],
      alignment: lessonIds.map((id, i) => ({
        lessonId: id,
        performance: `Do step ${i + 1}`,
        prerequisiteNodes: i === 0 ? [] : ["g1"],
        moduleMilestone: "The app runs",
        exerciseContribution: "Adds a page to the app",
      })),
      finalExercise: {
        task: "Ship the chat app",
        acceptanceChecks: ["A reply streams in", "History survives a reload"],
      },
      evidence: [
        { sourceRef: "src-a", supports: "streamText streams tokens" },
        { sourceRef: "src-unknown", supports: "should be dropped" },
      ],
    };
  }

  it("materializes the private specification against the real lesson ids", async () => {
    const specModel = scriptedModel([json(specResponse())]);
    const spec = await designSpecification(specModel.model, course, outline, REACH_DRAFT, []);

    expect(specModel.prompts[0]).toContain(lessonIds[0]);
    expect(spec.contract).toMatchObject({
      topic: course.topic,
      goal: course.goal,
      background: course.background,
      depth: "reach",
      language: "en",
    });
    expect(spec.contract.terminalPerformances).toEqual(REACH_DRAFT.terminalPerformances);
    expect(spec.throughline).toEqual(REACH_DRAFT.throughline);
    expect(spec.learningGraph).toHaveLength(2);
    expect(spec.alignment).toHaveLength(6);
    expect(spec.finalExercise.acceptanceChecks).toHaveLength(2);
  });

  it("keeps only evidence that cites a real Source ref", async () => {
    const specModel = scriptedModel([json(specResponse())]);
    const sources = [
      { ref: "src-a", title: "Docs", url: "https://a.example", fetchedAt: "2026-08-31T00:00:00.000Z", excerpt: "..." },
    ];
    const spec = await designSpecification(specModel.model, course, outline, REACH_DRAFT, sources);

    expect(spec.evidence).toEqual([{ sourceRef: "src-a", supports: "streamText streams tokens" }]);
  });

  it("fails when the model ignores a Lesson", async () => {
    const response = specResponse();
    response.alignment = response.alignment.slice(0, 2);
    const specModel = scriptedModel([json(response)]);

    await expect(
      designSpecification(specModel.model, course, outline, REACH_DRAFT, []),
    ).rejects.toThrow(DesignError);
  });
});

/**
 * The whole design, as the Workflow steps run it, against real tables:
 * Sources stored with the required fields, the Outline versioned, the
 * specification private, and the Course left at the Outline checkpoint.
 */
describe("design persistence", () => {
  let counter = 0;

  async function seedCourse(
    db: Awaited<ReturnType<typeof makeTestDb>>,
    overrides: Partial<DesignCourse> = {},
  ) {
    const [user] = await db
      .insert(users)
      .values({ id: "u1", name: "L", email: "l@example.com", emailVerified: true, createdAt: new Date(), updatedAt: new Date() })
      .returning();
    const [courseRow] = await db
      .insert(courses)
      .values({
        ownerId: user.id,
        topic: course.topic,
        goal: course.goal,
        background: course.background,
        language: course.language,
        depth: course.depth,
        grounding: overrides.grounding ?? course.grounding,
        status: "designing",
      })
      .returning();
    return { user, courseRow };
  }

  /** Runs the same sequence the workflow steps run, fully scripted. */
  async function designOutcome(overrides: Partial<DesignCourse> = {}) {
    const runCourse = { ...course, ...overrides };
    const pages = runCourse.grounding ? fetched.slice(0, 2) : [];
    const firecrawl = fakeFirecrawl(pages);
    const excerptModel = scriptedModel([
      json({ excerpts: pages.map((p) => ({ url: p.url, excerpt: `Excerpt for ${p.title}` })) }),
    ]);
    const sources = await collectSources(firecrawl.searcher, excerptModel.model, runCourse);

    const outlineModel = scriptedModel([json(draftOf(3, 2))]);
    const draft = await draftOutline(outlineModel.model, runCourse, sources);
    const outline = buildOutline(draft, runCourse.depth, () => `l${++counter}`);
    const lessonIds = outline.modules.flatMap((m) => m.lessons.map((l) => l.id));

    const specModel = scriptedModel([
      json({
        learningGraph: [
          { id: "g1", skill: "Start", requires: [], lessonId: lessonIds[0] },
          { id: "g2", skill: "Reply", requires: ["g1"], lessonId: lessonIds[1] },
        ],
        alignment: lessonIds.map((id, i) => ({
          lessonId: id,
          performance: `Do step ${i + 1}`,
          prerequisiteNodes: [],
          moduleMilestone: "The app runs",
          exerciseContribution: "Adds a page",
        })),
        finalExercise: { task: "Ship it", acceptanceChecks: ["It runs"] },
        evidence: sources.map((s) => ({ sourceRef: s.ref, supports: `${s.title} backs this` })),
      }),
    ]);
    const specification = await designSpecification(specModel.model, runCourse, outline, draft, sources);
    return { sources, outline, specification };
  }

  it("lands the whole design: sources, outline, spec, and the state transition", async () => {
    const db = await makeTestDb();
    const { courseRow } = await seedCourse(db);
    counter = 0;
    const run = await startDesignRun(db, courseRow.id);
    const outcome = await designOutcome();
    const saved = await saveDesignResult(db, courseRow.id, run.id, outcome);

    const after = await db.select().from(courses).where(eq(courses.id, courseRow.id)).limit(1);
    expect(after[0].status).toBe("awaiting-outline-approval");

    const outline = await latestOutline(db, courseRow.id);
    expect(outline?.version).toBe(1);
    expect(outline?.data.modules).toHaveLength(3);
    /* Module ids and lesson ids come from the same stable string space. */
    expect(outline?.data.modules[0].id).toBe("l1");
    expect(outline?.data.modules[0].lessons[0].id).toBe("l2");

    const stored = await listCourseSources(db, courseRow.id);
    expect(stored).toHaveLength(2);
    const byUrl = new Map(stored.map((s) => [s.url, s]));
    const first = byUrl.get("https://sdk.vercel.example/docs")!;
    expect(first).toMatchObject({
      ref: outcome.sources[0].ref,
      title: "AI SDK docs",
      excerpt: "Excerpt for AI SDK docs",
    });
    expect(first.fetchedAt).toBeInstanceOf(Date);

    const spec = await findCourseSpec(db, courseRow.id);
    expect(spec?.finalExercise.task).toBe("Ship it");
    expect(spec?.evidence).toHaveLength(2);
    expect(spec?.contract.topic).toBe(course.topic);

    const runAfter = await db.select().from(designRuns).where(eq(designRuns.id, run.id)).limit(1);
    expect(runAfter[0].status).toBe("succeeded");
    expect(saved.version).toBe(1);
  });

  it("stores no Sources when Grounding is off, and the spec's evidence is empty", async () => {
    const db = await makeTestDb();
    const { courseRow } = await seedCourse(db, { grounding: false });
    counter = 100;
    const run = await startDesignRun(db, courseRow.id);

    const outcome = await designOutcome({ grounding: false });
    await saveDesignResult(db, courseRow.id, run.id, outcome);

    expect(outcome.sources).toEqual([]);
    expect(await listCourseSources(db, courseRow.id)).toEqual([]);
    const spec = await findCourseSpec(db, courseRow.id);
    expect(spec?.evidence).toEqual([]);
  });

  it("records a useful failure and leaves the Course retryable-looking", async () => {
    const db = await makeTestDb();
    const { courseRow } = await seedCourse(db);
    const run = await startDesignRun(db, courseRow.id);

    await failDesignRun(db, courseRow.id, run.id, "The model returned no outline.");

    const after = await db.select().from(courses).where(eq(courses.id, courseRow.id)).limit(1);
    expect(after[0].status).toBe("failed");

    const failed = await latestDesignRun(db, courseRow.id);
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toBe("The model returned no outline.");
    /* Nothing to approve yet: no outline rows exist. */
    expect(await latestOutline(db, courseRow.id)).toBeUndefined();
  });

  it("retrying design starts a new run and appends Outline version 2", async () => {
    const db = await makeTestDb();
    const { courseRow } = await seedCourse(db);
    counter = 0;

    const first = await startDesignRun(db, courseRow.id);
    await saveDesignResult(db, courseRow.id, first.id, await designOutcome());

    const retry = await startDesignRun(db, courseRow.id);
    expect(retry.id).not.toBe(first.id);
    /* A retried Course is designing again, not stuck at its checkpoint. */
    const designing = await db.select().from(courses).where(eq(courses.id, courseRow.id)).limit(1);
    expect(designing[0].status).toBe("designing");

    await saveDesignResult(db, courseRow.id, retry.id, await designOutcome());
    const outline = await latestOutline(db, courseRow.id);
    expect(outline?.version).toBe(2);
  });
});
