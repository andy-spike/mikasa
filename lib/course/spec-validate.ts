// Validates a Course specification against the approved Outline reading
// order and the stored Sources. Never reorders the Outline or drops
// references; every problem is an actionable error for one repair attempt.
import { GenerationError } from "./generate";
import { findCyclePath, introducedAtMap, outlinePosition } from "./spec-graph";
import type { CourseSpecification, OutlineData } from "./types";

export function validateSpecification(
  spec: CourseSpecification,
  outline: OutlineData,
  availableSourceRefs: Set<string>,
): void {
  const { lessons, position } = outlinePosition(outline);
  const lessonIds = new Set(lessons.map((l) => l.id));

  // Complete alignment: every Outline Lesson has exactly one entry, no extras.
  const seenAlignment = new Set<string>();
  for (const a of spec.alignment) {
    if (seenAlignment.has(a.lessonId)) {
      throw new GenerationError(
        `The specification has two alignment entries for Lesson "${a.lessonId}". Keep one.`,
      );
    }
    seenAlignment.add(a.lessonId);
    if (!lessonIds.has(a.lessonId)) {
      throw new GenerationError(
        `The specification aligns Lesson "${a.lessonId}", which the Outline does not have. Reconcile to the approved Outline ids.`,
      );
    }
  }
  const missing = lessons.filter((l) => !seenAlignment.has(l.id));
  if (missing.length > 0) {
    throw new GenerationError(
      `The specification skipped ${missing.length} Lesson(s): ${missing.map((l) => l.title).join(", ")}. Add alignment for each.`,
    );
  }

  // One performance per Lesson. Two Lessons teaching the same performance
  // read as duplicate Lessons; corrections edit content but never merge
  // Lessons, so the review's duplicate finding would be unfixable.
  const titleOf = new Map(lessons.map((l) => [l.id, l.title]));
  const byPerformance = new Map<string, string[]>();
  for (const a of spec.alignment) {
    const key = a.performance.trim().toLowerCase();
    if (!key) continue;
    const holders = byPerformance.get(key) ?? [];
    holders.push(a.lessonId);
    byPerformance.set(key, holders);
  }
  for (const [performance, holders] of byPerformance) {
    if (holders.length < 2) continue;
    throw new GenerationError(
      `Lessons ${holders.map((id) => `"${titleOf.get(id) ?? id}"`).join(" and ")} all claim the same performance "${performance}". Give each Lesson a distinct performance, or the Course reads as duplicate Lessons the correction loop cannot merge.`,
    );
  }
  // exampleStart/exampleEnd may be empty when the Topic has no cumulative
  // example; sourceRefs may be empty. Types enforce presence, values may be empty.
  for (const a of spec.alignment) {
    if (typeof a.exampleStart !== "string" || typeof a.exampleEnd !== "string") {
      throw new GenerationError(
        `Lesson "${a.lessonId}" needs exampleStart and exampleEnd strings (empty is fine when the Topic has no shared example).`,
      );
    }
    if (!Array.isArray(a.sourceRefs)) {
      throw new GenerationError(`Lesson "${a.lessonId}" needs a sourceRefs array (empty is fine).`);
    }
    const unknownRef = a.sourceRefs.find((ref) => !availableSourceRefs.has(ref));
    if (unknownRef) {
      throw new GenerationError(
        `Lesson "${a.lessonId}" cites Source "${unknownRef}", which the Course does not have. Use a stored Source ref or leave sourceRefs empty.`,
      );
    }
  }

  // Unique graph ids.
  const nodeIds = new Set<string>();
  for (const n of spec.learningGraph) {
    if (nodeIds.has(n.id)) {
      throw new GenerationError(
        `The specification introduces skill "${n.id}" twice. Give every graph node a unique id.`,
      );
    }
    nodeIds.add(n.id);
  }

  // Known Lesson references in the graph.
  const introducedBy = new Map<string, string>();
  for (const n of spec.learningGraph) {
    if (!lessonIds.has(n.lessonId)) {
      throw new GenerationError(
        `The specification's node "${n.id}" points at Lesson "${n.lessonId}", which the Outline does not have.`,
      );
    }
    introducedBy.set(n.id, n.lessonId);
  }

  // Known node references in requires and prerequisiteNodes.
  for (const n of spec.learningGraph) {
    for (const r of n.requires) {
      if (!nodeIds.has(r)) {
        throw new GenerationError(
          `Node "${n.id}" requires "${r}", which no node introduces. Point requires at a known graph id.`,
        );
      }
    }
  }
  for (const a of spec.alignment) {
    for (const p of a.prerequisiteNodes) {
      if (!nodeIds.has(p)) {
        throw new GenerationError(
          `Lesson "${a.lessonId}" assumes skill "${p}", which no graph node introduces. Point prerequisiteNodes at a known graph id.`,
        );
      }
    }
  }

  // Known Source references in evidence.
  for (const e of spec.evidence) {
    if (!availableSourceRefs.has(e.sourceRef)) {
      throw new GenerationError(
        `The specification cites Source "${e.sourceRef}" in evidence, which the Course does not have. Use a stored Source ref.`,
      );
    }
  }

  // Acyclic dependencies over graph nodes.
  const cycle = findCyclePath(spec.learningGraph);
  if (cycle) {
    throw new GenerationError(
      `The specification's dependency graph has a cycle through ${cycle.join(" -> ")}. Remove one requires edge.`,
    );
  }

  // Dependencies consistent with reading order. Same-Lesson edges are
  // allowed; a prerequisite introduced in a later Lesson is not.
  const introducedAt = introducedAtMap(spec.learningGraph, position);
  for (const n of spec.learningGraph) {
    const at = position.get(n.lessonId)!;
    for (const r of n.requires) {
      const providerAt = introducedAt.get(r)!;
      if (providerAt > at) {
        throw new GenerationError(
          `Node "${n.id}" in Lesson "${n.lessonId}" requires "${r}", which is only introduced in a later Lesson. Move the skill earlier or drop the edge.`,
        );
      }
    }
  }
  for (const a of spec.alignment) {
    const at = position.get(a.lessonId)!;
    for (const p of a.prerequisiteNodes) {
      const providerAt = introducedAt.get(p);
      if (providerAt !== undefined && providerAt > at) {
        throw new GenerationError(
          `Lesson "${a.lessonId}" assumes skill "${p}", which is only introduced in a later Lesson. Teach it earlier or drop the assumption.`,
        );
      }
    }
  }
}
