/**
 * The shared Course fixtures: an Outline built from a per-module lesson
 * count, a Specification derived from it, and the standard wash Lesson
 * content. Tests override spec fields they assert on.
 */
import type { CourseSpecification, OutlineData, OutlineLesson } from "@/lib/course/types";
import { parseLessonContent, type LessonContent } from "@/lib/course/content";

const WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight"];
const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const SUMMARIES = [
  "First.",
  "Second.",
  "Third.",
  "Fourth.",
  "Fifth.",
  "Sixth.",
  "Seventh.",
  "Eighth.",
];

/** `makeOutline([2, 1])` builds module I with l1, l2 and module II with l3. */
export function makeOutline(lessonsPerModule: number[]): OutlineData {
  let lessonNumber = 0;
  return {
    modules: lessonsPerModule.map((count, m) => ({
      id: `m${m + 1}`,
      ordinal: m + 1,
      numeral: NUMERALS[m],
      title: `Module ${WORDS[m]}`,
      lessons: Array.from({ length: count }, () => {
        lessonNumber += 1;
        return {
          id: `l${lessonNumber}`,
          ordinal: lessonNumber,
          title: `Lesson ${WORDS[lessonNumber - 1]}`,
          summary: SUMMARIES[lessonNumber - 1],
          minutes: 20,
        };
      }),
    })),
  };
}

export type SpecOverrides = {
  topic?: string;
  goal?: string;
  background?: string;
  terminalPerformances?: string[];
  learnerAssumptions?: string[];
  throughline?: CourseSpecification["throughline"];
  learningGraph?: CourseSpecification["learningGraph"];
  alignment?: (lesson: OutlineLesson) => CourseSpecification["alignment"][number];
  finalExercise?: CourseSpecification["finalExercise"];
  evidence?: CourseSpecification["evidence"];
};

export function makeSpec(outline: OutlineData, overrides: SpecOverrides = {}): CourseSpecification {
  return {
    contract: {
      topic: "window functions in SQL",
      goal: "query with confidence",
      background: "",
      depth: "reach",
      language: "en",
      terminalPerformances: ["Write window queries"],
      exclusions: [],
      learnerAssumptions: [],
      ...(overrides.topic !== undefined && { topic: overrides.topic }),
      ...(overrides.goal !== undefined && { goal: overrides.goal }),
      ...(overrides.background !== undefined && { background: overrides.background }),
      ...(overrides.terminalPerformances && {
        terminalPerformances: overrides.terminalPerformances,
      }),
      ...(overrides.learnerAssumptions && { learnerAssumptions: overrides.learnerAssumptions }),
    },
    throughline: overrides.throughline ?? {
      premise: "windows first",
      runningExample: "r",
      vocabulary: [],
    },
    learningGraph: overrides.learningGraph ?? [],
    alignment: outline.modules
      .flatMap((m) => m.lessons)
      .map(
        overrides.alignment ??
          ((l) => ({
            lessonId: l.id,
            performance: "does",
            prerequisiteNodes: [] as string[],
            moduleMilestone: "m",
            exerciseContribution: "c",
          })),
      ),
    finalExercise: overrides.finalExercise ?? { task: "t", acceptanceChecks: ["c"] },
    evidence: overrides.evidence ?? [],
  };
}

/** The wash Lesson shape shared by the Tailor and fragment suites. */
export function lessonContent(lessonId: string, title: string, text: string): LessonContent {
  return parseLessonContent(lessonId, title, {
    body: [{ kind: "p", text }],
    workedExample: [{ kind: "p", text: "The sky wash, again." }],
    recallPrompt: "Recall it.",
    selfExplanationPrompt: "Explain it.",
    exercise: { task: "Paint one.", check: "It holds." },
    bridge: "Next.",
  });
}
