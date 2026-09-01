/**
 * Ownership isolation: every Course query filters by the Learner, so
 * Learner B never sees Learner A's Courses, and a foreign id reads as
 * not-found.
 */
import { describe, expect, it } from "vitest";
import { findOwnedCourse, listOwnedCourses } from "@/lib/db/courses";
import { courses, users } from "@/lib/db/schema";
import { makeTestDb } from "./helpers/test-db";

const learnerA = {
  id: "user-a",
  name: "Learner A",
  email: "a@example.com",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const learnerB = { ...learnerA, id: "user-b", email: "b@example.com" };

async function seed() {
  const db = await makeTestDb();
  await db.insert(users).values([learnerA, learnerB]);
  await db.insert(courses).values([
    { ownerId: learnerA.id, topic: "the Vercel AI SDK", goal: "build my own AI chat app", depth: "working" },
    { ownerId: learnerA.id, topic: "Rust ownership", goal: "ship a CLI", depth: "reach" },
    { ownerId: learnerB.id, topic: "Kubernetes", goal: "run one service", depth: "mastery" },
  ]);
  return db;
}

describe("listOwnedCourses", () => {
  it("shows each Learner only their own Courses", async () => {
    const db = await seed();

    const forA = await listOwnedCourses(db, learnerA.id);
    const forB = await listOwnedCourses(db, learnerB.id);

    expect(forA.map((c) => c.topic)).toEqual(["the Vercel AI SDK", "Rust ownership"]);
    expect(forB.map((c) => c.topic)).toEqual(["Kubernetes"]);
  });
});

describe("findOwnedCourse", () => {
  it("reads another Learner's Course as not-found", async () => {
    const db = await seed();
    const [ownedByA] = await listOwnedCourses(db, learnerA.id);

    expect(await findOwnedCourse(db, learnerA.id, ownedByA.id)).toBeDefined();
    expect(await findOwnedCourse(db, learnerB.id, ownedByA.id)).toBeUndefined();
    expect(await findOwnedCourse(db, learnerB.id, crypto.randomUUID())).toBeUndefined();
  });
});
