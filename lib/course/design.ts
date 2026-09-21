import type { LanguageModel } from "ai";
import { nanoid } from "nanoid";
import { z } from "zod";
import { designProviderOptions, groundingProviderOptions } from "@/lib/model";
import { depthBounds, depthTargetShape, type CourseInput, type DepthId } from "./limits";
import { languageName as courseLanguageName } from "./prompt-blocks";
import {
  outlineLessonsWithModule,
  sharedSpecificationSchema,
  moduleAlignmentSchema,
  validateSpecification,
} from "./specification";
import { generateStructuredStage } from "./structured-generation";
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
    const { output } = await generateStructuredStage({
      stage: "source-excerpts",
      model,
      providerOptions: groundingProviderOptions(),
      schema: excerptsSchema,
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
    result.set(
      page.url,
      chosen.has(page.url) && (!picked || page.content.includes(picked)) ? picked : fallback(page),
    );
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
  for (const page of pages) validateFetchedPage(page);
  const excerpts = await selectExcerpts(excerptModel, course, pages);
  return pages.map((page) => ({
    ref: newRef(),
    title: page.title,
    url: page.url,
    fetchedAt: page.fetchedAt,
    excerpt: excerpts.get(page.url) ?? "",
  }));
}

function validateFetchedPage(page: FetchedPage): void {
  let url: URL;
  try {
    url = new URL(page.url);
  } catch {
    throw new DesignError(`Source "${page.title}" has an invalid URL.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new DesignError(`Source "${page.title}" must use an HTTP or HTTPS URL.`);
  }
  const fetchedAt = new Date(page.fetchedAt);
  if (Number.isNaN(fetchedAt.getTime()) || fetchedAt.toISOString() !== page.fetchedAt) {
    throw new DesignError(`Source "${page.title}" has an invalid fetched time.`);
  }
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
      title: z.string().trim().min(1),
      lessons: z.array(
        z.object({
          title: z.string().trim().min(1),
          summary: z.string().trim().min(1).max(200),
          // Models sometimes return fractional minutes; rounding beats failing the outline.
          minutes: z.number().min(5).max(90),
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

function describeExactCounts(depth: string): string {
  const exact = depthTargetShape(depth);
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

  const { output } = await generateStructuredStage({
    stage: "outline-draft",
    model,
    providerOptions: designProviderOptions("low"),
    schema: outlineSchema,
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
      "- summaries: one short sentence per lesson, under 200 characters, saying what the learner gets from it when practical.",
      "- minutes: a realistic study estimate per lesson (5-90).",
      "- throughline: one running problem, project or scenario every lesson extends, plus the shared vocabulary.",
      "- throughline.exampleContract: describe what stays the same in the running example across Lessons.",
      "  Use two labeled parts: Fixed: <concrete names, artifacts, roles, and boundaries>; Decide later: <choices the Lessons will make>.",
      "  Pin a value only when it truly applies everywhere within its stated scope, such as an established design breakpoint.",
      "  Do not preselect the answer to the Goal. If the Course designs a policy, leave its settings to the Lessons and state which resources may need different settings.",
      "  Keep the contract concise. Use an empty string only when the Topic has no cumulative example.",
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

  const normalizedModuleTitles = draft.modules.map((module) => module.title.trim().toLowerCase());
  if (normalizedModuleTitles.some((title) => !title)) {
    throw new DesignError("Every Module needs a title.");
  }
  if (new Set(normalizedModuleTitles).size !== normalizedModuleTitles.length) {
    throw new DesignError("Every Module needs a distinct title.");
  }

  const lessons = draft.modules.flatMap((module) => module.lessons);
  const normalizedLessonTitles = lessons.map((lesson) => lesson.title.trim().toLowerCase());
  if (normalizedLessonTitles.some((title) => !title)) {
    throw new DesignError("Every Lesson needs a title.");
  }
  if (new Set(normalizedLessonTitles).size !== normalizedLessonTitles.length) {
    throw new DesignError("Every Lesson needs a distinct title.");
  }
  const invalidMinutes = lessons.find(
    (lesson) => !Number.isFinite(lesson.minutes) || lesson.minutes < 5 || lesson.minutes > 90,
  );
  if (invalidMinutes) {
    throw new DesignError(`Lesson "${invalidMinutes.title}" needs a 5 to 90 minute estimate.`);
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

export type SharedSpecification = z.infer<typeof sharedSpecificationSchema>;
export type ModuleAlignment = z.infer<typeof moduleAlignmentSchema>["alignment"];

export async function designSharedSpecification(
  model: LanguageModel,
  course: DesignCourse,
  outline: OutlineData,
  draft: OutlineDraft,
  sources: GatheredSource[],
): Promise<SharedSpecification> {
  const lessons = outlineLessonsWithModule(outline);
  const { output } = await generateStructuredStage({
    stage: "course-specification",
    model,
    providerOptions: designProviderOptions(),
    schema: sharedSpecificationSchema,
    prompt: [
      "Design the shared decisions for Mikasa's private Course specification.",
      `Topic: ${course.topic}`,
      `Goal: ${course.goal}`,
      course.background ? `Background: ${course.background}` : "Background: none given.",
      `Depth: ${course.depth} (${depthIntent(course.depth)}).`,
      `Course language: write every phrase in ${courseLanguageName(course.language)}.`,
      "The Outline is frozen. Use exactly these Module and Lesson ids:",
      ...outline.modules.flatMap((module) => [
        `Module ${module.id}: ${module.title}`,
        ...module.lessons.map((lesson) => `- ${lesson.id}: ${lesson.title} — ${lesson.summary}`),
      ]),
      "Terminal performances:",
      ...draft.terminalPerformances.map((performance) => `- ${performance}`),
      `Throughline: ${JSON.stringify(draft.throughline)}`,
      "The running example contract fixes shared identity and scope. Do not turn a choice marked Decide later into one value for every part of the example.",
      draft.exclusions.length ? `Exclusions: ${draft.exclusions.join("; ")}` : "",
      draft.learnerAssumptions.length
        ? `Learner assumptions: ${draft.learnerAssumptions.join("; ")}`
        : "",
      sources.length
        ? "Source refs you may cite: " +
          sources.map((source) => `${source.ref} (${source.url})`).join(", ")
        : "Grounding was off: return an empty evidence array.",
      "Produce learningGraph with unique g1, g2, ... ids. Each node belongs to one listed Lesson and may require only nodes introduced at the same or an earlier Lesson.",
      "Produce finalExercise: one task that evidences the Goal, with concrete acceptance checks.",
      "Produce evidence for each Source ref you rely on.",
      "Produce modules: exactly one entry per Module id in Outline order. Each entry fixes that Module's milestone and the shared running example at its start and end. The exampleEnd of one Module must exactly equal the exampleStart of the next. Use empty strings throughout when there is no cumulative example.",
      "Do not produce Lesson alignment here. Write in the Course language. Return JSON only.",
    ]
      .filter(Boolean)
      .join("\n"),
  });
  if (!output) throw new DesignError("The model returned no shared specification.");
  if (
    output.modules.length !== outline.modules.length ||
    output.modules.some((module, index) => module.moduleId !== outline.modules[index].id)
  ) {
    throw new DesignError("The shared specification must include every Module in Outline order.");
  }
  for (let index = 1; index < output.modules.length; index++) {
    if (output.modules[index].exampleStart !== output.modules[index - 1].exampleEnd) {
      throw new DesignError(
        `The running example changes between Modules ${index} and ${index + 1}.`,
      );
    }
  }
  const lessonIds = new Set(lessons.map((lesson) => lesson.id));
  const positions = new Map(lessons.map((lesson, index) => [lesson.id, index]));
  const graphIds = new Set<string>();
  for (const node of output.learningGraph) {
    if (graphIds.has(node.id) || !lessonIds.has(node.lessonId)) {
      throw new DesignError(`The learning graph has an invalid node ${node.id}.`);
    }
    graphIds.add(node.id);
  }
  for (const node of output.learningGraph) {
    if (
      new Set(node.requires).size !== node.requires.length ||
      node.requires.some((id) => {
        const prerequisite = output.learningGraph.find((candidate) => candidate.id === id);
        return (
          !prerequisite ||
          (positions.get(prerequisite.lessonId) ?? Infinity) > (positions.get(node.lessonId) ?? -1)
        );
      })
    ) {
      throw new DesignError(`The learning graph has invalid prerequisites for ${node.id}.`);
    }
  }
  const sourceRefs = new Set(sources.map((source) => source.ref));
  if (output.evidence.some((item) => !sourceRefs.has(item.sourceRef))) {
    throw new DesignError("The shared specification cites a Source the Course does not have.");
  }
  return output;
}

export async function designModuleAlignment(
  model: LanguageModel,
  course: DesignCourse,
  outline: OutlineData,
  module: OutlineModule,
  shared: SharedSpecification,
  sources: GatheredSource[],
): Promise<ModuleAlignment> {
  const boundary = shared.modules.find((item) => item.moduleId === module.id);
  if (!boundary) throw new DesignError(`The shared specification skipped Module ${module.id}.`);
  const { output } = await generateStructuredStage({
    stage: "course-specification-module",
    model,
    providerOptions: designProviderOptions(),
    schema: moduleAlignmentSchema,
    prompt: [
      "Write Lesson alignment for one Module of Mikasa's private Course specification.",
      `Topic: ${course.topic}`,
      `Goal: ${course.goal}`,
      `Course language: write every phrase in ${courseLanguageName(course.language)}.`,
      `Module ${module.id}: ${module.title}`,
      "Use exactly these Lesson ids, in this order:",
      ...module.lessons.map((lesson) => `- ${lesson.id}: ${lesson.title} — ${lesson.summary}`),
      `Module milestone (copy exactly): ${boundary.milestone}`,
      `Running example before this Module (copy exactly): ${boundary.exampleStart}`,
      `Running example after this Module (copy exactly): ${boundary.exampleEnd}`,
      `Final Exercise: ${JSON.stringify(shared.finalExercise)}`,
      `Learning graph (reference only these ids): ${JSON.stringify(shared.learningGraph)}`,
      sources.length
        ? `Available Source refs: ${sources.map((source) => source.ref).join(", ")}`
        : "There are no Sources. Use empty sourceRefs arrays.",
      "For every Lesson produce one alignment entry: a distinct performance, prerequisiteNodes introduced by this or an earlier Lesson, how its Exercise contributes to the final Exercise, exampleStart, exampleEnd, and sourceRefs.",
      "Copy the Module milestone into every moduleMilestone. The first exampleStart and last exampleEnd must match the fixed Module boundaries. Each Lesson's exampleEnd must exactly equal the next Lesson's exampleStart. Use empty strings if there is no cumulative example.",
      "Return JSON only.",
    ].join("\n"),
  });
  if (!output) throw new DesignError(`The model returned no alignment for Module ${module.title}.`);
  const alignment = output.alignment;
  if (
    alignment.length !== module.lessons.length ||
    alignment.some((entry, index) => entry.lessonId !== module.lessons[index].id)
  ) {
    throw new DesignError(`Module ${module.title} must align every Lesson in Outline order.`);
  }
  if (
    alignment.some((entry) => entry.moduleMilestone !== boundary.milestone) ||
    alignment[0].exampleStart !== boundary.exampleStart ||
    alignment[alignment.length - 1].exampleEnd !== boundary.exampleEnd ||
    alignment.some(
      (entry, index) => index > 0 && entry.exampleStart !== alignment[index - 1].exampleEnd,
    )
  ) {
    throw new DesignError(
      `Module ${module.title} does not follow its fixed milestone or running example.`,
    );
  }
  const graph = new Map(shared.learningGraph.map((node) => [node.id, node]));
  const positions = new Map(
    outline.modules.flatMap((item) => item.lessons).map((lesson, index) => [lesson.id, index]),
  );
  const sourceRefs = new Set(sources.map((source) => source.ref));
  for (const entry of alignment) {
    if (
      new Set(entry.prerequisiteNodes).size !== entry.prerequisiteNodes.length ||
      new Set(entry.sourceRefs).size !== entry.sourceRefs.length ||
      entry.sourceRefs.some((ref) => !sourceRefs.has(ref)) ||
      entry.prerequisiteNodes.some((id) => {
        const node = graph.get(id);
        return (
          !node ||
          (positions.get(node.lessonId) ?? Infinity) > (positions.get(entry.lessonId) ?? -1)
        );
      })
    ) {
      throw new DesignError(
        `Lesson ${entry.lessonId} has invalid Source or learning graph references.`,
      );
    }
  }
  return alignment;
}

export function assembleSpecification(
  course: DesignCourse,
  outline: OutlineData,
  draft: OutlineDraft,
  sources: GatheredSource[],
  shared: SharedSpecification,
  modules: ModuleAlignment[],
): CourseSpecification {
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
    learningGraph: shared.learningGraph,
    alignment: modules.flat(),
    finalExercise: shared.finalExercise,
    evidence: shared.evidence,
  };
  try {
    validateSpecification(candidate, outline, new Set(sources.map((source) => source.ref)));
  } catch (error) {
    throw new DesignError(
      error instanceof Error ? error.message : "The specification did not validate.",
    );
  }
  return candidate;
}

export async function designSpecification(
  model: LanguageModel,
  course: DesignCourse,
  outline: OutlineData,
  draft: OutlineDraft,
  sources: GatheredSource[],
): Promise<CourseSpecification> {
  const shared = await designSharedSpecification(model, course, outline, draft, sources);
  const modules: ModuleAlignment[] = [];
  for (const outlineModule of outline.modules) {
    modules.push(
      await designModuleAlignment(model, course, outline, outlineModule, shared, sources),
    );
  }
  return assembleSpecification(course, outline, draft, sources, shared, modules);
}
