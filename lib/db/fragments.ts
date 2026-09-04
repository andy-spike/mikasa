import "server-only";

/** Every query is scoped to one Course id, so one learner never reads another's fragments. */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./index";
import { generationRuns, lessonFragments, outlines } from "./schema";
import { currentRevision } from "./review";

export type FragmentInput = {
  lessonRef: string;
  ordinal: number;
  content: string;
};

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

export async function replaceLessonFragments(
  db: Db,
  courseId: string,
  lessonRefs: string[],
  fragments: FragmentInput[],
  embeddings: number[][],
): Promise<void> {
  if (fragments.length !== embeddings.length) {
    throw new Error("Every fragment needs exactly one embedding.");
  }
  if (lessonRefs.length === 0) return;
  await db.transaction(async (tx) => {
    await tx
      .delete(lessonFragments)
      .where(
        and(eq(lessonFragments.courseId, courseId), inArray(lessonFragments.lessonRef, lessonRefs)),
      );
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
  similarity: number;
};

/** The query vector rides as pgvector bracket text; Postgres coerces the untyped literal. */
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

export async function searchIsIncomplete(db: Db, courseId: string): Promise<boolean> {
  const revision = await currentRevision(db, courseId);
  if (!revision) return false;

  const [run] = await db
    .select({ fragmentsStatus: generationRuns.fragmentsStatus })
    .from(generationRuns)
    .where(
      and(
        eq(generationRuns.courseId, courseId),
        eq(generationRuns.outlineVersion, revision.outlineVersion),
      ),
    )
    .limit(1);
  if (run?.fragmentsStatus === "failed") return true;

  const [outline] = await db
    .select({ data: outlines.data })
    .from(outlines)
    .where(and(eq(outlines.courseId, courseId), eq(outlines.version, revision.outlineVersion)))
    .limit(1);
  if (!outline) return false;
  const refs = outline.data.modules.flatMap((m) => m.lessons.map((l) => l.id));
  if (refs.length === 0) return false;
  const rows = await db
    .selectDistinct({ lessonRef: lessonFragments.lessonRef })
    .from(lessonFragments)
    .where(eq(lessonFragments.courseId, courseId));
  const have = new Set(rows.map((r) => r.lessonRef));
  return refs.some((ref) => !have.has(ref));
}
