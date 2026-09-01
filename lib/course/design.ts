/**
 * Course design: the durable work that turns one Course row into a private
 * specification and a visible Outline.
 *
 * Every step is a plain function with explicit inputs and outputs and its
 * external providers (`model`, `searcher`) injected, so tests script them
 * and never touch a network. `workflows/course-design.ts` wraps these in
 * Workflow steps; nothing here knows about Workflow.
 *
 * The order follows docs/research/cohesive-course-generation.md: gather
 * Sources when Grounding is on, draft the Outline (the visible artifact,
 * bounded by Depth), then materialize the private specification against the
 * Outline's stable Lesson ids.
 */
import { generateText, Output } from "ai";
import type { LanguageModel } from "ai";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  designProviderOptions,
  groundingProviderOptions,
} from "@/lib/model";
import {
  depthBounds,
  type CourseInput,
  type DepthId,
} from "./limits";
import type {
  CourseSpecification,
  GatheredSource,
  OutlineData,
  OutlineModule,
} from "./types";

/** A design failure worth recording on the Course, not a bug to crash on. */
export class DesignError extends Error {
  name = "DesignError";
}

/** What design needs to know about the Course being designed. */
export type DesignCourse = Pick<
  CourseInput,
  "topic" | "goal" | "background" | "language" | "depth" | "grounding"
>;

/** One fetched page, before an excerpt is chosen for it. */
export type FetchedPage = {
  title: string;
  url: string;
  /** ISO timestamp of the fetch. */
  fetchedAt: string;
  content: string;
};

/**
 * The slice of Firecrawl design needs: search the web, scrape every hit's
 * markdown, return pages. `firecrawlSearcher` builds the real one; tests
 * hand a fake.
 */
export type SourceSearcher = (query: string, limit: number) => Promise<FetchedPage[]>;

/** How many Sources one design run gathers. */
export const SOURCE_LIMIT = 6;

/** Rough ceiling on an excerpt, so Lessons cite passages, not pages. */
export const EXCERPT_MAX_CHARS = 600;

function courseLanguageName(language: string): string {
  // Mirrors the fixed set in limits.ts; kept textual so prompts read as
  // prose without importing UI labels into the domain.
  const names: Record<string, string> = {
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    pt: "Portuguese",
  };
  return names[language] ?? "English";
}

function searchQuery(course: DesignCourse): string {
  return [course.topic, course.goal].filter(Boolean).join(" — ");
}

/** The real Firecrawl-backed searcher; the only place Firecrawl is named. */
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
      const url = "url" in doc ? doc.url : undefined;
      if (!url) continue;
      const metadata = "metadata" in doc ? doc.metadata : undefined;
      const content = "markdown" in doc && typeof doc.markdown === "string"
        ? doc.markdown
        : ("description" in doc && typeof doc.description === "string" ? doc.description : "");
      pages.push({
        title: metadata?.title || ("title" in doc && doc.title) || url,
        url,
        fetchedAt,
        content,
      });
    }
    return pages;
  };
}

/**
 * Step: gather Sources. With Grounding off this is a no-op that returns an
 * empty list — the Course is built on the model's built-in knowledge alone
 * and the specification's evidence ledger stays empty.
 */
export async function gatherSources(
  searcher: SourceSearcher,
  course: DesignCourse,
): Promise<FetchedPage[]> {
  if (!course.grounding) return [];
  const pages = await searcher(searchQuery(course), SOURCE_LIMIT);
  // Drop pages with nothing to excerpt; an empty page is not a Source.
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

/**
 * Step: pick the relevant excerpt for each fetched page. The model reads
 * every page against the Topic and Goal; a page the model skips (or a
 * failed parse) falls back to the page's opening lines, so a Source is
 * never lost to a formatting hiccup.
 */
export async function selectExcerpts(
  model: LanguageModel,
  course: DesignCourse,
  pages: FetchedPage[],
): Promise<Map<string, string>> {
  const fallback = (page: FetchedPage) =>
    page.content.slice(0, EXCERPT_MAX_CHARS).trim();

  if (pages.length === 0) return new Map();

  let chosen: Map<string, string>;
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
        "Below are web pages fetched for this course. For each page, quote the single passage (at most",
        `${EXCERPT_MAX_CHARS} characters) most relevant to teaching this topic toward this goal.`,
        "Return every URL you were given, each with its excerpt, verbatim from the page.",
        "",
        ...pages.map(
          (p) =>
            `URL: ${p.url}\nTITLE: ${p.title}\nCONTENT:\n${p.content.slice(0, 4000)}`,
        ),
      ].join("\n"),
    });

    chosen = new Map(
      (output?.excerpts ?? [])
        .map((e) => [e.url, e.excerpt.trim().slice(0, EXCERPT_MAX_CHARS)] as const)
        .filter(([url, excerpt]) => url && excerpt.length > 0),
    );
  } catch {
    chosen = new Map();
  }

  const result = new Map<string, string>();
  for (const page of pages) {
    const picked = chosen.get(page.url);
    result.set(
      page.url,
      picked && picked.length > 0 ? picked : fallback(page),
    );
  }
  return result;
}

/** Fetched pages plus their chosen excerpts, with stable refs assigned. */
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

/** What the Outline call returns before stable ids are assigned. */
export type OutlineDraft = {
  modules: { title: string; lessons: { title: string; summary: string; minutes: number }[] }[];
  /** Parts of the contract the specification call reuses. */
  terminalPerformances: string[];
  exclusions: string[];
  learnerAssumptions: string[];
  throughline: { premise: string; runningExample: string; vocabulary: string[] };
};

const outlineSchema = z.object({
  modules: z.array(
    z.object({
      title: z.string().min(1),
      lessons: z.array(
        z.object({
          title: z.string().min(1),
          summary: z.string().min(1),
          // Models return real numbers ("45") and occasionally "45.5";
          // rounding here beats failing a whole outline over it.
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
  }),
});

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

function describeBounds(depth: string): string {
  const b = depthBounds(depth);
  return `${b.minModules}–${b.maxModules} Modules and ${b.minLessons}–${b.maxLessons} Lessons in total`;
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

/**
 * Step: draft the Outline (and the contract parts the specification needs).
 * Returns the raw draft; `buildOutline` is what checks Depth bounds and
 * assigns the stable ids.
 */
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
      course.background ? `Background (skip fundamentals this names): ${course.background}` : "Background: none given.",
      `Depth: ${course.depth}. ${depthIntent(course.depth)} The outline must land inside ${describeBounds(course.depth)}.`,
      `Course language: write every title, summary and sentence in ${courseLanguageName(course.language)}.`,
      "",
      grounded,
      "",
      "Plan the course backwards from the goal:",
      "- terminalPerformances: 2-5 things the learner can demonstrably DO at the end, phrased as verbs.",
      "- modules: each covers one area; lessons are a small, named step that serves its module.",
      "- summaries: ONE sentence per lesson saying what the learner gets from it.",
      "- minutes: a realistic study estimate per lesson (5-90).",
      "- throughline: one running problem, project or scenario every lesson extends, plus the shared vocabulary.",
      "- exclusions: what this course deliberately leaves out.",
      "- learnerAssumptions: what you assume they already know, derived from the background.",
      "",
      "Return JSON only.",
    ].join("\n"),
  });

  if (!output) throw new DesignError("The model returned no outline.");
  return output;
}

/**
 * Step: validate a draft against the Depth bounds and freeze it into an
 * Outline with stable ids. Out-of-bounds drafts fail the design (retryable,
 * ticket #7) rather than silently trimming the Course. `newId` defaults to
 * nanoid; tests inject a counter so ids are predictable.
 */
export function buildOutline(
  draft: OutlineDraft,
  depth: string,
  newId: () => string = () => nanoid(),
): OutlineData {
  const bounds = depthBounds(depth);
  const moduleCount = draft.modules.length;
  const lessonCount = draft.modules.reduce((n, m) => n + m.lessons.length, 0);

  if (
    moduleCount < bounds.minModules ||
    moduleCount > bounds.maxModules ||
    lessonCount < bounds.minLessons ||
    lessonCount > bounds.maxLessons
  ) {
    throw new DesignError(
      `The drafted outline (${moduleCount} Modules, ${lessonCount} Lessons) misses the ${depth} bounds of ${describeBounds(depth)}.`,
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
      id: z.string(),
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

/**
 * Step: materialize the private Course specification against the frozen
 * Outline. The model references real Lesson ids and Source refs, so the
 * spec stays joinable to the Outline the learner can see; unknown
 * references are dropped, and a Lesson the model ignored fails the design.
 */
export async function designSpecification(
  model: LanguageModel,
  course: DesignCourse,
  outline: OutlineData,
  draft: OutlineDraft,
  sources: GatheredSource[],
): Promise<CourseSpecification> {
  const lessons = outline.modules.flatMap((m) =>
    m.lessons.map((l) => ({ ...l, module: m.title })),
  );

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
      "Terminal performances:", ...draft.terminalPerformances.map((p) => `- ${p}`),
      "Throughline:", JSON.stringify(draft.throughline),
      draft.exclusions.length ? `Exclusions: ${draft.exclusions.join("; ")}` : "",
      draft.learnerAssumptions.length ? `Learner assumptions: ${draft.learnerAssumptions.join("; ")}` : "",
      "",
      sources.length
        ? "Source refs you may cite (use exactly these): " +
          sources.map((s) => `${s.ref} (${s.url})`).join(", ")
        : "Grounding was off: return an empty evidence array.",
      "",
      "Produce:",
      "- learningGraph: one node per skill/concept (ids g1, g2, ...), each introduced by exactly one lessonId, with requires listing node ids that must come first.",
      "- alignment: for EVERY lesson id: the performance it teaches, the graph nodes it assumes, the module milestone it advances, and how its Exercise contributes to the final one.",
      "- finalExercise: the one task that evidences the goal, with concrete acceptance checks.",
      "- evidence: for each source ref you actually rely on, the claim it supports.",
      "",
      "Write in the course language. Return JSON only.",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  if (!output) throw new DesignError("The model returned no specification.");

  const lessonIds = new Set(lessons.map((l) => l.id));
  const missing = lessons.filter((l) => !output.alignment.some((a) => a.lessonId === l.id));
  if (missing.length > 0) {
    throw new DesignError(
      `The specification skipped ${missing.length} Lesson(s): ${missing.map((l) => l.title).join(", ")}.`,
    );
  }

  const sourceRefs = new Set(sources.map((s) => s.ref));
  const nodeIds = new Set(output.learningGraph.map((n) => n.id));

  return {
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
    learningGraph: output.learningGraph
      .filter((n) => lessonIds.has(n.lessonId))
      .map((n) => ({
        ...n,
        requires: n.requires.filter((r) => nodeIds.has(r)),
      })),
    alignment: output.alignment.filter((a) => lessonIds.has(a.lessonId)),
    finalExercise: output.finalExercise,
    evidence: output.evidence.filter((e) => sourceRefs.has(e.sourceRef)),
  };
}
