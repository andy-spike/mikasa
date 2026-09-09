import { generateText, Output } from "ai";
import type { LanguageModel } from "ai";
import { nanoid } from "nanoid";
import { z } from "zod";
import { designProviderOptions, groundingProviderOptions } from "@/lib/model";
import { depthBounds, type CourseInput, type DepthId } from "./limits";
import { languageName as courseLanguageName } from "./prompt-blocks";
import { outlineLessonsWithModule } from "./spec-graph";
import { validateSpecification } from "./spec-validate";
import type { CourseSpecification, GatheredSource, OutlineData, OutlineModule } from "./types";

export class DesignError extends Error {
  name = "DesignError";
}

export type DesignCourse = Pick<
  CourseInput,
  "topic" | "goal" | "background" | "language" | "depth" | "grounding"
>;

export type FetchedPage = {
  title: string;
  url: string;
  fetchedAt: string;
  content: string;
};

export type SourceSearcher = (query: string, limit: number) => Promise<FetchedPage[]>;

export const SOURCE_LIMIT = 6;

export const EXCERPT_MAX_CHARS = 600;

function searchQuery(course: DesignCourse): string {
  return [course.topic, course.goal].filter(Boolean).join(" — ");
}

export function firecrawlSearcher(): SourceSearcher {
  return async (query, limit) => {
    const { Firecrawl } = await import("firecrawl");
    const client = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
    const results = await client.search(query, {
      limit,
      scrapeOptions: { formats: ["markdown"] },
    });

    const pages: FetchedPage[] = [];
    const fetchedAt = new Date().toISOString();
    for (const doc of results.web ?? []) {
      if (!("url" in doc) || !doc.url) continue;
      pages.push({
        title: docTitle(doc, doc.url),
        url: doc.url,
        fetchedAt,
        content: docContent(doc),
      });
    }
    return pages;
  };
}

function docContent(doc: object): string {
  if ("markdown" in doc && typeof doc.markdown === "string") return doc.markdown;
  if ("description" in doc && typeof doc.description === "string") return doc.description;
  return "";
}

function docTitle(doc: object, url: string): string {
  if (
    "metadata" in doc &&
    doc.metadata &&
    typeof doc.metadata === "object" &&
    "title" in doc.metadata
  )
    return (doc.metadata.title as string) || url;
  if ("title" in doc && doc.title) return doc.title as string;
  return url;
}

export async function gatherSources(
  searcher: SourceSearcher,
  course: DesignCourse,
): Promise<FetchedPage[]> {
  if (!course.grounding) return [];
  const pages = await searcher(searchQuery(course), SOURCE_LIMIT);
  return pages.filter((p) => p.content.trim().length > 0);
}

const excerptsSchema = z.object({
  excerpts: z.array(
    z.object({
      url: z.string(),
      excerpt: z.string(),
    }),
  ),
});

export async function selectExcerpts(
  model: LanguageModel,
  course: DesignCourse,
  pages: FetchedPage[],
): Promise<Map<string, string>> {
  const fallback = (page: FetchedPage) => page.content.slice(0, EXCERPT_MAX_CHARS).trim();

  if (pages.length === 0) return new Map();

  let chosen: Map<string, string | undefined>;
  try {
    const { output } = await generateText({
      model,
      providerOptions: groundingProviderOptions(),
      output: Output.object({ schema: excerptsSchema }),
      prompt: [
        "A learner is building a course.",
        `Topic: ${course.topic}`,
        `Goal: ${course.goal}`,
        "",
        "Below are web pages fetched for this course. For each page, do one job:",
        `quote the single passage (at most ${EXCERPT_MAX_CHARS} characters) most relevant to teaching this topic toward this goal.`,
        "Return every URL you were given, each with its excerpt, verbatim from the page.",
        "When a page has no passage that helps teach the topic, return an empty string for its excerpt. Never invent text.",
        "",
        ...pages.map(
          (p) => `URL: ${p.url}\nTITLE: ${p.title}\nCONTENT:\n${p.content.slice(0, 4000)}`,
        ),
      ].join("\n"),
    });

    chosen = new Map(
      (output?.excerpts ?? []).map(
        (e) => [e.url, e.excerpt.trim().slice(0, EXCERPT_MAX_CHARS)] as const,
      ),
    );
  } catch {
    chosen = new Map();
  }

  const result = new Map<string, string>();
  for (const page of pages) {
    const picked = (chosen.get(page.url) ?? "").trim().slice(0, EXCERPT_MAX_CHARS);
    result.set(page.url, chosen.has(page.url) ? picked : fallback(page));
  }
  return result;
}

export async function collectSources(
  searcher: SourceSearcher,
  excerptModel: LanguageModel,
  course: DesignCourse,
  newRef: () => string = () => `src-${nanoid(10)}`,
): Promise<GatheredSource[]> {
  const pages = await gatherSources(searcher, course);
  const excerpts = await selectExcerpts(excerptModel, course, pages);
  return pages.map((page) => ({
    ref: newRef(),
    title: page.title,
    url: page.url,
    fetchedAt: page.fetchedAt,
    excerpt: excerpts.get(page.url) ?? "",
  }));
}

export type OutlineDraft = {
  modules: { title: string; lessons: { title: string; summary: string; minutes: number }[] }[];
  terminalPerformances: string[];
  exclusions: string[];
  learnerAssumptions: string[];
  throughline: {
    premise: string;
    runningExample: string;
    vocabulary: string[];
    /** Required for new drafts by the schema; absent in drafts saved before it existed. */
    exampleContract?: string;
  };
};

const outlineSchema = z.object({
  modules: z.array(
    z.object({
      title: z.string().min(1),
      lessons: z.array(
        z.object({
          title: z.string().min(1),
          summary: z.string().min(1).max(200),
          // Models sometimes return fractional minutes; rounding beats failing the outline.
          minutes: z.number().positive(),
        }),
      ),
    }),
  ),
  terminalPerformances: z.array(z.string()).min(1),
  exclusions: z.array(z.string()),
  learnerAssumptions: z.array(z.string()),
  throughline: z.object({
    premise: z.string().min(1),
    runningExample: z.string().min(1),
    vocabulary: z.array(z.string()),
    exampleContract: z.string(),
  }),
});

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

function describeBounds(depth: string): string {
  const b = depthBounds(depth);
  return `${b.minModules}–${b.maxModules} Modules with ${b.minLessonsPerModule}–${b.maxLessonsPerModule} Lessons each`;
}

function exactOutlineCounts(depth: string): { modules: number; lessonsPerModule: number } {
  const { minModules, maxModules, minLessonsPerModule, maxLessonsPerModule } = depthBounds(depth);
  return {
    modules: Math.round((minModules + maxModules) / 2),
    lessonsPerModule: Math.round((minLessonsPerModule + maxLessonsPerModule) / 2),
  };
}

function describeExactCounts(depth: string): string {
  const exact = exactOutlineCounts(depth);
  return `exactly ${exact.modules} Modules with exactly ${exact.lessonsPerModule} Lessons each`;
}

function depthIntent(depth: string): string {
  switch (depth as DepthId) {
    case "reach":
      return "The learner wants the shortest line to their Goal. Nothing beside the point.";
    case "mastery":
      return "The learner wants to go past the Goal into the internals, the failure modes, the arguments.";
    default:
      return "The learner wants their Goal plus the surrounding ground to keep using this skill without a reference open.";
  }
}

export async function draftOutline(
  model: LanguageModel,
  course: DesignCourse,
  sources: GatheredSource[],
): Promise<OutlineDraft> {
  const grounded =
    sources.length > 0
      ? [
          "The learner asked for Grounding. These sources were fetched for this course;",
          "keep the plan consistent with what they actually say (and do not invent URLs):",
          ...sources.map((s) => `- ${s.title} (${s.url}): ${s.excerpt}`),
        ].join("\n")
      : "The learner chose no Grounding: rely on your built-in knowledge and keep claims timeless.";

  const { output } = await generateText({
    model,
    providerOptions: designProviderOptions(),
    output: Output.object({ schema: outlineSchema }),
    prompt: [
      "You design course outlines for Mikasa. A course takes a learner from their background to a concrete goal.",
      "",
      `Topic: ${course.topic}`,
      `Goal: ${course.goal}`,
      course.background
        ? `Background (skip fundamentals this names): ${course.background}`
        : "Background: none given.",
      `Depth: ${course.depth}. ${depthIntent(course.depth)} The outline must hit ${describeExactCounts(course.depth)} (inside ${describeBounds(course.depth)}).`,
      `Course language: write every title, summary and sentence in ${courseLanguageName(course.language)}.`,
      "",
      grounded,
      "",
      "Plan the course backwards from the goal:",
      "- terminalPerformances: 2-5 things the learner can demonstrably DO at the end, phrased as verbs.",
      "- modules: each covers one area; lessons are a small, named step that serves its module.",
      "- summaries: exactly ONE sentence per lesson, under 200 characters, saying what the learner gets from it.",
      "- minutes: a realistic study estimate per lesson (5-90).",
      "- throughline: one running problem, project or scenario every lesson extends, plus the shared vocabulary.",
      "- throughline.exampleContract: pin the running example once, now, in this fixed template and nothing else:",
      "  Tags: <exact tags in order>; Classes: <exact class names>; Values: <exact shared values, breakpoints, sizes, units, file names>.",
      "  Lessons copy this verbatim; anything not pinned here each Lesson may choose, but never contradict.",
      "  Use an empty string only when the Topic has no cumulative example.",
      "- exclusions: what this course deliberately leaves out.",
      "- learnerAssumptions: what you assume they already know, derived from the background.",
      "",
      "Return JSON only.",
    ].join("\n"),
  });

  if (!output) throw new DesignError("The model returned no outline.");
  return output;
}

export function buildOutline(
  draft: OutlineDraft,
  depth: string,
  newId: () => string = () => nanoid(),
): OutlineData {
  const bounds = depthBounds(depth);
  const moduleCount = draft.modules.length;
  if (
    moduleCount < bounds.minModules ||
    moduleCount > bounds.maxModules ||
    draft.modules.some(
      (m) =>
        m.lessons.length < bounds.minLessonsPerModule ||
        m.lessons.length > bounds.maxLessonsPerModule,
    )
  ) {
    throw new DesignError(
      `The drafted Outline misses the ${depth} bounds of ${describeBounds(depth)}.`,
    );
  }

  let lessonOrdinal = 0;
  const modules: OutlineModule[] = draft.modules.map((m, mi) => {
    if (m.lessons.length === 0) {
      throw new DesignError(`Module "${m.title}" has no Lessons.`);
    }
    return {
      id: newId(),
      ordinal: mi + 1,
      numeral: ROMAN[mi] ?? String(mi + 1),
      title: m.title,
      lessons: m.lessons.map((l) => ({
        id: newId(),
        ordinal: ++lessonOrdinal,
        title: l.title,
        summary: l.summary,
        minutes: Math.round(l.minutes),
      })),
    };
  });

  return { modules };
}

const specificationSchema = z.object({
  learningGraph: z.array(
    z.object({
      id: z.string().regex(/^g\d+$/),
      skill: z.string().min(1),
      requires: z.array(z.string()),
      lessonId: z.string(),
    }),
  ),
  alignment: z.array(
    z.object({
      lessonId: z.string(),
      performance: z.string().min(1),
      prerequisiteNodes: z.array(z.string()),
      moduleMilestone: z.string().min(1),
      exerciseContribution: z.string().min(1),
      exampleStart: z.string(),
      exampleEnd: z.string(),
      sourceRefs: z.array(z.string()),
    }),
  ),
  finalExercise: z.object({
    task: z.string().min(1),
    acceptanceChecks: z.array(z.string()).min(1),
  }),
  evidence: z.array(
    z.object({
      sourceRef: z.string(),
      supports: z.string().min(1),
    }),
  ),
});

export async function designSpecification(
  model: LanguageModel,
  course: DesignCourse,
  outline: OutlineData,
  draft: OutlineDraft,
  sources: GatheredSource[],
): Promise<CourseSpecification> {
  const lessons = outlineLessonsWithModule(outline);

  const { output } = await generateText({
    model,
    providerOptions: designProviderOptions(),
    output: Output.object({ schema: specificationSchema }),
    prompt: [
      "You materialize Mikasa's private Course specification. The learner approved nothing yet;",
      "this document is the hidden context every Lesson will be written from.",
      "",
      `Topic: ${course.topic}`,
      `Goal: ${course.goal}`,
      course.background ? `Background: ${course.background}` : "Background: none given.",
      `Depth: ${course.depth} (${depthIntent(course.depth)}).`,
      `Course language: write every phrase in ${courseLanguageName(course.language)}.`,
      "",
      "The Outline is frozen. Use exactly these lesson ids:",
      ...lessons.map((l) => `- ${l.id} — Module "${l.module}", "${l.title}": ${l.summary}`),
      "",
      "Terminal performances:",
      ...draft.terminalPerformances.map((p) => `- ${p}`),
      "Throughline:",
      JSON.stringify(draft.throughline),
      draft.exclusions.length ? `Exclusions: ${draft.exclusions.join("; ")}` : "",
      draft.learnerAssumptions.length
        ? `Learner assumptions: ${draft.learnerAssumptions.join("; ")}`
        : "",
      "",
      sources.length
        ? "Source refs you may cite (use exactly these): " +
          sources.map((s) => `${s.ref} (${s.url})`).join(", ")
        : "Grounding was off: return an empty evidence array.",
      "",
      "Produce:",
      "- learningGraph: one node per skill/concept (ids g1, g2, ... in order; every id unique, matching /^g\\d+$/), each introduced by exactly one lessonId from the list above, with requires listing node ids introduced at the same or an earlier Lesson. Never require a skill introduced later.",
      "- alignment: for EVERY lesson id: the performance it teaches (distinct from every other Lesson's performance — duplicates fail validation; two Lessons with the same performance read as duplicate Lessons), the graph nodes it assumes (only nodes introduced at the same or an earlier Lesson), the module milestone it advances, how its Exercise contributes to the final one, exampleStart (how the shared running example looks before this Lesson; empty when the Topic has no cumulative example), exampleEnd (how it looks after; empty when none), and sourceRefs (stored Source refs this Lesson leans on; empty array is fine when it leans on none).",
      "- finalExercise: the one task that evidences the goal, with concrete acceptance checks.",
      "- evidence: for each source ref you actually rely on, the claim it supports.",
      "",
      "Write in the course language. Return JSON only.",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  if (!output) throw new DesignError("The model returned no specification.");

  const sourceRefSet = new Set(sources.map((s) => s.ref));
  const candidate: CourseSpecification = {
    contract: {
      topic: course.topic,
      goal: course.goal,
      background: course.background,
      depth: course.depth,
      language: course.language,
      terminalPerformances: draft.terminalPerformances,
      exclusions: draft.exclusions,
      learnerAssumptions: draft.learnerAssumptions,
    },
    throughline: draft.throughline,
    learningGraph: output.learningGraph,
    alignment: output.alignment,
    finalExercise: output.finalExercise,
    evidence: output.evidence,
  };
  try {
    validateSpecification(candidate, outline, sourceRefSet);
  } catch (error) {
    throw new DesignError(
      error instanceof Error ? error.message : "The specification did not validate.",
    );
  }
  return candidate;
}
