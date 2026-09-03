/**
 * The Tutor (ticket #10): a conversational agent over one published
 * Course. It reads the current Lesson, the Outline, the compact Course
 * specification, the recent conversation, and the Course's Sources — and
 * it can change nothing. No tools exist on this call; the prompt says so
 * in the same breath as its job, so the model never promises an edit.
 *
 * History is ModelMessages: the server's stored turns become the
 * conversation the model continues.
 */
import type { ModelMessage } from "ai";
import type { ReadingLesson, ReadingCourse, SourceLink } from "./reading";
import type { TutorTurnRow } from "@/lib/db/tutor";

/** How much stored history rides with each turn. */
const HISTORY_WINDOW = 20;

type TutorContext = {
  course: Pick<ReadingCourse, "topic" | "goal">;
  /** The Outline, module by module, for orientation only. */
  outline: { numeral: string; title: string; lessons: { title: string }[] }[];
  /** The compact specification: what the Learner is aiming at. */
  spec: {
    depth: string;
    language: string;
    terminalPerformances: string[];
    premise: string;
    finalExercise: { task: string; acceptanceChecks: string[] };
  };
  /** The Lesson the Learner is reading right now. */
  lesson: ReadingLesson;
  /** The Course's Sources, for pointing at evidence. */
  sources: SourceLink[];
};

/** One Lesson's content, as the Tutor reads it. */
function lessonText(lesson: ReadingLesson): string {
  const lines: string[] = [
    `Lesson: ${lesson.title}`,
    `Summary: ${lesson.summary}`,
    `Reading time: ${lesson.minutes} minutes`,
  ];
  if (lesson.body.length > 0) {
    lines.push("Body and worked example:");
    for (const block of lesson.body) {
      if (block.kind === "p") lines.push(block.text);
      else if (block.kind === "code") lines.push(`\`\`\`${block.language}\n${block.code}\n\`\`\``);
      else if (block.kind === "sql") lines.push(`\`\`\`sql\n${block.code}\n\`\`\``);
      else if (block.kind === "note") lines.push(`${block.title}: ${block.text}`);
      else if (block.kind === "table")
        lines.push([block.head.join(" | "), ...block.rows.map((r) => r.join(" | "))].join("\n"));
    }
  }
  lines.push(`Exercise: ${lesson.exercise?.task ?? "(none)"}`);
  if (lesson.exercise?.check) lines.push(`Exercise check: ${lesson.exercise.check}`);
  return lines.join("\n");
}

/** The Tutor's standing instructions plus the Course context it reads. */
export function tutorSystemPrompt(context: TutorContext): string {
  const outlineLines = context.outline
    .map((m) => `${m.numeral}. ${m.title}: ${m.lessons.map((l) => l.title).join(" · ")}`)
    .join("\n");

  const sources =
    context.sources.length > 0
      ? context.sources.map((s) => `- ${s.title}${s.url ? ` (${s.url})` : ""}`).join("\n")
      : "(none — answer from the Course alone)";

  return [
    "You are the Tutor of Mikasa, a learning workspace. The Learner is",
    "reading a Course and asks about the Lesson in front of them.",
    "",
    "Your job: answer the question in the terms of this Lesson — correct",
    "confusions, connect to what came before, and point at the exercise",
    "when practice is the missing step. Be direct and concrete. Short",
    "prose; a short code block only when the question is about code.",
    "",
    "You have two read-only tools:",
    "- searchCourse: exact retrieval over this Course's published Lessons.",
    "  Search it whenever the answer may live elsewhere in the Course,",
    "  and read the hits before you answer.",
    "- searchWeb: current web results, only when the Course's own content",
    "  is not enough (recent facts, things outside the Course's scope).",
    "Both tools read; neither can change the Course. You have no way to",
    "edit Lessons, the Outline, or any Course state. If the Learner asks",
    "for a change, say what you would change in words only — the Tailor",
    "panel is where changes happen, not you.",
    "",
    "When an answer rests on a Source — a Course Source or a web result —",
    "cite it inline, as a markdown link whose text is the Source's title:",
    "[Postgres window docs](https://example.com/windows). Cite the",
    "evidence you actually used; do not invent links.",
    "",
    "The Course:",
    `Topic: ${context.course.topic}`,
    `Goal: ${context.course.goal}`,
    `Depth: ${context.spec.depth}`,
    `Language: answer in ${context.spec.language}`,
    `What finishing means: ${context.spec.terminalPerformances.join("; ") || "(not stated)"}`,
    `The throughline premise: ${context.spec.premise}`,
    `The final Exercise: ${context.spec.finalExercise.task}`,
    `  accepted when: ${context.spec.finalExercise.acceptanceChecks.join("; ") || "(not stated)"}`,
    "",
    "The Outline (for orientation, not to teach from):",
    outlineLines,
    "",
    "Sources of the Course (evidence you may point to):",
    sources,
    "",
    "The Lesson in front of the Learner:",
    lessonText(context.lesson),
  ].join("\n");
}

/**
 * The conversation the model continues: the stored history as
 * ModelMessages and the new Learner message last. The Tutor's standing
 * instructions ride separately, through `instructions`.
 */
export function tutorPrompt(history: TutorTurnRow[], message: string): ModelMessage[] {
  const recent = history.slice(-HISTORY_WINDOW);
  return [
    ...recent.map((turn): ModelMessage =>
      turn.role === "learner"
        ? { role: "user", content: turn.content }
        : { role: "assistant", content: turn.content },
    ),
    { role: "user", content: message },
  ];
}
