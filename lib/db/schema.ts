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
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
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

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    goal: text("goal").notNull(),
    background: text("background").notNull().default(""),
    language: text("language").notNull().default("en"),
    depth: text("depth").notNull(),
    grounding: boolean("grounding").notNull().default(true),
    status: text("status").notNull().default("designing"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("courses_owner_id_idx").on(table.ownerId)],
);

export const courseSpecs = pgTable(
  "course_specs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    spec: jsonb("spec").$type<CourseSpecification>().notNull(),
    outlineVersion: integer("outline_version").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("course_specs_course_outline_key").on(table.courseId, table.outlineVersion),
    index("course_specs_course_id_idx").on(table.courseId),
  ],
);

/** The unique (course, version) pair is what stops a double approval from starting a second run. */
export const generationRuns = pgTable(
  "generation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    outlineVersion: integer("outline_version").notNull(),
    status: text("status").notNull().default("running"),
    workflowRunId: text("workflow_run_id"),
    currentStep: text("current_step").notNull().default("queued"),
    fragmentsStatus: text("fragments_status").notNull().default("pending"),
    fragmentsError: text("fragments_error"),
    error: text("error"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("generation_runs_course_id_version_key").on(table.courseId, table.outlineVersion),
    index("generation_runs_course_id_idx").on(table.courseId),
  ],
);

export const outlines = pgTable(
  "outlines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    data: jsonb("data").$type<OutlineData>().notNull(),
    draft: jsonb("draft").$type<OutlineDraft | null>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("outlines_course_id_version_key").on(table.courseId, table.version)],
);

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    ref: text("ref").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
    excerpt: text("excerpt").notNull(),
  },
  (table) => [
    uniqueIndex("sources_course_id_url_key").on(table.courseId, table.url),
    uniqueIndex("sources_course_id_ref_key").on(table.courseId, table.ref),
  ],
);

export const designRuns = pgTable(
  "design_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("running"),
    workflowRunId: text("workflow_run_id"),
    currentStep: text("current_step").notNull().default("sources"),
    error: text("error"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("design_runs_course_id_idx").on(table.courseId)],
);

export const designEvents = pgTable(
  "design_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => designRuns.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("design_events_course_id_idx").on(table.courseId),
    index("design_events_run_id_idx").on(table.runId),
  ],
);

export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type Outline = typeof outlines.$inferSelect;
export type SourceRow = typeof sources.$inferSelect;
export type DesignRun = typeof designRuns.$inferSelect;
export type DesignEvent = typeof designEvents.$inferSelect;
export type CourseSpecRow = typeof courseSpecs.$inferSelect;
export type GenerationRun = typeof generationRuns.$inferSelect;

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    outlineVersion: integer("outline_version").notNull(),
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

export const reviewRuns = pgTable(
  "review_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    outlineVersion: integer("outline_version").notNull(),
    status: text("status").notNull().default("running"),
    round: integer("round").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("review_runs_course_id_idx").on(table.courseId)],
);

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
    kind: text("kind").notNull(),
    lessonRef: text("lesson_ref"),
    detail: text("detail").notNull(),
    correction: text("correction").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("review_findings_run_id_idx").on(table.reviewRunId)],
);

/** Revisions are immutable; publication inserts the row and flips the Course "ready" in one transaction. */
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

export const completions = pgTable(
  "completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
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

export const codeVerifications = pgTable(
  "code_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    outlineVersion: integer("outline_version").notNull(),
    round: integer("round").notNull().default(0),
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

export const tutorConversations = pgTable(
  "tutor_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    lessonRef: text("lesson_ref").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tutor_conversations_course_lesson_key").on(table.courseId, table.lessonRef),
    index("tutor_conversations_course_id_idx").on(table.courseId),
  ],
);

export const tutorMessages = pgTable(
  "tutor_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => tutorConversations.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tutor_messages_conversation_seq_key").on(table.conversationId, table.seq),
    index("tutor_messages_conversation_id_idx").on(table.conversationId),
  ],
);

export type TutorConversation = typeof tutorConversations.$inferSelect;
export type TutorMessage = typeof tutorMessages.$inferSelect;

export const lessonFragments = pgTable(
  "lesson_fragments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    lessonRef: text("lesson_ref").notNull(),
    ordinal: integer("ordinal").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  },
  (table) => [
    index("lesson_fragments_course_id_idx").on(table.courseId),
    index("lesson_fragments_course_lesson_idx").on(table.courseId, table.lessonRef),
  ],
);

export type LessonFragment = typeof lessonFragments.$inferSelect;

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

export const tailorMessages = pgTable(
  "tailor_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => tailorConversations.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tailor_messages_conversation_seq_key").on(table.conversationId, table.seq),
  ],
);

export const changePlans = pgTable(
  "change_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    baseOutlineVersion: integer("base_outline_version").notNull(),
    baseRevisionNumber: integer("base_revision_number"),
    status: text("status").notNull().default("proposed"),
    stagedOutlineVersion: integer("staged_outline_version"),
    publishedRevisionNumber: integer("published_revision_number"),
    touchedLessons: jsonb("touched_lessons").$type<string[]>(),
    touchedModules: jsonb("touched_modules").$type<string[]>(),
    regeneratedLessons: jsonb("regenerated_lessons").$type<string[]>(),
    completionSnapshot:
      jsonb("completion_snapshot").$type<{ lessonRef: string; doneAt: string }[]>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("change_plans_course_id_idx").on(table.courseId)],
);

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
