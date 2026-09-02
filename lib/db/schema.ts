/**
 * The one Drizzle schema (ADR 0004).
 *
 * The auth tables follow Better Auth's core shape with `usePlural: true`,
 * so the adapter resolves `users`, `sessions`, `accounts` and
 * `verifications` by name. Better Auth supplies every id, so the columns
 * are text without database defaults.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import type { CourseSpecification, OutlineData } from "../course/types";
import type { OutlineDraft } from "../course/design";
import type { ContentBlock } from "../course/content";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    /** Where the identity came from, e.g. "https://accounts.google.com". */
    issuer: text("issuer").notNull(),
    /** The id the provider knows this Learner by, e.g. Google's `sub`. */
    accountId: text("account_id").notNull(),
    /** e.g. "google". One row per provider per Learner. */
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    /** Core schema column; unused, because there is no email and password path. */
    password: text("password"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [index("accounts_issuer_account_id_idx").on(table.issuer, table.accountId)],
);

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

/**
 * A private curriculum for one Topic and Goal, owned by one Learner.
 * Modules and Lessons arrive with generation (later tickets); everything
 * fixed at creation time is stored here.
 *
 * Status follows the documented design states: "designing" while the
 * Workflow builds the specification and Outline, "awaiting-outline-approval"
 * at the Outline checkpoint, "generating", "reviewing" and "ready" once
 * Lesson work exists (later tickets), and "failed" when design errored.
 */
export const courses = pgTable(
  "courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    goal: text("goal").notNull(),
    /** What the Learner already knows. Optional at creation. */
    background: text("background").notNull().default(""),
    /** The Course Language; does not change after creation. */
    language: text("language").notNull().default("en"),
    /** Which Depth was chosen: "reach", "working" or "mastery". */
    depth: text("depth").notNull(),
    grounding: boolean("grounding").notNull().default(true),
    /** One of the documented states; see the table's doc comment. */
    status: text("status").notNull().default("designing"),
    /**
     * When every Lesson of the current published revision was marked done
     * (ticket #8). Cleared again the moment any Lesson is unmarked.
     */
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("courses_owner_id_idx").on(table.ownerId)],
);

/**
 * The private Course specification: the structured plan that links the Goal,
 * Outline, Lessons, Exercises and Sources. Never rendered to the Learner.
 * One row per Outline version. A staged Course revision must never replace
 * the specification the current published Course revision uses.
 */
export const courseSpecs = pgTable(
  "course_specs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    spec: jsonb("spec").$type<CourseSpecification>().notNull(),
    /**
     * The Outline version this specification was last aligned to. Every
     * Outline change appends a version, so the spec reads as stale whenever
     * this is lower than the current Outline version; approval reconciles
     * it and moves it forward (ticket #4).
     */
    outlineVersion: integer("outline_version").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("course_specs_course_outline_key").on(table.courseId, table.outlineVersion),
    index("course_specs_course_id_idx").on(table.courseId),
  ],
);

/**
 * One durable generation run over an approved Outline version (started at
 * approval, ticket #4; the Lesson work itself is ticket #5). The unique
 * (course, version) pair is what makes a double approval unable to start a
 * second run: the second insert simply loses.
 */
export const generationRuns = pgTable(
  "generation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    outlineVersion: integer("outline_version").notNull(),
    /** "running" | "succeeded" | "failed" */
    status: text("status").notNull().default("running"),
    /** Vercel Workflow run id, when started through Workflow. */
    workflowRunId: text("workflow_run_id"),
    /** The step the run is currently in, e.g. "lessons". */
    currentStep: text("current_step").notNull().default("queued"),
    /**
     * The Tutor search index's state for this run's revision:
     * "pending" | "done" | "failed". A failure never invalidates the
     * published Course; it is recorded here and repaired separately.
     */
    fragmentsStatus: text("fragments_status").notNull().default("pending"),
    /** Why the fragment embedding failed; null while pending or done. */
    fragmentsError: text("fragments_error"),
    /** Why the run failed; null while it is running or succeeded. */
    error: text("error"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("generation_runs_course_id_version_key").on(
      table.courseId,
      table.outlineVersion,
    ),
    index("generation_runs_course_id_idx").on(table.courseId),
  ],
);

/**
 * One version of the visible Outline. A new version is written when design
 * runs again (retry) or when a later change plan is applied; the current
 * version is the highest `version` for the Course. Module and Lesson ids are
 * stable nanoid strings so later tickets (Tailor changes, Lesson generation,
 * completion) can reference them across versions.
 */
export const outlines = pgTable(
  "outlines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    data: jsonb("data").$type<OutlineData>().notNull(),
    /**
     * The design draft the Outline was built from (terminal performances,
     * throughline, exclusions). The specification step consumes it, so a
     * retry that resumes at the specification keeps the Outline's own
     * draft instead of drafting anew (ticket #7).
     */
    draft: jsonb("draft").$type<OutlineDraft | null>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("outlines_course_id_version_key").on(table.courseId, table.version)],
);

/**
 * An external reference gathered while Grounding was on. Shared across the
 * Course: Lessons and the Tutor cite these rows instead of fetching again.
 */
export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    /** Stable string id; the specification's evidence ledger references it. */
    ref: text("ref").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    /** When the page was fetched, so staleness is checkable. */
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
    /** The relevant passage, chosen for this Course's Topic and Goal. */
    excerpt: text("excerpt").notNull(),
  },
  (table) => [
    uniqueIndex("sources_course_id_url_key").on(table.courseId, table.url),
    uniqueIndex("sources_course_id_ref_key").on(table.courseId, table.ref),
  ],
);

/**
 * One durable design run over a Course. The course row carries the
 * Learner-visible status; this table carries the engine-level progress:
 * which step is current, the workflow run id, and the failure message if
 * the run failed. Retry (ticket #7) reads the failure from here.
 */
export const designRuns = pgTable(
  "design_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    /** "running" | "succeeded" | "failed" */
    status: text("status").notNull().default("running"),
    /** Vercel Workflow run id, when the run was started through Workflow. */
    workflowRunId: text("workflow_run_id"),
    /** The step the run is currently in, e.g. "outline". */
    currentStep: text("current_step").notNull().default("sources"),
    /** Why the run failed; null while it is running or succeeded. */
    error: text("error"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("design_runs_course_id_idx").on(table.courseId)],
);

export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type Outline = typeof outlines.$inferSelect;
export type SourceRow = typeof sources.$inferSelect;
export type DesignRun = typeof designRuns.$inferSelect;
export type CourseSpecRow = typeof courseSpecs.$inferSelect;
export type GenerationRun = typeof generationRuns.$inferSelect;

/**
 * One generated Lesson's content: the candidate that review (ticket #6)
 * judges and publication turns into the readable Course. Keyed to the
 * stable Outline lesson id plus the Outline version it was written for,
 * so a staged revision (ticket #14) writes new rows instead of touching
 * what the Learner may be reading. No Learner-facing read exists for rows
 * whose Outline version is not the published one.
 */
export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    outlineVersion: integer("outline_version").notNull(),
    /** The stable Outline Lesson id (lib/course/structure identity rules). */
    lessonRef: text("lesson_ref").notNull(),
    title: text("title").notNull(),
    body: jsonb("body").$type<ContentBlock[]>().notNull(),
    workedExample: jsonb("worked_example").$type<ContentBlock[]>().notNull(),
    recallPrompt: text("recall_prompt").notNull(),
    selfExplanationPrompt: text("self_explanation_prompt").notNull(),
    exercise: jsonb("exercise").$type<{ task: string; check: string }>().notNull(),
    bridge: text("bridge").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("lessons_course_version_ref_key").on(
      table.courseId,
      table.outlineVersion,
      table.lessonRef,
    ),
    index("lessons_course_id_idx").on(table.courseId),
  ],
);

/**
 * One review pass over a complete candidate (ticket #6). Findings are
 * kept per round so the two-round cap is checkable from the data, and a
 * failed review keeps its message here.
 */
export const reviewRuns = pgTable(
  "review_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    outlineVersion: integer("outline_version").notNull(),
    /** "running" | "succeeded" | "failed" */
    status: text("status").notNull().default("running"),
    /** 0-based; corrections happen between rounds. */
    round: integer("round").notNull().default(0),
    /** Why the review failed; null while running or succeeded. */
    error: text("error"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("review_runs_course_id_idx").on(table.courseId)],
);

/**
 * One finding from one review round. `lessonRef` is null for findings
 * about the Course as a whole; corrections (at most two rounds) target
 * exactly the Lessons findings point at.
 */
export const reviewFindings = pgTable(
  "review_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewRunId: uuid("review_run_id")
      .notNull()
      .references(() => reviewRuns.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    outlineVersion: integer("outline_version").notNull(),
    round: integer("round").notNull(),
    /** "structural" | "factual" | "learning-design" */
    kind: text("kind").notNull(),
    lessonRef: text("lesson_ref"),
    detail: text("detail").notNull(),
    /** What the correction should do about it. */
    correction: text("correction").notNull(),
    /** "open" | "corrected" | "obsolete" */
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("review_findings_run_id_idx").on(table.reviewRunId)],
);

/**
 * A published Course revision: immutable by construction (its Lessons are
 * the rows keyed to `outlineVersion`), with the highest revision number
 * being the one the Learner reads, the Tutor retrieves against, and the
 * Tailor changes. Publication is one transaction: insert the row, set the
 * Course "ready" — there is no moment where a partial Course is readable.
 */
export const revisions = pgTable(
  "revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    outlineVersion: integer("outline_version").notNull(),
    publishedAt: timestamp("published_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("revisions_course_id_number_key").on(table.courseId, table.revisionNumber),
    index("revisions_course_id_idx").on(table.courseId),
  ],
);

/**
 * One Lesson's Exercise, done. Keyed by the stable Outline lesson id, so
 * Completion follows a Lesson through renames and moves (tickets #14/#15
 * decide what survives a split or a merge). Belongs to the owning
 * Learner by construction: every write goes through an owned Course
 * lookup, and the reading path is the same one.
 */
export const completions = pgTable(
  "completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    /** The stable Outline Lesson id of the current published revision. */
    lessonRef: text("lesson_ref").notNull(),
    doneAt: timestamp("done_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("completions_course_lesson_key").on(table.courseId, table.lessonRef),
    index("completions_course_id_idx").on(table.courseId),
  ],
);

export type ReviewRun = typeof reviewRuns.$inferSelect;
export type ReviewFindingRow = typeof reviewFindings.$inferSelect;
export type Revision = typeof revisions.$inferSelect;
export type LessonRow = typeof lessons.$inferSelect;
export type Completion = typeof completions.$inferSelect;

/**
 * One Sandbox verification pass over a candidate's executable claims
 * (ticket #9). The evidence — commands, their output, the files present —
 * is kept verbatim: review reads it, and a failed pass blocks publication
 * until a later round's pass passes. Keyed per round, so a Workflow retry
 * reuses the row instead of re-running the Sandbox.
 */
export const codeVerifications = pgTable(
  "code_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    outlineVersion: integer("outline_version").notNull(),
    /** The review round this pass belongs to. */
    round: integer("round").notNull().default(0),
    /** "passed" | "failed" */
    status: text("status").notNull(),
    evidence: jsonb("evidence").$type<unknown>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("code_verifications_course_version_round_key").on(
      table.courseId,
      table.outlineVersion,
      table.round,
    ),
    index("code_verifications_course_id_idx").on(table.courseId),
  ],
);

export type CodeVerification = typeof codeVerifications.$inferSelect;

/**
 * One Tutor conversation, one per Lesson of a Course (ticket #10). The
 * server owns the canonical thread; the client only ever names the
 * Conversation it is continuing (Course + Lesson identity).
 */
export const tutorConversations = pgTable(
  "tutor_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    /** The stable Outline Lesson id the conversation is about. */
    lessonRef: text("lesson_ref").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tutor_conversations_course_lesson_key").on(
      table.courseId,
      table.lessonRef,
    ),
    index("tutor_conversations_course_id_idx").on(table.courseId),
  ],
);

/**
 * The Tutor's canonical history (ticket #10). Only completed turns live
 * here: a Learner message and the Tutor's answer are written together,
 * after the Tutor's stream has finished cleanly. An interrupted or failed
 * stream leaves nothing behind, so a retry starts a clean turn.
 */
export const tutorMessages = pgTable(
  "tutor_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => tutorConversations.id, { onDelete: "cascade" }),
    /** Monotonic within the conversation; the Learner's message is even. */
    seq: integer("seq").notNull(),
    /** "learner" | "tutor" */
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tutor_messages_conversation_seq_key").on(
      table.conversationId,
      table.seq,
    ),
    index("tutor_messages_conversation_id_idx").on(table.conversationId),
  ],
);

export type TutorConversation = typeof tutorConversations.$inferSelect;
export type TutorMessage = typeof tutorMessages.$inferSelect;

/**
 * A searchable fragment of a published Lesson (ticket #11): one block of
 * the Lesson's content, embedded at 768 dimensions when the revision was
 * published. Retrieval is exact pgvector cosine search over the owned
 * Course's fragments — no index, perfect recall, Course-sized tables.
 */
export const lessonFragments = pgTable(
  "lesson_fragments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    /** The stable Outline Lesson id the fragment came from. */
    lessonRef: text("lesson_ref").notNull(),
    /** Position of the fragment within its Lesson. */
    ordinal: integer("ordinal").notNull(),
    /** The fragment's text, as the Tutor reads it. */
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 768 }).notNull(),
  },
  (table) => [
    index("lesson_fragments_course_id_idx").on(table.courseId),
    index("lesson_fragments_course_lesson_idx").on(table.courseId, table.lessonRef),
  ],
);

export type LessonFragment = typeof lessonFragments.$inferSelect;

/**
 * The Tailor's conversation (ticket #12): one per Course, separate from
 * the Tutor's per-Lesson threads. The Tailor talks about reshaping the
 * Course; the Tutor talks about understanding it.
 */
export const tailorConversations = pgTable(
  "tailor_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("tailor_conversations_course_id_key").on(table.courseId)],
);

/** The Tailor's canonical history. Only completed turns are stored. */
export const tailorMessages = pgTable(
  "tailor_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => tailorConversations.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    /** "learner" | "tailor" */
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tailor_messages_conversation_seq_key").on(
      table.conversationId,
      table.seq,
    ),
  ],
);

/**
 * A Change plan (ticket #12): the structured operations the Tailor
 * proposed in one turn, reviewed operation by operation, and applied
 * together or not at all (tickets #13/#14). `baseOutlineVersion` and
 * `baseRevisionNumber` pin the plan to the Course the Learner was
 * looking at; a later version or revision rejects the whole plan.
 */
export const changePlans = pgTable(
  "change_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    /** The Outline version the plan was drawn against. */
    baseOutlineVersion: integer("base_outline_version").notNull(),
    /** For a published Course: the revision it was drawn against. */
    baseRevisionNumber: integer("base_revision_number"),
    /** "proposed" | "applied" | "staged" | "published" | "failed" | "superseded" */
    status: text("status").notNull().default("proposed"),
    /** Set when the plan becomes a staged revision (#14): the Outline
        version the staged candidate is written against. */
    stagedOutlineVersion: integer("staged_outline_version"),
    /** Set when the revision publishes (#14): the revision number this
        plan produced — the one an undo must still be current against. */
    publishedRevisionNumber: integer("published_revision_number"),
    /** The Lesson and Module identities the accepted operations touch
        (#15): the overlap rule for undo reads these. */
    touchedLessons: jsonb("touched_lessons").$type<string[]>(),
    touchedModules: jsonb("touched_modules").$type<string[]>(),
    /** Lessons whose content the plan regenerated (#15): undo restores
        their pre-plan content from the base revision. */
    regeneratedLessons: jsonb("regenerated_lessons").$type<string[]>(),
    /** The Course's Completion state, taken the moment the revision
        published (#15): undo restores it for the touched identities. */
    completionSnapshot: jsonb("completion_snapshot").$type<
      { lessonRef: string; doneAt: string }[]
    >(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("change_plans_course_id_idx").on(table.courseId)],
);

/**
 * One operation of a Change plan. `payload` is the operation itself (an
 * OutlineOp, or a content change) as stored by the Tailor; `undo` is
 * filled at apply/publish time with what a later undo needs (#15).
 */
export const changeOperations = pgTable(
  "change_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => changePlans.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    /** "proposed" | "accepted" | "discarded" */
    status: text("status").notNull().default("proposed"),
    undo: jsonb("undo").$type<unknown>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("change_operations_plan_position_key").on(table.planId, table.position)],
);

export type TailorConversation = typeof tailorConversations.$inferSelect;
export type TailorMessage = typeof tailorMessages.$inferSelect;
export type ChangePlan = typeof changePlans.$inferSelect;
export type ChangeOperation = typeof changeOperations.$inferSelect;
