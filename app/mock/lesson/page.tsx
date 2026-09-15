/* Throwaway fixture for iterating on the lesson-reading screen by eye.
   It renders the re-imagined surface with sample data, so no auth, database
   or workflow run is involved. Delete this route before shipping.
   Open http://localhost:3000/mock/lesson (add ?state=empty for the quiet state,
   or ?mode=tailor to land in the Tailor) */

import type { ReadingBlock } from "@/lib/course/reading";
import { highlightBlocks } from "@/lib/course/highlight";
import { DOCS } from "../lesson-generation/fixture";
import { MarginMock } from "./margin";

export default async function MockLessonPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; mode?: string }>;
}) {
  const { state, mode } = await searchParams;

  /* The real surface highlights where the Course is assembled, so the mock
     does the same: roles are rendered on the server. */
  const bodies: Record<string, ReadingBlock[]> = {};
  for (const [id, doc] of Object.entries(DOCS)) {
    bodies[id] = await highlightBlocks(doc.body);
  }

  return (
    <MarginMock
      bodies={bodies}
      empty={state === "empty"}
      initialMode={mode === "tailor" ? "tailor" : "tutor"}
    />
  );
}
