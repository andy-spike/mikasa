/**
 * The one Drizzle schema (ADR 0004).
 *
 * The auth tables follow Better Auth's core shape with `usePlural: true`,
 * so the adapter resolves `users`, `sessions`, `accounts` and
 * `verifications` by name. Better Auth supplies every id, so the columns
 * are text without database defaults.
 */
import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
    grounding: boolean("grounding").notNull().default(false),
    /** "outline": the Outline exists and no Lesson is generated. "reading": it has been. */
    status: text("status").notNull().default("outline"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("courses_owner_id_idx").on(table.ownerId)],
);

export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
