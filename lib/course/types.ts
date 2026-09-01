/**
 * The data shapes Course design produces. Plain JSON on purpose: the Outline
 * is stored as a versioned JSON document and the specification as one JSON
 * column, and Workflow steps pass these across process boundaries, so every
 * field must survive JSON round-trips (no Dates, no Maps).
 */

/**
 * The visible Outline: Module and Lesson titles with short summaries.
 * Ids are stable nanoid strings assigned at design time; Lesson numbers are
 * derived from position and never stored. Summaries are one sentence.
 */
export type OutlineLesson = {
  id: string;
  /** Position within its Module, 1-based. */
  ordinal: number;
  title: string;
  summary: string;
  /** Rough minutes the Lesson takes; an estimate the interface may show. */
  minutes: number;
};

export type OutlineModule = {
  id: string;
  /** Position within the Course, 1-based. */
  ordinal: number;
  /** The roman numeral the interface renders, derived from `ordinal`. */
  numeral: string;
  title: string;
  lessons: OutlineLesson[];
};

export type OutlineData = {
  modules: OutlineModule[];
};

/**
 * The private Course specification. It links the Goal, the Outline's
 * Lessons, the Exercises, and the Sources before any Lesson prose exists
 * (docs/research/cohesive-course-generation.md). A Learner never sees or
 * edits it. Lesson and source references use the stable ids of the Outline
 * rows and the Source rows, so the spec stays joinable to what the
 * Learner can see.
 */
/**
 * A demand the Learner accepted from a Change plan, pinned to one Lesson
 * and carried in the specification so generation honors it. Pre-generation
 * there is no prose or Exercise to rewrite, so the demand is an
 * instruction the generator carries out (#13).
 */
export type LessonAdjustment = {
  lessonId: string;
  /** What the Lesson's prose must do that it otherwise would not. */
  prose?: string;
  /** The Exercise, specified exactly. */
  exercise?: { task: string; check: string };
};

export type CourseSpecification = {
  /** The Course contract: what the Course promises and what it skips. */
  contract: {
    topic: string;
    goal: string;
    background: string;
    /** "reach" | "working" | "mastery" */
    depth: string;
    /** BCP-47-ish code from the fixed set at creation. */
    language: string;
    /** What the Learner will demonstrably do at the end of the Course. */
    terminalPerformances: string[];
    /** What this Course deliberately leaves out. */
    exclusions: string[];
    /** What the Learner is assumed to know already, derived from Background. */
    learnerAssumptions: string[];
  };
  /** The one running problem or project every Lesson extends. */
  throughline: {
    premise: string;
    runningExample: string;
    vocabulary: string[];
  };
  /**
   * Skills and concepts, with prerequisite links between them. Each node is
   * introduced by exactly one Lesson; the links are what audits check when
   * Lessons are written (later tickets).
   */
  learningGraph: {
    id: string;
    /** A capability, phrased as something the Learner can do. */
    skill: string;
    /** Ids of nodes that must come before this one. */
    requires: string[];
    /** The Outline Lesson that introduces this node. */
    lessonId: string;
  }[];
  /**
   * For every Lesson: the performance it teaches, the graph nodes it
   * assumes, the Module milestone it advances, and how its Exercise moves
   * the Learner toward the final one.
   */
  alignment: {
    lessonId: string;
    performance: string;
    prerequisiteNodes: string[];
    moduleMilestone: string;
    exerciseContribution: string;
  }[];
  /** The final Exercise: evidence of the Goal, combining the earlier ones. */
  finalExercise: {
    task: string;
    acceptanceChecks: string[];
  };
  /**
   * The Learner's accepted content demands, per Lesson (#13). Set when an
   * applied Change plan demanded prose or an Exercise before generation;
   * carried through reconciliation, honored by generation.
   */
  adjustments?: LessonAdjustment[];
  /**
   * Evidence ledger: which Source supports which claims. Empty when
   * Grounding was off.
   */
  evidence: {
    /** The Source row's stable `ref`. */
    sourceRef: string;
    supports: string;
  }[];
};

/** A Source as design produces it, before it becomes a row. */
export type GatheredSource = {
  /** Stable within one design run, e.g. "s1". */
  ref: string;
  title: string;
  url: string;
  /** ISO timestamp of the fetch. */
  fetchedAt: string;
  excerpt: string;
};

/**
 * The documented Course states, in the order they occur. "failed" can be
 * entered from "designing" (ticket #3) and later from generation; retry
 * (ticket #7) returns a failed Course to "designing".
 */
export const COURSE_STATUSES = [
  "designing",
  "awaiting-outline-approval",
  "generating",
  "reviewing",
  "ready",
  "failed",
] as const;

export type CourseStatus = (typeof COURSE_STATUSES)[number];

/** One Design-step outcome the Workflow can carry between steps. */
export type DesignOutcome = {
  outline: OutlineData;
  specification: CourseSpecification;
  sources: GatheredSource[];
};
