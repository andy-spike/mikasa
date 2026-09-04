// Candidate code runs in an isolated Sandbox with no environment: secrets never reach that machine.
import { generateText, Output } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { designProviderOptions } from "@/lib/model";
import { GenerationError } from "./generate";
import type { LessonContent } from "./content";
import type { CourseSpecification } from "./types";

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

export function needsCodeVerification(
  contract: { topic: string; goal: string },
  lessons: LessonContent[],
): boolean {
  const text = `${contract.topic} ${contract.goal}`.toLowerCase();
  if (CODING_MARKERS.some((marker) => text.includes(marker))) return true;
  return lessons.some((l) => [...l.body, ...l.workedExample].some((b) => b.kind === "code"));
}

const planSchema = z.object({
  files: z
    .array(
      z.object({
        path: z.string().min(1),
        content: z.string(),
        lessonRef: z.string(),
      }),
    )
    .min(1),
  commands: z
    .array(
      z.object({
        run: z.string().min(1),
        lessonRef: z.string(),
        proves: z.string().min(1),
      }),
    )
    .min(1),
});

export type VerificationPlan = z.infer<typeof planSchema>;

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
            .map(
              (b) =>
                `[${(b as { language?: string }).language ?? "code"}]\n${(b as { code: string }).code}`,
            ),
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

export type CommandEvidence = {
  run: string;
  lessonRef: string;
  proves: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type VerificationEvidence = {
  written: { path: string; lessonRef: string }[];
  files: string[];
  commands: CommandEvidence[];
};

export type VerificationResult = {
  passed: boolean;
  evidence: VerificationEvidence;
  failedLessonRefs: string[];
};

export type SandboxProvider = {
  create: () => Promise<{
    writeFile: (path: string, content: string) => Promise<void>;
    run: (command: string) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
    listFiles: () => Promise<string[]>;
    dispose: () => Promise<void>;
    createdWith?: unknown;
  }>;
};

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
      evidence: {
        written: plan.files.map((f) => ({ path: f.path, lessonRef: f.lessonRef })),
        files,
        commands,
      },
      failedLessonRefs,
    };
  } finally {
    await sandbox.dispose().catch(() => undefined);
  }
}

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
