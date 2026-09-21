// The Tutor can change nothing: no tools exist on this call.
import type { ModelMessage } from "ai";
import type { ReadingLesson, ReadingCourse, SourceLink } from "./reading";
import type { TutorTurnRow } from "@/lib/db/tutor";
import { formatDayStamp } from "@/lib/utils";

const HISTORY_WINDOW = 20;

type TutorContext = {
  course: Pick<ReadingCourse, "topic" | "goal">;
  outline: { numeral: string; title: string; lessons: { title: string }[] }[];
  spec: {
    depth: string;
    language: string;
    terminalPerformances: string[];
    premise: string;
    finalExercise: { task: string; acceptanceChecks: string[] };
  };
  lesson: ReadingLesson;
  sources: SourceLink[];
};

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
    "when practice is the missing step. Be direct and concrete. No length",
    "limit: say what the answer needs, nothing more.",
    "",
    "You have two read-only tools, in this order:",
    "- searchCourse first: exact retrieval over this Course's published Lessons.",
    "  Call it first unless the question quotes the current Lesson word for",
    "  word. Read the hits before you answer.",
    "- searchWeb only after searchCourse returns nothing useful: current web",
    "  results for recent facts or things outside the Course's scope.",
    "Both tools read; neither can change the Course. You have no way to",
    "edit Lessons, the Outline, or any Course state. If the Learner asks",
    "for a change, say what you would change in words only — the Tailor",
    "panel is where changes happen, not you.",
    "",
    "When an answer rests on a Source — a Course Source or a web result —",
    "cite it inline as a markdown link whose text is the Source's title:",
    "[Postgres window docs](https://example.com/windows). Every factual",
    "claim that leans on a Source needs its link. Cite only evidence you",
    "actually used; do not invent links.",
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

export function tutorPrompt(history: TutorTurnRow[], message: string): ModelMessage[] {
  return historyMessages(history.slice(-HISTORY_WINDOW), message);
}

export function historyMessages(
  turns: { role: string; content: string }[],
  message: string,
): ModelMessage[] {
  return [
    ...turns.map((turn): ModelMessage => ({
      role: turn.role === "learner" ? "user" : "assistant",
      content: turn.content,
    })),
    { role: "user", content: message },
  ];
}

/** A chat as the margin reads it: an id to open it by, a date, and its turns. */
export type ChatView = {
  id: string;
  date: string;
  turns: { from: "learner" | "tutor" | "tailor"; text: string; anchor?: string | null }[];
};

export function chatViews(
  chats: {
    id: string;
    createdAt: Date;
    turns: { role: string; content: string; anchor?: string | null }[];
  }[],
): ChatView[] {
  return chats.map((chat) => ({
    id: chat.id,
    date: formatDayStamp(chat.createdAt),
    turns: chat.turns.map((turn) => ({
      from: turn.role === "learner" ? "learner" : turn.role === "tutor" ? "tutor" : "tailor",
      text: turn.content,
      anchor: turn.anchor ?? null,
    })),
  }));
}
