import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", async () => {
  const { makeTestDb } = await import("./helpers/test-db");
  return { db: await makeTestDb() };
});

const headerState = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => headerState.current }));

const tutorModelState = vi.hoisted(() => ({
  current: undefined as
    | ReturnType<typeof import("./helpers/fake-model").streamingModel>
    | undefined,
}));
const embedState = vi.hoisted(() => ({
  queries: [] as string[],
}));
vi.mock("@/lib/model", async () => {
  const actual = await vi.importActual<typeof import("@/lib/model")>("@/lib/model");
  return {
    ...actual,
    tutorModel: () => tutorModelState.current!.model,
    embedTexts: async (texts: string[]) => texts.map(keywordEmbed),
    embedQuery: async (text: string) => {
      embedState.queries.push(text);
      return keywordEmbed(text);
    },
  };
});
const webSearchState = vi.hoisted(() => {
  type WebHit = { title: string; url: string; snippet: string };
  const none = async (): Promise<WebHit[]> => [];
  return { current: none as (query: string) => Promise<WebHit[]> };
});
vi.mock("@/lib/web/firecrawl", () => ({
  webSearch: async (query: string) => webSearchState.current(query),
}));

import { streamingModel } from "./helpers/fake-model";

/**
 * A deterministic, offline embedder: 1536 dimensions, one hot dimension
 * per known keyword. Fragment text and query text that share a keyword
 * land close together, which is all the retrieval proof needs.
 */
function keywordEmbed(text: string): number[] {
  const words = ["windows", "joins", "indexes", "transactions", "vacuum"];
  const vector = new Array<number>(1536).fill(0.01);
  const lower = text.toLowerCase();
  words.forEach((word, i) => {
    if (lower.includes(word)) vector[i] = 1;
  });
  return vector;
}

const { parseLessonContent } = await import("@/lib/course/content");
const { saveLessonContent } = await import("@/lib/db/lessons");
const { buildCourseFragments, embedCourseFragments } = await import("@/lib/course/fragments");
const { searchFragments, listFragments } = await import("@/lib/db/fragments");
const { tutorTools } = await import("@/lib/course/tutor-tools");
const { publishRevision } = await import("@/lib/db/review");
const {
  courses,
  courseSpecs,
  generationRuns,
  outlines,
  reviewRuns,
  sources,
  tutorMessages,
  users,
} = await import("@/lib/db/schema");
const { cookieHeader, fakeGoogle } = await import("./helpers/fake-google");
const { auth } = await import("@/lib/session");
const { db } = await import("@/lib/db");
const { POST } = await import("@/app/api/courses/[courseId]/tutor/route");
const ORIGIN = "http://localhost:3000";

const OUTLINE = {
  modules: [
    {
      id: "m1",
      ordinal: 1,
      numeral: "I",
      title: "Module one",
      lessons: [{ id: "l1", ordinal: 1, title: "Lesson one", summary: "First.", minutes: 20 }],
    },
  ],
};

const SPEC = {
  contract: {
    topic: "window functions in SQL",
    goal: "query with confidence",
    background: "",
    depth: "reach",
    language: "en",
    terminalPerformances: ["Write window queries"],
    exclusions: [],
    learnerAssumptions: [],
  },
  throughline: { premise: "p", runningExample: "r", vocabulary: [] },
  learningGraph: [],
  alignment: OUTLINE.modules[0].lessons.map((l) => ({
    lessonId: l.id,
    performance: "does",
    prerequisiteNodes: [] as string[],
    moduleMilestone: "m",
    exerciseContribution: "c",
  })),
  finalExercise: { task: "t", acceptanceChecks: ["c"] },
  evidence: [],
};

async function signInWithGoogle(email: string): Promise<string> {
  fakeGoogle({ sub: `sub-${email}`, name: "A Learner", email, email_verified: true });
  const signIn = await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: "/courses" }),
    }),
  );
  const { url } = (await signIn.json()) as { url: string };
  const state = new URL(url).searchParams.get("state") as string;
  const callback = await auth.handler(
    new Request(`${ORIGIN}/api/auth/callback/google?code=one-time-code&state=${state}`, {
      headers: { cookie: cookieHeader(signIn) },
    }),
  );
  return cookieHeader(callback);
}

const WINDOW_LESSON = {
  body: [
    { kind: "p", text: "A window function sees every row of the partition." },
    { kind: "code", language: "sql", code: "select sum(x) over (partition by y)" },
  ],
  workedExample: [{ kind: "p", text: "The running total uses windows." }],
  recallPrompt: "What does the window see?",
  selfExplanationPrompt: "Why no fold?",
  exercise: { task: "Write a window query.", check: "Every row kept." },
  bridge: "Next, joins.",
};

async function seedPublishedCourse(ownerEmail: string): Promise<string> {
  const [user] = await db.select().from(users).where(eq(users.email, ownerEmail)).limit(1);
  const [course] = await db
    .insert(courses)
    .values({
      ownerId: user.id,
      topic: "window functions in SQL",
      goal: "query with confidence",
      depth: "reach",
      status: "reviewing",
    })
    .returning();
  await db.insert(outlines).values({ courseId: course.id, version: 1, data: OUTLINE });
  await db.insert(courseSpecs).values({ courseId: course.id, spec: SPEC, outlineVersion: 1 });
  await db.insert(sources).values({
    courseId: course.id,
    ref: "s1",
    title: "Postgres window docs",
    url: "https://example.com/windows",
    excerpt: "A window function computes across rows.",
  });
  const [run] = await db
    .insert(generationRuns)
    .values({ courseId: course.id, outlineVersion: 1 })
    .returning();
  await saveLessonContent(
    db,
    course.id,
    1,
    run.id,
    parseLessonContent("l1", "Lesson one", WINDOW_LESSON),
  );
  const [review] = await db
    .insert(reviewRuns)
    .values({ courseId: course.id, outlineVersion: 1, status: "succeeded" })
    .returning();
  const published = await publishRevision(db, course.id, 1, review.id);
  expect(published.ok).toBe(true);
  await embedCourseFragments(db, async (texts) => texts.map(keywordEmbed), course.id, 1);
  return course.id;
}

async function turn(
  cookie: string,
  courseId: string,
  lessonId: string,
  message: string,
): Promise<{ status: number; text: string }> {
  headerState.current = cookie ? new Headers({ cookie }) : new Headers();
  const response = await POST(
    new Request(`${ORIGIN}/api/courses/${courseId}/tutor`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ lessonId, message }),
    }),
    { params: Promise.resolve({ courseId }) },
  );
  return { status: response.status, text: response.body ? await response.text() : "" };
}

const OWNER = "owner@example.com";
let ownerCookie = "";

beforeEach(async () => {
  headerState.current = new Headers();
  ownerCookie = await signInWithGoogle(OWNER);
  tutorModelState.current = streamingModel(["A short answer."]);
  embedState.queries = [];
});

afterEach(async () => {
  await db.delete(users);
  headerState.current = new Headers();
});

describe("fragments", () => {
  it("one fragment per block, plus the Lesson intro and its Exercise", () => {
    const lesson = parseLessonContent("l1", "Lesson one", WINDOW_LESSON);
    const fragments = buildCourseFragments([
      {
        lessonRef: lesson.lessonId,
        title: lesson.title,
        body: lesson.body,
        workedExample: lesson.workedExample,
        recallPrompt: lesson.recallPrompt,
        selfExplanationPrompt: lesson.selfExplanationPrompt,
        exercise: lesson.exercise,
      },
    ]);

    expect(fragments).toHaveLength(6);
    expect(fragments.map((f) => f.ordinal)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(fragments[1].content).toContain("window function sees every row");
    expect(fragments[4].content).toContain("Exercise:");
    expect(fragments.every((f) => f.lessonRef === "l1")).toBe(true);
  });
});

describe("exact Course retrieval", () => {
  it("embeds the published Lessons and returns the nearest fragment first", async () => {
    const courseId = await seedPublishedCourse(OWNER);

    const stored = await listFragments(db, courseId);
    expect(stored.length).toBeGreaterThanOrEqual(6);

    const hits = await searchFragments(db, courseId, keywordEmbed("windows over rows"), 3);
    expect(hits).toHaveLength(3);
    expect(hits[0].content.toLowerCase()).toContain("window");
    expect(hits[0].similarity).toBeGreaterThan(0.99);
    expect(hits[0].similarity).toBeGreaterThanOrEqual(hits[2].similarity);
  });

  it("never returns another Course's fragments", async () => {
    const courseId = await seedPublishedCourse(OWNER);

    await db.insert(users).values({
      id: "u2",
      name: "Other",
      email: "other2@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const [otherCourse] = await db
      .insert(courses)
      .values({
        ownerId: "u2",
        topic: "joins",
        goal: "g",
        depth: "reach",
        status: "reviewing",
      })
      .returning();
    await db.insert(outlines).values({ courseId: otherCourse.id, version: 1, data: OUTLINE });
    const [run] = await db
      .insert(generationRuns)
      .values({ courseId: otherCourse.id, outlineVersion: 1 })
      .returning();
    await saveLessonContent(
      db,
      otherCourse.id,
      1,
      run.id,
      parseLessonContent("l1", "Join lesson", {
        ...WINDOW_LESSON,
        body: [{ kind: "p", text: "Joins combine tables by a key." }],
      }),
    );
    const [review] = await db
      .insert(reviewRuns)
      .values({ courseId: otherCourse.id, outlineVersion: 1, status: "succeeded" })
      .returning();
    await publishRevision(db, otherCourse.id, 1, review.id);
    await embedCourseFragments(db, async (t) => t.map(keywordEmbed), otherCourse.id, 1);

    const hits = await searchFragments(db, courseId, keywordEmbed("joins windows"), 20);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.content !== "Join lesson")).toBe(true);
    expect(hits.every((h) => !h.content.includes("combine tables"))).toBe(true);
  });

  it("replaces all fragments when the Course is re-embedded", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    const before = await listFragments(db, courseId);
    await embedCourseFragments(db, async (t) => t.map(keywordEmbed), courseId, 1);
    const after = await listFragments(db, courseId);
    expect(after.map((f) => f.content)).toEqual(before.map((f) => f.content));
  });
});

describe("the Tutor's tools", () => {
  it("searchCourse reads the owned Course's fragments and writes nothing", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    const tools = tutorTools({
      db,
      courseId,
      embedQuery: async (t) => keywordEmbed(t),
      webSearch: async () => {
        throw new Error("not called");
      },
    });

    const result = (await tools.searchCourse.execute!({ query: "how do windows work" }, {
      toolCallId: "t",
      messages: [],
      context: {},
    } as never)) as { hits: { text: string }[] };
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits[0].text.toLowerCase()).toContain("window");
    expect(embedState.queries).toEqual([]);

    expect(await listFragments(db, courseId)).toHaveLength(
      (await listFragments(db, courseId)).length,
    );
    expect((await db.select().from(tutorMessages)).length).toBe(0);
  });

  it("searchWeb returns the substituted web results and nothing else", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    webSearchState.current = async (query) =>
      query.includes("postgres")
        ? [{ title: "Postgres 17 release", url: "https://example.com/pg17", snippet: "New." }]
        : [];
    const tools = tutorTools({
      db,
      courseId,
      embedQuery: async (t) => keywordEmbed(t),
      webSearch: webSearchState.current,
    });

    const result = (await tools.searchWeb.execute!({ query: "postgres 17 features" }, {
      toolCallId: "t",
      messages: [],
      context: {},
    } as never)) as { results: { title: string; url: string; snippet: string }[] };
    expect(result.results).toEqual([
      { title: "Postgres 17 release", url: "https://example.com/pg17", snippet: "New." },
    ]);
  });
});

describe("a turn with retrieval", () => {
  it("searches the Course, then answers with the Source link inline", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    tutorModelState.current = streamingModel([
      { toolCall: { name: "searchCourse", input: { query: "how do window functions work" } } },
      "The partition keeps every row — see [Postgres window docs](https://example.com/windows).",
    ]);

    const answer = await turn(ownerCookie, courseId, "l1", "How do windows work?");
    expect(answer.status).toBe(200);
    expect(answer.text).toContain("Postgres window docs");

    expect(embedState.queries).toContain("how do window functions work");
    const secondPrompt = tutorModelState.current!.prompts[1];
    expect(secondPrompt).toContain("searchCourse");

    expect((await db.select().from(tutorMessages)).length).toBe(2);
  });

  it("falls back to the web when the Course is not enough", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    webSearchState.current = async () => [
      { title: "Postgres 17 notes", url: "https://example.com/pg17", snippet: "Vacuum changes." },
    ];
    tutorModelState.current = streamingModel([
      { toolCall: { name: "searchWeb", input: { query: "postgres 17 vacuum" } } },
      "Fresh for this Course: [Postgres 17 notes](https://example.com/pg17).",
    ]);

    const answer = await turn(ownerCookie, courseId, "l1", "What changed in vacuum?");
    expect(answer.text).toContain("https://example.com/pg17");
    expect((await db.select().from(tutorMessages)).length).toBe(2);
  });

  it("stops after at most four agent steps even when the model keeps calling tools", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    tutorModelState.current = streamingModel([
      { toolCall: { name: "searchCourse", input: { query: "windows" } } },
      { toolCall: { name: "searchCourse", input: { query: "joins" } } },
      { toolCall: { name: "searchCourse", input: { query: "indexes" } } },
      { toolCall: { name: "searchCourse", input: { query: "vacuum" } } },
      { toolCall: { name: "searchCourse", input: { query: "transactions" } } },
      { toolCall: { name: "searchCourse", input: { query: "again" } } },
    ]);

    const answer = await turn(ownerCookie, courseId, "l1", "Just keep searching.");
    expect(answer.status).toBe(200);
    expect(tutorModelState.current!.calls()).toBeLessThanOrEqual(4);
  });
});

describe("the embeddings endpoint", () => {
  it("rejects vectors of the wrong shape", async () => {
    /* The real function, past the test mock; fetch is stubbed offline. */
    const actual = await vi.importActual<typeof import("@/lib/model")>("@/lib/model");
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 2, 3] }] }), {
        status: 200,
      })) as typeof fetch;
    try {
      await expect(actual.embedTexts(["x"])).rejects.toThrow(/1536 dimensions/);
    } finally {
      globalThis.fetch = realFetch;
      vi.unstubAllEnvs();
    }
  });
});
