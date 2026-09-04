import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  appendDesignEvent,
  listDesignEvents,
  startDesignRun,
  upsertDesignSources,
} from "@/lib/db/design";
import { courses, designEvents, sources, users } from "@/lib/db/schema";
import { makeTestDb } from "./helpers/test-db";

async function seedCourse(db: Awaited<ReturnType<typeof makeTestDb>>) {
  const [user] = await db
    .insert(users)
    .values({
      id: "u1",
      name: "L",
      email: "l@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  const [courseRow] = await db
    .insert(courses)
    .values({
      ownerId: user.id,
      topic: "the Vercel AI SDK",
      goal: "build my own AI chat app",
      depth: "reach",
      status: "designing",
    })
    .returning();
  return courseRow;
}

describe("design progress events", () => {
  it("appends events in order and scopes them to the run", async () => {
    const db = await makeTestDb();
    const courseRow = await seedCourse(db);
    const run = await startDesignRun(db, courseRow.id);
    const other = await startDesignRun(db, courseRow.id);

    await appendDesignEvent(db, courseRow.id, run.id, "sources-searching", "Searching.");
    await appendDesignEvent(db, courseRow.id, run.id, "sources-found", "Found 2 sources.", {
      count: 2,
    });
    await appendDesignEvent(db, courseRow.id, other.id, "sources-searching", "Other run.");

    const forRun = await listDesignEvents(db, courseRow.id, run.id);
    expect(forRun.map((e) => e.kind)).toEqual(["sources-searching", "sources-found"]);
    expect(forRun[1].payload).toEqual({ count: 2 });

    const all = await listDesignEvents(db, courseRow.id);
    expect(all).toHaveLength(3);

    const rows = await db.select().from(designEvents);
    expect(rows).toHaveLength(3);
    void eq;
  });
});

describe("incremental design sources", () => {
  it("inserts placeholders then updates the same urls with excerpts", async () => {
    const db = await makeTestDb();
    const courseRow = await seedCourse(db);

    await upsertDesignSources(db, courseRow.id, [
      {
        ref: "src-aaa",
        title: "Docs",
        url: "https://example.com/docs",
        fetchedAt: "2026-09-01T00:00:00.000Z",
        excerpt: "Opening lines.",
      },
    ]);
    await upsertDesignSources(db, courseRow.id, [
      {
        ref: "src-aaa",
        title: "Docs",
        url: "https://example.com/docs",
        fetchedAt: "2026-09-01T00:00:00.000Z",
        excerpt: "The passage that matters.",
      },
      {
        ref: "src-bbb",
        title: "Guide",
        url: "https://example.com/guide",
        fetchedAt: "2026-09-01T00:00:00.000Z",
        excerpt: "Guide excerpt.",
      },
    ]);

    const rows = await db.select().from(sources).where(eq(sources.courseId, courseRow.id));
    expect(rows).toHaveLength(2);
    const byUrl = new Map(rows.map((r) => [r.url, r]));
    expect(byUrl.get("https://example.com/docs")?.excerpt).toBe("The passage that matters.");
    expect(byUrl.get("https://example.com/guide")?.ref).toBe("src-bbb");
  });
});
