/**
 * Executable-claim verification (ticket #9): for a coding Course, the
 * candidate's code is written into an isolated Sandbox, the claims' own
 * commands are run there, and what happened — commands, output, the files
 * present — is kept as review evidence. A failed claim is a review
 * finding like any other: corrections rewrite the code, the next round
 * verifies again, and publication stays blocked while anything is still
 * failing.
 *
 * The Sandbox is injected, so tests substitute it entirely. The real
 * provider (`lib/sandbox`) creates a Vercel Sandbox with no environment
 * variables at all: nothing from the deployment — no secrets, no keys —
 * reaches the machine the candidate's code runs on.
 */
import { generateText, Output } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { designProviderOptions } from "@/lib/model";
import { GenerationError } from "./generate";
import type { LessonContent } from "./content";
import type { CourseSpecification } from "./types";

/** Words that, in a Topic or Goal, mean the Course teaches writing code. */
const CODING_MARKERS = [
  "code",
  "coding",
  "program",
  "programming",
  "javascript",
  "typescript",
  "python",
  "react",
  "node",
  "api",
  "sql",
  "database",
  "app",
  "developer",
  "software",
  "build a",
  "write a",
];

/**
 * Whether this Course's claims are executable. Two signals, either
 * suffices: the candidate itself carries code blocks, or the promised
 * work is coding by its own contract. A prose-only Course (a history of
 * typography, say) never creates Sandbox work.
 */
export function needsCodeVerification(
  contract: { topic: string; goal: string },
  lessons: LessonContent[],
): boolean {
  const text = `${contract.topic} ${contract.goal}`.toLowerCase();
  if (CODING_MARKERS.some((marker) => text.includes(marker))) return true;
  return lessons.some((l) =>
    [...l.body, ...l.workedExample].some((b) => b.kind === "code"),
  );
}

const planSchema = z.object({
  files: z
    .array(
      z.object({
        /** Where the file lands inside the Sandbox, e.g. "src/index.js". */
        path: z.string().min(1),
        /** The exact file contents, taken from the candidate's code. */
        content: z.string(),
        /** The Lesson the code came from, for targeted findings. */
        lessonRef: z.string(),
      }),
    )
    .min(1),
  commands: z
    .array(
      z.object({
        /** A single shell line, e.g. "node src/index.js". */
        run: z.string().min(1),
        lessonRef: z.string(),
        /** What a clean exit proves about the Lesson's claim. */
        proves: z.string().min(1),
      }),
    )
    .min(1),
});

export type VerificationPlan = z.infer<typeof planSchema>;

/**
 * Step: turn the candidate's code into a concrete Sandbox plan — the
 * files to write and the commands whose clean exit proves the Lessons'
 * claims. Only code that exists in the candidate may appear.
 */
export async function planVerification(
  model: LanguageModel,
  course: { topic: string; goal: string },
  spec: CourseSpecification,
  lessons: LessonContent[],
): Promise<VerificationPlan> {
  const { output } = await generateText({
    model,
    providerOptions: designProviderOptions(),
    output: Output.object({ schema: planSchema }),
    prompt: [
      "A course's Lessons make executable claims about code. Plan how to",
      "verify them in a fresh Linux sandbox with Node.js available. The",
      "sandbox starts empty: every file must be written by you.",
      "",
      `Topic: ${course.topic}`,
      `Goal: ${course.goal}`,
      `The final Exercise: ${JSON.stringify(spec.finalExercise)}`,
      "",
      "The Lessons' code and Exercises:",
      ...lessons.map((l) =>
        [
          `LESSON ${l.lessonId} "${l.title}"`,
          ...[...l.body, ...l.workedExample]
            .filter((b) => b.kind === "code")
            .map((b) => `[${(b as { language?: string }).language ?? "code"}]\n${(b as { code: string }).code}`),
          `EXERCISE: ${l.exercise.task} | CHECK: ${l.exercise.check}`,
        ].join("\n"),
      ),
      "",
      "Produce:",
      "- files: one entry per file the commands need, with the code taken",
      "  verbatim from the Lessons (small supporting glue is allowed).",
      "- commands: one shell line per claim to verify, with the Lesson it",
      "  belongs to and what a clean exit proves.",
      "",
      "Prefer plain `node file.js` runs. No network access. Return JSON only.",
    ].join("\n"),
  });

  if (!output) throw new GenerationError("The verification plan came back empty.");
  return output;
}

/** One command's outcome, kept verbatim as evidence. */
export type CommandEvidence = {
  run: string;
  lessonRef: string;
  proves: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type VerificationEvidence = {
  /** The files written before the commands ran. */
  written: { path: string; lessonRef: string }[];
  /** Every file present after the commands ran (created or changed). */
  files: string[];
  commands: CommandEvidence[];
};

export type VerificationResult = {
  passed: boolean;
  evidence: VerificationEvidence;
  /** The Lesson ids whose claims failed, for targeted findings. */
  failedLessonRefs: string[];
};

/**
 * The seam the real Sandbox provider and the test fake both implement:
 * create an isolated machine, write a file, run one command, list files,
 * and dispose. `create` receives no environment — the contract that keeps
 * production secrets out of the verification machine.
 */
export type SandboxProvider = {
  create: () => Promise<{
    writeFile: (path: string, content: string) => Promise<void>;
    run: (command: string) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
    listFiles: () => Promise<string[]>;
    dispose: () => Promise<void>;
    /** What the provider was created with; the tests assert on it. */
    createdWith?: unknown;
  }>;
};

/**
 * Runs the plan in the Sandbox and keeps the evidence. One failed command
 * does not stop the pass: every claim gets its verdict, so corrections
 * can target everything that failed at once.
 */
export async function runVerification(
  provider: SandboxProvider,
  plan: VerificationPlan,
): Promise<VerificationResult> {
  const sandbox = await provider.create();
  try {
    for (const file of plan.files) {
      await sandbox.writeFile(file.path, file.content);
    }

    const commands: CommandEvidence[] = [];
    for (const command of plan.commands) {
      const result = await sandbox.run(command.run);
      commands.push({
        run: command.run,
        lessonRef: command.lessonRef,
        proves: command.proves,
        exitCode: result.exitCode,
        stdout: result.stdout.slice(0, 4000),
        stderr: result.stderr.slice(0, 2000),
      });
    }

    const files = await sandbox.listFiles();

    const failedLessonRefs = [
      ...new Set(commands.filter((c) => c.exitCode !== 0).map((c) => c.lessonRef)),
    ];
    return {
      passed: failedLessonRefs.length === 0,
      evidence: { written: plan.files.map((f) => ({ path: f.path, lessonRef: f.lessonRef })), files, commands },
      failedLessonRefs,
    };
  } finally {
    await sandbox.dispose().catch(() => undefined);
  }
}

/** How a failed command reads as a review finding. */
export function verificationFindings(result: VerificationResult): {
  lessonRef: string;
  detail: string;
  correction: string;
}[] {
  return result.evidence.commands
    .filter((c) => c.exitCode !== 0)
    .map((c) => ({
      lessonRef: c.lessonRef,
      detail: `The command "${c.run}" exited with code ${c.exitCode}${
        c.stderr ? `: ${c.stderr.trim().slice(0, 300)}` : ""
      }. It was meant to prove: ${c.proves}`,
      correction: `Fix the Lesson's code so that "${c.run}" runs cleanly.`,
    }));
}
