export const TOPIC_MAX_LENGTH = 200;
export const GOAL_MAX_LENGTH = 500;
export const BACKGROUND_MAX_LENGTH = 2000;

// The Learner's choice is immutable after creation: no update path exists for it.
export const COURSE_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
] as const;

export type CourseLanguageCode = (typeof COURSE_LANGUAGES)[number]["code"];

export const COURSE_LANGUAGE_CODES = COURSE_LANGUAGES.map((l) => l.code);

export function courseLanguageLabel(code: string): string {
  return COURSE_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

export const DEPTH_CHOICES = [
  {
    id: "reach",
    title: "Just enough to reach the Goal",
    detail: "The shortest line from where you are to the outcome. Nothing beside the point.",
  },
  {
    id: "working",
    title: "Solid working knowledge",
    detail:
      "The Goal, plus the surrounding ground you need to keep using this without a reference open.",
  },
  {
    id: "mastery",
    title: "Deep mastery",
    detail: "Past the Goal into the edges: the internals, the failure modes, the arguments.",
  },
] as const;

export type DepthId = (typeof DEPTH_CHOICES)[number]["id"];

export const DEPTH_IDS = DEPTH_CHOICES.map((d) => d.id);

export const DEPTH_BOUNDS: Record<
  DepthId,
  {
    minModules: number;
    maxModules: number;
    minLessonsPerModule: number;
    maxLessonsPerModule: number;
  }
> = {
  reach: { minModules: 3, maxModules: 4, minLessonsPerModule: 2, maxLessonsPerModule: 3 },
  working: { minModules: 5, maxModules: 7, minLessonsPerModule: 3, maxLessonsPerModule: 4 },
  mastery: { minModules: 8, maxModules: 10, minLessonsPerModule: 4, maxLessonsPerModule: 5 },
};

export function depthBounds(depth: string) {
  return DEPTH_BOUNDS[depth as DepthId];
}

export type CourseInput = {
  topic: string;
  goal: string;
  background: string;
  language: string;
  depth: string;
  grounding: boolean;
};

export type CourseInputErrors = Partial<Record<keyof CourseInput | "form", string>>;

const trim = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export function validateCourseInput(
  raw: Partial<Record<keyof CourseInput, unknown>>,
): { ok: true; value: CourseInput } | { ok: false; errors: CourseInputErrors } {
  const errors: CourseInputErrors = {};

  const topic = trim(raw.topic);
  if (!topic) errors.topic = "Name the Topic the Course teaches.";
  else if (topic.length > TOPIC_MAX_LENGTH)
    errors.topic = `Keep the Topic under ${TOPIC_MAX_LENGTH} characters (currently ${topic.length}).`;

  const goal = trim(raw.goal);
  if (!goal) errors.goal = "Say what you want to be able to do.";
  else if (goal.length > GOAL_MAX_LENGTH)
    errors.goal = `Keep the Goal under ${GOAL_MAX_LENGTH} characters (currently ${goal.length}).`;

  const background = trim(raw.background);
  if (background.length > BACKGROUND_MAX_LENGTH)
    errors.background = `Keep the Background under ${BACKGROUND_MAX_LENGTH} characters (currently ${background.length}).`;

  const language = trim(raw.language);
  if (!COURSE_LANGUAGE_CODES.includes(language as CourseLanguageCode))
    errors.language = "Choose one of the supported Course Languages.";

  const depth = trim(raw.depth);
  if (!DEPTH_IDS.includes(depth as DepthId)) errors.depth = "Choose a Depth.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      topic,
      goal,
      background,
      language,
      depth,
      grounding: raw.grounding !== false,
    },
  };
}
