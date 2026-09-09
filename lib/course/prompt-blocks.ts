// Shared prompt fragments for Course writing and review. Wording lives here
// once so tuning touches one place; callers pick the fragment that fits the
// job. Write, review, and correct prompts disagree on purpose about what the
// contract means for them, so each keeps its own instruction text.
import type { CourseSpecification } from "./types";

export function languageName(language: string): string {
  const names: Record<string, string> = {
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    pt: "Portuguese",
  };
  return names[language] ?? "English";
}

export function finalExerciseLines(spec: CourseSpecification): string[] {
  return [
    `Final Exercise (the Goal made real): ${spec.finalExercise.task}`,
    `Done when: ${spec.finalExercise.acceptanceChecks.join("; ")}`,
    "This Lesson's Exercise must build toward that final Exercise.",
  ];
}

export function sourceLine(source: {
  ref: string;
  title: string;
  url: string;
  excerpt: string;
}): string {
  return `- ${source.ref}: ${source.title} (${source.url}) — ${source.excerpt.slice(0, 300)}`;
}

// Pinned before any Lesson was written; the writer copies it verbatim.
export function contractWriteBlock(contract: string): string {
  return [
    "The shared example's contract, pinned before any Lesson was written. Copy its tags,",
    "class names, and values verbatim wherever the running example appears. Never rename,",
    "revalue, or restate them differently:",
    contract,
    "",
  ].join("\n");
}

// Authoritative for the Lesson under correction; the corrector keeps it exact.
export function contractCorrectBlock(contract: string): string {
  return [
    "The example contract below is authoritative: keep its tags, class names, and values",
    "exactly as written in the corrected Lesson; never invent alternatives.",
    contract,
  ].join("\n");
}

// Authoritative for the reviewer, but only breaking mismatches count.
export function contractReviewBlock(contract: string): string {
  return [
    "The example contract below is authoritative. Flag only mismatches",
    "that break code: wrong tags, class names, or values the Lesson uses",
    "differently. Ignore rewording that runs the same:",
    contract,
  ].join("\n");
}
