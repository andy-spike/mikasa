// Shared graph primitives for the Course specification. Three callers walk
// the same shape: generationOrder, validateSpecification, and the structural
// review's later-Lesson check. The algorithm lives here once; each caller
// keeps its own error text.
import type { CourseSpecification, OutlineData, OutlineLesson } from "./types";

export type OutlinePositions = {
  lessons: OutlineLesson[];
  position: Map<string, number>;
};

export function outlineLessonsWithModule(
  outline: OutlineData,
): (OutlineLesson & { module: string })[] {
  return outline.modules.flatMap((m) => m.lessons.map((l) => ({ ...l, module: m.title })));
}

export function outlinePosition(outline: OutlineData): OutlinePositions {
  const lessons = outline.modules.flatMap((m) => m.lessons);
  return { lessons, position: new Map(lessons.map((l, i) => [l.id, i])) };
}

export function introducedAtMap(
  graph: CourseSpecification["learningGraph"],
  position: Map<string, number>,
): Map<string, number> {
  const introducedAt = new Map<string, number>();
  for (const node of graph) {
    const at = position.get(node.lessonId);
    if (at !== undefined) introducedAt.set(node.id, at);
  }
  return introducedAt;
}

// Returns the node ids on a dependency cycle, or null when acyclic.
export function findCyclePath(graph: CourseSpecification["learningGraph"]): string[] | null {
  const byId = new Map(graph.map((n) => [n.id, n]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, stack: string[]): string[] | null => {
    if (visited.has(id)) return null;
    if (visiting.has(id)) return [...stack, id];
    visiting.add(id);
    for (const required of byId.get(id)?.requires ?? []) {
      const cycle = visit(required, [...stack, id]);
      if (cycle) return cycle;
    }
    visiting.delete(id);
    visited.add(id);
    return null;
  };
  for (const node of graph) {
    const cycle = visit(node.id, []);
    if (cycle) return cycle;
  }
  return null;
}
