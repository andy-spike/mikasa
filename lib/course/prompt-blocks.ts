// Shared prompt fragments for Course writing and review. Wording lives here
// once so tuning touches one place; callers pick the fragment that fits the
// job. Write, review, and correct prompts disagree on purpose about what the
// contract means for them, so each keeps its own instruction text.
import type { CourseSpecification, GatheredSource } from "./types";
import { COURSE_LANGUAGES } from "./limits";

export function languageName(language: string): string {
  return COURSE_LANGUAGES.find((l) => l.code === language)?.label ?? "English";
}

export function finalExerciseLines(spec: CourseSpecification): string[] {
  return [
    `Final Exercise (the Goal made real): ${spec.finalExercise.task}`,
    `Done when: ${spec.finalExercise.acceptanceChecks.join("; ")}`,
    "This Lesson's Exercise must build toward that final Exercise.",
  ];
}

export function sourceLine(
  source: Pick<GatheredSource, "ref" | "title" | "url" | "excerpt">,
): string {
  return `- ${source.ref}: ${source.title} (${source.url}) — ${source.excerpt.slice(0, 300)}`;
}

// Pinned before any Lesson was written; the writer preserves its fixed parts.
export function contractWriteBlock(contract: string): string {
  return contractBlock([
    "The shared example's contract was pinned before any Lesson was written.",
    "Keep its fixed names, artifacts, and boundaries consistent. A value applies only",
    "within the scope stated in the contract. Make choices marked Decide later in",
    "the relevant Lesson; do not apply one choice to every part of the example.",
    "Carry each choice forward until a later Lesson explicitly changes it:",
    contract,
    "",
  ]);
}

// Authoritative for the Lesson under correction; the corrector keeps it exact.
export function contractCorrectBlock(contract: string): string {
  return contractBlock([
    "The example contract below is authoritative for its fixed names, artifacts,",
    "and boundaries. Keep values within their stated scope. Choices marked Decide",
    "later may differ across parts of the example; follow the Lesson alignment",
    "and preserve choices already established unless a correction changes them.",
    contract,
  ]);
}

// Authoritative for the reviewer, but only breaking mismatches count.
export function contractReviewBlock(contract: string): string {
  return contractBlock([
    "The example contract below is authoritative for its fixed names, artifacts,",
    "and boundaries. Flag only mismatches that break code or violate a fixed",
    "boundary. Choices marked Decide later may differ by resource and may",
    "evolve across Lessons when explained. Flag unexplained changes that break",
    "the example. Ignore rewording that has the same effect:",
    contract,
  ]);
}

function contractBlock(lines: string[]): string {
  return lines.join("\n");
}
