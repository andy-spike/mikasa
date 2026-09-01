/**
 * Adapters from DB rows to the shapes the existing interface reads. The
 * Outline editor keeps its own vocabulary (`OutlineEditorCourse`); feeding
 * it real data must not mean redesigning it.
 */
import { DEPTH_CHOICES } from "./limits";
import type { OutlineData, OutlineModule } from "./types";
import type { Course } from "@/lib/db/schema";

/** The Depth's display title, as the form offered it. */
export function depthLabel(depth: string): string {
  return DEPTH_CHOICES.find((d) => d.id === depth)?.title ?? depth;
}

/** What the Outline editor reads: the Course header and the current shape. */
export type OutlineEditorCourse = {
  id: string;
  topic: string;
  goal: string;
  /** "editing" at the checkpoint; "generating" once approval opened the run. */
  phase: "editing" | "generating";
  /** The Outline version this shape is, so edits can detect conflicts. */
  version: number;
  modules: OutlineModule[];
};

/**
 * A designed Course, as the Outline editor reads it. Lessons carry their
 * stable ids; numbers are derived from position at render time.
 */
export function outlineToEditorCourse(
  course: Course,
  outlineVersion: number,
  outline: OutlineData,
  phase: "editing" | "generating" = "editing",
): OutlineEditorCourse {
  return {
    id: course.id,
    topic: course.topic,
    goal: course.goal,
    phase,
    version: outlineVersion,
    modules: outline.modules,
  };
}
