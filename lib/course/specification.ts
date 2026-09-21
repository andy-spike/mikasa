import { z } from "zod";
import type { CourseSpecification, OutlineData, OutlineLesson } from "./types";

export class GenerationError extends Error {
  name = "GenerationError";
}

const learningGraphSchema = z.array(
  z.object({
    id: z.string().regex(/^g\d+$/),
    skill: z.string().min(1),
    requires: z.array(z.string()),
    lessonId: z.string(),
  }),
);

const alignmentSchema = z.array(
  z.object({
    lessonId: z.string(),
    performance: z.string().min(1),
    prerequisiteNodes: z.array(z.string()),
    moduleMilestone: z.string().min(1),
    exerciseContribution: z.string().min(1),
    exampleStart: z.string(),
    exampleEnd: z.string(),
    sourceRefs: z.array(z.string()),
  }),
);

export const specificationReconciliationSchema = z.object({
  learningGraph: learningGraphSchema,
  alignment: alignmentSchema,
});

export const specificationDesignSchema = specificationReconciliationSchema.extend({
  finalExercise: z.object({
    task: z.string().min(1),
    acceptanceChecks: z.array(z.string()).min(1),
  }),
  evidence: z.array(
    z.object({
      sourceRef: z.string(),
      supports: z.string().min(1),
    }),
  ),
});

export const sharedSpecificationSchema = specificationDesignSchema
  .omit({ alignment: true })
  .extend({
    modules: z.array(
      z.object({
        moduleId: z.string(),
        milestone: z.string().min(1),
        exampleStart: z.string(),
        exampleEnd: z.string(),
      }),
    ),
  });

export const moduleAlignmentSchema = z.object({ alignment: alignmentSchema });

type OutlinePositions = {
  lessons: OutlineLesson[];
  position: Map<string, number>;
};

export function outlineLessonsWithModule(
  outline: OutlineData,
): (OutlineLesson & { module: string })[] {
  return outline.modules.flatMap((module) =>
    module.lessons.map((lesson) => ({ ...lesson, module: module.title })),
  );
}

function outlinePosition(outline: OutlineData): OutlinePositions {
  const lessons = outline.modules.flatMap((module) => module.lessons);
  return { lessons, position: new Map(lessons.map((lesson, index) => [lesson.id, index])) };
}

function introducedAtMap(
  graph: CourseSpecification["learningGraph"],
  position: Map<string, number>,
): Map<string, number> {
  const introducedAt = new Map<string, number>();
  for (const node of graph) {
    const lessonPosition = position.get(node.lessonId);
    if (lessonPosition !== undefined) introducedAt.set(node.id, lessonPosition);
  }
  return introducedAt;
}

export function laterPrerequisiteViolations(
  specification: CourseSpecification,
  outline: OutlineData,
): { lessonId: string; nodeId: string }[] {
  const { position } = outlinePosition(outline);
  const introducedAt = introducedAtMap(specification.learningGraph, position);
  const violations: { lessonId: string; nodeId: string }[] = [];

  for (const alignment of specification.alignment) {
    const lessonPosition = position.get(alignment.lessonId);
    if (lessonPosition === undefined) continue;
    for (const nodeId of alignment.prerequisiteNodes) {
      const prerequisitePosition = introducedAt.get(nodeId);
      if (prerequisitePosition !== undefined && prerequisitePosition > lessonPosition) {
        violations.push({ lessonId: alignment.lessonId, nodeId });
      }
    }
  }
  return violations;
}

export function generationOrder(
  specification: CourseSpecification,
  outline: OutlineData,
): OutlineLesson[] {
  const outlineIndex = outlinePosition(outline);
  validateAlignmentCoverage(specification, outlineIndex);
  const nodeIds = validateGraphNodes(specification, outlineIndex.position);
  validateGraphReferences(specification, nodeIds);
  validateGraphOrder(specification, outlineIndex.position);
  return outlineIndex.lessons;
}

export function validateSpecification(
  specification: CourseSpecification,
  outline: OutlineData,
  availableSourceRefs: Set<string>,
): void {
  const outlineIndex = outlinePosition(outline);
  validateAlignmentCoverage(specification, outlineIndex, true);
  validateUniquePerformances(specification, outlineIndex.lessons);
  validateAlignmentSources(specification, availableSourceRefs);
  validateDistinctReferences(specification);
  const nodeIds = validateGraphNodeIds(specification);
  validateGraphLessonRefs(specification, outlineIndex.position);
  validateGraphReferences(specification, nodeIds, true);
  validateEvidenceSources(specification, availableSourceRefs);
  validateGraphOrder(specification, outlineIndex.position, true);
}

function duplicate(values: string[]): string | undefined {
  const seen = new Set<string>();
  return values.find((value) => {
    if (seen.has(value)) return true;
    seen.add(value);
    return false;
  });
}

function validateDistinctReferences(specification: CourseSpecification): void {
  for (const node of specification.learningGraph) {
    const repeated = duplicate(node.requires);
    if (repeated) {
      throw new GenerationError(
        `Node "${node.id}" requires "${repeated}" more than once. Keep one edge.`,
      );
    }
  }
  for (const alignment of specification.alignment) {
    const repeatedPrerequisite = duplicate(alignment.prerequisiteNodes);
    if (repeatedPrerequisite) {
      throw new GenerationError(
        `Lesson "${alignment.lessonId}" repeats prerequisite "${repeatedPrerequisite}". Keep one reference.`,
      );
    }
    const repeatedSource = duplicate(alignment.sourceRefs);
    if (repeatedSource) {
      throw new GenerationError(
        `Lesson "${alignment.lessonId}" repeats Source "${repeatedSource}". Keep one reference.`,
      );
    }
  }
}

function validateAlignmentCoverage(
  specification: CourseSpecification,
  outline: OutlinePositions,
  explainRepair = false,
): void {
  const lessonIds = new Set(outline.lessons.map((lesson) => lesson.id));
  const seenAlignment = new Set<string>();
  for (const alignment of specification.alignment) {
    if (seenAlignment.has(alignment.lessonId)) {
      throw new GenerationError(
        `The specification has two alignment entries for Lesson "${alignment.lessonId}". Keep one.`,
      );
    }
    seenAlignment.add(alignment.lessonId);
    if (!lessonIds.has(alignment.lessonId)) {
      const repair = explainRepair ? " Reconcile to the approved Outline ids." : "";
      throw new GenerationError(
        `The specification aligns Lesson "${alignment.lessonId}", which the Outline does not have.${repair}`,
      );
    }
  }

  const missing = outline.lessons.filter((lesson) => !seenAlignment.has(lesson.id));
  if (missing.length > 0) {
    const repair = explainRepair ? " Add alignment for each." : "";
    throw new GenerationError(
      `The specification skipped ${missing.length} Lesson(s): ${missing.map((lesson) => lesson.title).join(", ")}.${repair}`,
    );
  }
}

function validateUniquePerformances(
  specification: CourseSpecification,
  lessons: OutlineLesson[],
): void {
  const titleOf = new Map(lessons.map((lesson) => [lesson.id, lesson.title]));
  const byPerformance = new Map<string, string[]>();
  for (const alignment of specification.alignment) {
    const performance = alignment.performance.trim().toLowerCase();
    if (!performance) continue;
    const holders = byPerformance.get(performance) ?? [];
    holders.push(alignment.lessonId);
    byPerformance.set(performance, holders);
  }

  for (const [performance, holders] of byPerformance) {
    if (holders.length < 2) continue;
    throw new GenerationError(
      `Lessons ${holders.map((id) => `"${titleOf.get(id) ?? id}"`).join(" and ")} all claim the same performance "${performance}". Give each Lesson a distinct performance, or the Course reads as duplicate Lessons the correction loop cannot merge.`,
    );
  }
}

function validateAlignmentSources(
  specification: CourseSpecification,
  availableSourceRefs: Set<string>,
): void {
  for (const alignment of specification.alignment) {
    if (typeof alignment.exampleStart !== "string" || typeof alignment.exampleEnd !== "string") {
      throw new GenerationError(
        `Lesson "${alignment.lessonId}" needs exampleStart and exampleEnd strings (empty is fine when the Topic has no shared example).`,
      );
    }
    if (!Array.isArray(alignment.sourceRefs)) {
      throw new GenerationError(
        `Lesson "${alignment.lessonId}" needs a sourceRefs array (empty is fine).`,
      );
    }
    const unknownRef = alignment.sourceRefs.find((ref) => !availableSourceRefs.has(ref));
    if (unknownRef) {
      throw new GenerationError(
        `Lesson "${alignment.lessonId}" cites Source "${unknownRef}", which the Course does not have. Use a stored Source ref or leave sourceRefs empty.`,
      );
    }
  }
}

function validateGraphNodeIds(specification: CourseSpecification): Set<string> {
  const nodeIds = new Set<string>();
  for (const node of specification.learningGraph) {
    if (nodeIds.has(node.id)) {
      throw new GenerationError(
        `The specification introduces skill "${node.id}" twice. Give every graph node a unique id.`,
      );
    }
    nodeIds.add(node.id);
  }
  return nodeIds;
}

function validateGraphNodes(
  specification: CourseSpecification,
  position: Map<string, number>,
): Set<string> {
  const nodeIds = new Set<string>();
  for (const node of specification.learningGraph) {
    if (nodeIds.has(node.id)) {
      throw new GenerationError(
        `The specification introduces skill "${node.id}" twice. Give every graph node a unique id.`,
      );
    }
    nodeIds.add(node.id);
    if (!position.has(node.lessonId)) {
      throw new GenerationError(
        `The specification's node "${node.id}" points at Lesson "${node.lessonId}", which the Outline does not have.`,
      );
    }
  }
  return nodeIds;
}

function validateGraphLessonRefs(
  specification: CourseSpecification,
  position: Map<string, number>,
): void {
  for (const node of specification.learningGraph) {
    if (!position.has(node.lessonId)) {
      throw new GenerationError(
        `The specification's node "${node.id}" points at Lesson "${node.lessonId}", which the Outline does not have.`,
      );
    }
  }
}

function validateGraphReferences(
  specification: CourseSpecification,
  nodeIds: Set<string>,
  explainRepair = false,
): void {
  for (const node of specification.learningGraph) {
    for (const required of node.requires) {
      if (!nodeIds.has(required)) {
        const repair = explainRepair ? " Point requires at a known graph id." : "";
        throw new GenerationError(
          `Node "${node.id}" requires "${required}", which no node introduces.${repair}`,
        );
      }
    }
  }
  for (const alignment of specification.alignment) {
    for (const prerequisite of alignment.prerequisiteNodes) {
      if (!nodeIds.has(prerequisite)) {
        const repair = explainRepair ? " Point prerequisiteNodes at a known graph id." : "";
        throw new GenerationError(
          `Lesson "${alignment.lessonId}" assumes skill "${prerequisite}", which no graph node introduces.${repair}`,
        );
      }
    }
  }
}

function validateEvidenceSources(
  specification: CourseSpecification,
  availableSourceRefs: Set<string>,
): void {
  for (const evidence of specification.evidence) {
    if (!availableSourceRefs.has(evidence.sourceRef)) {
      throw new GenerationError(
        `The specification cites Source "${evidence.sourceRef}" in evidence, which the Course does not have. Use a stored Source ref.`,
      );
    }
  }
}

function validateGraphOrder(
  specification: CourseSpecification,
  position: Map<string, number>,
  explainRepair = false,
): void {
  const cycle = findCyclePath(specification.learningGraph);
  if (cycle) {
    const detail = explainRepair
      ? ` through ${cycle.join(" -> ")}. Remove one requires edge.`
      : "; no Lesson order satisfies it.";
    throw new GenerationError(`The specification's dependency graph has a cycle${detail}`);
  }

  const introducedAt = introducedAtMap(specification.learningGraph, position);
  for (const node of specification.learningGraph) {
    const lessonPosition = position.get(node.lessonId)!;
    for (const required of node.requires) {
      if (introducedAt.get(required)! > lessonPosition) {
        const repair = explainRepair ? " Move the skill earlier or drop the edge." : "";
        throw new GenerationError(
          `Node "${node.id}" in Lesson "${node.lessonId}" requires "${required}", which is only introduced in a later Lesson.${repair}`,
        );
      }
    }
  }
  for (const alignment of specification.alignment) {
    const lessonPosition = position.get(alignment.lessonId)!;
    for (const prerequisite of alignment.prerequisiteNodes) {
      const prerequisitePosition = introducedAt.get(prerequisite);
      if (prerequisitePosition !== undefined && prerequisitePosition > lessonPosition) {
        const repair = explainRepair ? " Teach it earlier or drop the assumption." : "";
        throw new GenerationError(
          `Lesson "${alignment.lessonId}" assumes skill "${prerequisite}", which is only introduced in a later Lesson.${repair}`,
        );
      }
    }
  }
}

function findCyclePath(graph: CourseSpecification["learningGraph"]): string[] | null {
  const byId = new Map(graph.map((node) => [node.id, node]));
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
