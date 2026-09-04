import { DEPTH_CHOICES } from "./limits";
import type { OutlineData, OutlineModule } from "./types";
import type { Course } from "@/lib/db/schema";

export function depthLabel(depth: string): string {
  return DEPTH_CHOICES.find((d) => d.id === depth)?.title ?? depth;
}

export type OutlineEditorCourse = {
  id: string;
  topic: string;
  goal: string;
  phase: "editing" | "generating" | "reviewing";
  version: number;
  modules: OutlineModule[];
};

export function outlineToEditorCourse(
  course: Course,
  outlineVersion: number,
  outline: OutlineData,
  phase: "editing" | "generating" | "reviewing" = "editing",
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
