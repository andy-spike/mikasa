/* Throwaway fixture for iterating on the lesson-generation screen by eye.
   It renders the re-imagined surface with sample data, so no auth, database
   or workflow run is involved. Delete this route before shipping.
   Open http://localhost:3000/mock/lesson-generation */

import { AppShell } from "@/components/app-shell";
import { highlightBlocks } from "@/lib/course/highlight";
import { WritersColumnMock } from "./writers-column";
import { DOCS, TOPIC, type LessonDoc } from "./fixture";

export default async function MockLessonGenerationPage() {
  /* The real surface highlights where the Course is assembled, so the mock
     does the same: the server renders the roles and the client plays the run. */
  const docs: Record<string, LessonDoc> = {};
  for (const [id, doc] of Object.entries(DOCS)) {
    docs[id] = {
      ...doc,
      body: await highlightBlocks(doc.body),
      ...(doc.correctedBody ? { correctedBody: await highlightBlocks(doc.correctedBody) } : {}),
    };
  }

  return (
    <AppShell section={TOPIC}>
      <WritersColumnMock docs={docs} />
    </AppShell>
  );
}
