import "server-only";

/**
 * The Tutor's tools (ticket #11). Two, both read-only: exact Course
 * retrieval over the owned Course's embedded fragments, and a live web
 * search through Firecrawl. Neither tool can create or change anything —
 * they only read, which is the whole point of a Tutor.
 */
import { tool } from "ai";
import { z } from "zod";
import { searchFragments } from "@/lib/db/fragments";
import type { Db } from "@/lib/db";

/** How many fragments one Course search returns. */
const COURSE_HITS = 6;

export type TutorToolDeps = {
  db: Db;
  /** The Course the Tutor is reading; ownership was checked upstream. */
  courseId: string;
  embedQuery: (text: string) => Promise<number[]>;
  webSearch: typeof import("@/lib/web/firecrawl").webSearch;
};

export function tutorTools({ db, courseId, embedQuery, webSearch }: TutorToolDeps) {
  return {
    searchCourse: tool({
      description:
        "Search the Learner's Course for passages relevant to a question. " +
        "Try this first; it reads only this Course's published Lessons.",
      inputSchema: z.object({
        query: z.string().min(1).describe("What to look for, in a few plain words."),
      }),
      execute: async ({ query }) => {
        const embedding = await embedQuery(query);
        const hits = await searchFragments(db, courseId, embedding, COURSE_HITS);
        return {
          hits: hits.map((h) => ({
            lesson: h.lessonRef,
            text: h.content,
            relevance: Number(h.similarity.toFixed(4)),
          })),
        };
      },
    }),

    searchWeb: tool({
      description:
        "Search the current web through Firecrawl when the Course's own " +
        "content does not answer the question. Returns titles, links, and " +
        "short descriptions.",
      inputSchema: z.object({
        query: z.string().min(1).describe("The web search query."),
      }),
      execute: async ({ query }) => {
        const results = await webSearch(query);
        return { results };
      },
    }),
  };
}

export type TutorTools = ReturnType<typeof tutorTools>;
