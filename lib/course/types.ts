// Plain JSON only: must survive JSON round-trips (no Dates, no Maps).
export type OutlineLesson = {
  id: string;
  ordinal: number;
  title: string;
  summary: string;
  minutes: number;
};

export type OutlineModule = {
  id: string;
  ordinal: number;
  numeral: string;
  title: string;
  lessons: OutlineLesson[];
};

export type OutlineData = {
  modules: OutlineModule[];
};

export type LessonAdjustment = {
  lessonId: string;
  prose?: string;
  exercise?: { task: string; check: string };
};

export type CourseSpecification = {
  contract: {
    topic: string;
    goal: string;
    background: string;
    depth: string;
    language: string;
    terminalPerformances: string[];
    exclusions: string[];
    learnerAssumptions: string[];
  };
  throughline: {
    premise: string;
    runningExample: string;
    vocabulary: string[];
  };
  learningGraph: {
    id: string;
    skill: string;
    requires: string[];
    lessonId: string;
  }[];
  alignment: {
    lessonId: string;
    performance: string;
    prerequisiteNodes: string[];
    moduleMilestone: string;
    exerciseContribution: string;
  }[];
  finalExercise: {
    task: string;
    acceptanceChecks: string[];
  };
  adjustments?: LessonAdjustment[];
  evidence: {
    sourceRef: string;
    supports: string;
  }[];
};

export type GatheredSource = {
  ref: string;
  title: string;
  url: string;
  fetchedAt: string;
  excerpt: string;
};

export const COURSE_STATUSES = [
  "designing",
  "awaiting-outline-approval",
  "generating",
  "reviewing",
  "ready",
  "failed",
] as const;

export type CourseStatus = (typeof COURSE_STATUSES)[number];

export type DesignOutcome = {
  outline: OutlineData;
  specification: CourseSpecification;
  sources: GatheredSource[];
};
