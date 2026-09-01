/**
 * The documented creation limits. `validateCourseInput` is the single
 * authority — the form shows the same errors the action would reject with.
 */
import { describe, expect, it } from "vitest";
import {
  BACKGROUND_MAX_LENGTH,
  COURSE_LANGUAGE_CODES,
  DEPTH_BOUNDS,
  DEPTH_IDS,
  GOAL_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
  validateCourseInput,
} from "@/lib/course/limits";

const base = {
  topic: "the Vercel AI SDK",
  goal: "build my own AI chat app",
  background: "",
  language: "en",
  depth: "reach",
  grounding: true,
};

const str = (n: number, ch = "x"): string => ch.repeat(n);

describe("validateCourseInput", () => {
  it("accepts the documented example and trims whitespace", () => {
    const parsed = validateCourseInput({ ...base, topic: "  the Vercel AI SDK  " });
    expect(parsed).toEqual({
      ok: true,
      value: { ...base, topic: "the Vercel AI SDK" },
    });
  });

  it("allows a Topic of exactly 200 characters and rejects 201", () => {
    expect(validateCourseInput({ ...base, topic: str(TOPIC_MAX_LENGTH) }).ok).toBe(true);
    const long = validateCourseInput({ ...base, topic: str(TOPIC_MAX_LENGTH + 1) });
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.errors.topic).toContain("200");
  });

  it("requires a Topic", () => {
    const empty = validateCourseInput({ ...base, topic: "   " });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.errors.topic).toBeTruthy();
  });

  it("allows a Goal of exactly 500 characters and rejects 501", () => {
    expect(validateCourseInput({ ...base, goal: str(GOAL_MAX_LENGTH) }).ok).toBe(true);
    const long = validateCourseInput({ ...base, goal: str(GOAL_MAX_LENGTH + 1) });
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.errors.goal).toContain("500");
  });

  it("requires a Goal", () => {
    const empty = validateCourseInput({ ...base, goal: "" });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.errors.goal).toBeTruthy();
  });

  it("allows an empty Background and rejects more than 2000 characters", () => {
    expect(validateCourseInput({ ...base, background: "" }).ok).toBe(true);
    expect(validateCourseInput({ ...base, background: str(BACKGROUND_MAX_LENGTH) }).ok).toBe(true);
    const long = validateCourseInput({ ...base, background: str(BACKGROUND_MAX_LENGTH + 1) });
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.errors.background).toContain("2000");
  });

  it("accepts exactly the supported Course Languages and nothing else", () => {
    expect(COURSE_LANGUAGE_CODES).toEqual(["en", "es", "fr", "de", "pt"]);
    for (const code of COURSE_LANGUAGE_CODES) {
      expect(validateCourseInput({ ...base, language: code }).ok).toBe(true);
    }
    for (const bad of ["klingon", "EN", "", "english"]) {
      const parsed = validateCourseInput({ ...base, language: bad });
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.errors.language).toBeTruthy();
    }
  });

  it("accepts exactly the three Depths", () => {
    expect(DEPTH_IDS).toEqual(["reach", "working", "mastery"]);
    for (const depth of DEPTH_IDS) {
      expect(validateCourseInput({ ...base, depth }).ok).toBe(true);
    }
    const parsed = validateCourseInput({ ...base, depth: "expert" });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.depth).toBeTruthy();
  });

  it("defaults Grounding to enabled, and only an explicit false turns it off", () => {
    const defaulted = validateCourseInput({ ...base });
    expect(defaulted.ok && defaulted.value.grounding).toBe(true);

    const undefined_ = validateCourseInput({ ...base, grounding: undefined });
    expect(undefined_.ok && undefined_.value.grounding).toBe(true);

    const off = validateCourseInput({ ...base, grounding: false });
    expect(off.ok && off.value.grounding).toBe(false);
  });

  it("reports every field's problems at once", () => {
    const parsed = validateCourseInput({
      topic: str(TOPIC_MAX_LENGTH + 5),
      goal: "",
      background: str(BACKGROUND_MAX_LENGTH + 1),
      language: "xx",
      depth: "expert",
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(Object.keys(parsed.errors).sort()).toEqual([
        "background",
        "depth",
        "goal",
        "language",
        "topic",
      ]);
    }
  });
});

describe("DEPTH_BOUNDS", () => {
  /* The bounds are the contract between Depth and the Outline: each step up
     in Depth must allow at least as much structure as the one before. */
  it("grows with Depth and keeps every minimum a real shape", () => {
    expect(DEPTH_BOUNDS.reach).toEqual({
      minModules: 2, maxModules: 3, minLessons: 3, maxLessons: 6,
    });
    expect(DEPTH_BOUNDS.working.maxLessons).toBeGreaterThan(DEPTH_BOUNDS.reach.maxLessons);
    expect(DEPTH_BOUNDS.mastery.maxLessons).toBeGreaterThan(DEPTH_BOUNDS.working.maxLessons);
    for (const b of Object.values(DEPTH_BOUNDS)) {
      expect(b.minModules).toBeGreaterThanOrEqual(1);
      expect(b.minLessons).toBeGreaterThanOrEqual(b.minModules);
      expect(b.maxLessons).toBeGreaterThanOrEqual(b.maxModules);
    }
  });
});
