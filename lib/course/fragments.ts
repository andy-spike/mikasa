import "server-only";

/**
 * Fragmentation (ticket #11): a published Lesson becomes searchable
 * fragments — one per content block, prefixed with the Lesson's title so
 * a hit reads with its context. Blocks are the natural unit: a paragraph,
 * a code block, a note, a table. The Exercise is a fragment of its own,
 * because "how does the exercise work" is exactly what a Learner asks.
 */
import type { LessonRow } from "@/lib/db/schema";
import type { Db } from "@/lib/db";
import { replaceCourseFragments } from "@/lib/db/fragments";
import type { ContentBlock } from "./content";
import type { FragmentInput } from "@/lib/db/fragments";

/** The subset of a Lesson row the fragments read. */
type FragmentSource = Pick<
  LessonRow,
  "lessonRef" | "title" | "body" | "workedExample" | "exercise" | "recallPrompt" | "selfExplanationPrompt"
>;

/** One block's text, flattened for embedding. */
function blockText(block: ContentBlock): string {
  switch (block.kind) {
    case "p":
      return block.text;
    case "code":
      return `Code (${block.language}):\n${block.code}`;
    case "note":
      return `${block.title}: ${block.text}`;
    case "table":
      return [
        block.caption,
        block.head.join(" | "),
        ...block.rows.map((r) => r.join(" | ")),
      ]
        .filter(Boolean)
        .join("\n");
  }
}

/** The Lesson's content, as fragments in reading order. */
export function buildLessonFragments(row: FragmentSource): FragmentInput[] {
  const blocks: ContentBlock[] = [...row.body, ...row.workedExample];
  const fragments: FragmentInput[] = [];
  let ordinal = 0;

  const push = (lessonRef: string, text: string) => {
    fragments.push({ lessonRef, ordinal: ordinal++, content: text });
  };

  push(row.lessonRef, `Lesson: ${row.title}`);
  for (const block of blocks) {
    push(row.lessonRef, `Lesson: ${row.title}\n${blockText(block)}`);
  }
  push(
    row.lessonRef,
    `Lesson: ${row.title}\nExercise: ${row.exercise.task}\nDone when: ${row.exercise.check}`,
  );
  push(
    row.lessonRef,
    `Lesson: ${row.title}\nRecall from memory: ${row.recallPrompt}\nExplain why: ${row.selfExplanationPrompt}`,
  );
  return fragments;
}

/** Every fragment of a version's Lessons, in order. */
export function buildCourseFragments(rows: FragmentSource[]): FragmentInput[] {
  return rows.flatMap((row) => buildLessonFragments(row));
}

/**
 * Embeds and stores the Course's fragments over the existing ones.
 * Called right after a revision is published, so search always answers
 * from what is currently published. The embedder is injected: production
 * passes the OpenRouter function, tests a controlled fake.
 */
export async function embedCourseFragments(
  db: Db,
  embedTexts: (texts: string[]) => Promise<number[][]>,
  courseId: string,
  outlineVersion: number,
): Promise<number> {
  const { getLessonsForVersion } = await import("@/lib/db/lessons");
  const rows = await getLessonsForVersion(db, courseId, outlineVersion);
  const fragments = buildCourseFragments(rows);
  if (fragments.length === 0) return 0;
  const embeddings = await embedTexts(fragments.map((f) => f.content));
  await replaceCourseFragments(db, courseId, fragments, embeddings);
  return fragments.length;
}
