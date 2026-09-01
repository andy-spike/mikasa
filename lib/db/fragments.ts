import "server-only";

/**
 * Lesson fragments (ticket #11): the published Course's searchable text,
 * embedded at 768 dimensions at publication time. Retrieval is exact
 * pgvector cosine search — ORDER BY embedding <=> query with no index,
 * perfect recall over Course-sized tables. Every query is scoped to one
 * Course id, so a Learner's Tutor can never see another Course's
 * fragments.
 */
import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "./index";
import { lessonFragments } from "./schema";

/** One searchable fragment, before it is embedded. */
export type FragmentInput = {
  lessonRef: string;
  ordinal: number;
  content: string;
};

/**
 * Replaces the Course's fragments wholesale. Called only after a revision
 * is published, so the stored fragments always describe exactly what the
 * current publication says — nothing stale survives.
 */
export async function replaceCourseFragments(
  db: Db,
  courseId: string,
  fragments: FragmentInput[],
  embeddings: number[][],
): Promise<void> {
  if (fragments.length !== embeddings.length) {
    throw new Error("Every fragment needs exactly one embedding.");
  }
  await db.transaction(async (tx) => {
    await tx.delete(lessonFragments).where(eq(lessonFragments.courseId, courseId));
    if (fragments.length === 0) return;
    await tx.insert(lessonFragments).values(
      fragments.map((f, i) => ({
        courseId,
        lessonRef: f.lessonRef,
        ordinal: f.ordinal,
        content: f.content,
        embedding: embeddings[i],
      })),
    );
  });
}

export type FragmentHit = {
  lessonRef: string;
  ordinal: number;
  content: string;
  /** 1 - cosine distance: 1 is a perfect match. */
  similarity: number;
};

/**
 * The nearest fragments of one Course, by exact cosine distance. The
 * query vector rides as pgvector's bracketed text form; the driver sends
 * it untyped and Postgres coerces it against the column's type.
 */
export async function searchFragments(
  db: Db,
  courseId: string,
  queryEmbedding: number[],
  k = 6,
): Promise<FragmentHit[]> {
  const literal = `[${queryEmbedding.map((v) => v.toString()).join(",")}]`;
  const rows = await db
    .select({
      lessonRef: lessonFragments.lessonRef,
      ordinal: lessonFragments.ordinal,
      content: lessonFragments.content,
      similarity: sql<number>`1 - (${lessonFragments.embedding} <=> ${literal}::vector)`,
    })
    .from(lessonFragments)
    .where(eq(lessonFragments.courseId, courseId))
    .orderBy(sql`${lessonFragments.embedding} <=> ${literal}::vector`)
    .limit(k);
  return rows;
}

/** The Course's fragments, in Lesson order (tests and auditing). */
export async function listFragments(
  db: Db,
  courseId: string,
): Promise<{ lessonRef: string; ordinal: number; content: string }[]> {
  return db
    .select({
      lessonRef: lessonFragments.lessonRef,
      ordinal: lessonFragments.ordinal,
      content: lessonFragments.content,
    })
    .from(lessonFragments)
    .where(eq(lessonFragments.courseId, courseId))
    .orderBy(asc(lessonFragments.ordinal));
}
