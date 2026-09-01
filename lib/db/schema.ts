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
} from "drizzle-orm/pg-core";
import type { CourseSpecification, OutlineData } from "../course/types";

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
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("courses_owner_id_idx").on(table.ownerId)],
);

/**
 * The private Course specification: the structured plan that links the Goal,
 * Outline, Lessons, Exercises and Sources. Never rendered to the Learner.
 * One row per Course; replaced whole when a revision is accepted (later
 * tickets), so the JSON carries a version of its own.
 */
export const courseSpecs = pgTable(
  "course_specs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    spec: jsonb("spec").$type<CourseSpecification>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("course_specs_course_id_key").on(table.courseId)],
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
