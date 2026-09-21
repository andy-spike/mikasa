// Deterministic development data for checking the Courses library and Course pages.
//
// Usage:
//   pnpm db:seed
//   pnpm db:seed -- --email learner@example.com
//
// With one Learner in the development database, the email is optional. Rerunning
// this command replaces only the fixed synthetic Course ids below.
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed Courses in production.");
}

const connectionString = process.env.DATABASE_URL_DEV;
if (!connectionString) {
  throw new Error("DATABASE_URL_DEV is required. Add it to .env.local.");
}

type SeedStatus =
  | "ready"
  | "designing"
  | "awaiting-outline-approval"
  | "generating"
  | "reviewing"
  | "failed";

type SeedCourse = {
  topic: string;
  goal: string;
  status: SeedStatus;
  lessons?: number;
  done?: number;
  ageDays: number;
  touchedDays: number;
  depth?: "reach" | "working" | "mastery";
  plan?: "proposed" | "staged";
  failureStage?: "design" | "generation";
};

const DAY = 86_400_000;
const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const SYNTHETIC_COURSE_COUNT = 25;

const seeds: SeedCourse[] = [
  {
    topic: "TypeScript type narrowing",
    goal: "Model a checkout flow without unsafe casts",
    status: "ready",
    lessons: 6,
    done: 0,
    ageDays: 18,
    touchedDays: 0,
  },
  {
    topic: "PostgreSQL query plans",
    goal: "Find and fix a slow report query",
    status: "ready",
    lessons: 6,
    done: 1,
    ageDays: 32,
    touchedDays: 1,
    depth: "working",
  },
  {
    topic: "Drawing faces",
    goal: "Sketch a convincing portrait from reference",
    status: "ready",
    lessons: 6,
    done: 3,
    ageDays: 24,
    touchedDays: 2,
  },
  {
    topic: "Conversational Spanish",
    goal: "Handle a week of travel in Medellin",
    status: "ready",
    lessons: 6,
    done: 5,
    ageDays: 45,
    touchedDays: 3,
    depth: "working",
  },
  {
    topic: "Sourdough bread",
    goal: "Bake a reliable country loaf at home",
    status: "ready",
    lessons: 6,
    done: 6,
    ageDays: 70,
    touchedDays: 12,
  },
  {
    topic: "Color theory for interfaces",
    goal: "Build an accessible product palette",
    status: "ready",
    lessons: 4,
    done: 4,
    ageDays: 55,
    touchedDays: 28,
  },
  {
    topic: "Public speaking",
    goal: "Give a clear ten-minute technical talk",
    status: "ready",
    lessons: 8,
    done: 0,
    ageDays: 8,
    touchedDays: 4,
    depth: "mastery",
  },
  {
    topic: "Personal finance",
    goal: "Set up a simple monthly money system",
    status: "ready",
    lessons: 4,
    done: 2,
    ageDays: 20,
    touchedDays: 5,
  },
  {
    topic: "Fingerstyle guitar",
    goal: "Play one complete arrangement cleanly",
    status: "ready",
    lessons: 8,
    done: 7,
    ageDays: 90,
    touchedDays: 6,
    depth: "mastery",
  },
  {
    topic: "Balcony gardening",
    goal: "Grow herbs in a small sunny space",
    status: "ready",
    lessons: 4,
    done: 1,
    ageDays: 16,
    touchedDays: 7,
  },
  {
    topic: "Distributed systems",
    goal: "Design a durable background job runner",
    status: "ready",
    lessons: 8,
    done: 3,
    ageDays: 38,
    touchedDays: 8,
    depth: "mastery",
  },
  {
    topic: "Typography for the web",
    goal: "Typeset a readable long-form article",
    status: "ready",
    lessons: 6,
    done: 2,
    ageDays: 15,
    touchedDays: 9,
  },
  {
    topic: "React Native navigation",
    goal: "Ship a small app with nested navigation",
    status: "ready",
    lessons: 4,
    done: 0,
    ageDays: 11,
    touchedDays: 10,
  },
  {
    topic: "Probability for product decisions",
    goal: "Reason about uncertain experiment results",
    status: "ready",
    lessons: 6,
    done: 4,
    ageDays: 42,
    touchedDays: 11,
    depth: "working",
  },
  {
    topic: "Manual coffee brewing",
    goal: "Dial in a balanced pour-over",
    status: "ready",
    lessons: 4,
    done: 3,
    ageDays: 29,
    touchedDays: 13,
  },
  {
    topic: "Information architecture",
    goal: "Reorganize a crowded settings area",
    status: "ready",
    lessons: 6,
    done: 2,
    ageDays: 26,
    touchedDays: 0,
    plan: "proposed",
  },
  {
    topic: "Node.js streams",
    goal: "Process a large upload with bounded memory",
    status: "ready",
    lessons: 6,
    done: 4,
    ageDays: 30,
    touchedDays: 1,
    plan: "staged",
  },
  {
    topic: "Digital photography",
    goal: "Control exposure without automatic mode",
    status: "designing",
    ageDays: 0,
    touchedDays: 0,
  },
  {
    topic: "Korean home cooking",
    goal: "Cook a weeknight meal with three side dishes",
    status: "designing",
    ageDays: 1,
    touchedDays: 0,
  },
  {
    topic: "CSS container queries",
    goal: "Build a card that adapts to its parent",
    status: "awaiting-outline-approval",
    lessons: 4,
    ageDays: 2,
    touchedDays: 0,
  },
  {
    topic: "Writing short fiction",
    goal: "Finish a polished 2,000-word story",
    status: "awaiting-outline-approval",
    lessons: 8,
    ageDays: 6,
    touchedDays: 2,
    depth: "mastery",
  },
  {
    topic: "Web accessibility testing",
    goal: "Audit and repair a checkout form",
    status: "generating",
    lessons: 6,
    ageDays: 3,
    touchedDays: 0,
  },
  {
    topic: "Docker image hardening",
    goal: "Build a smaller production image",
    status: "reviewing",
    lessons: 6,
    ageDays: 4,
    touchedDays: 0,
  },
  {
    topic: "Watercolor landscapes",
    goal: "Paint a simple mountain scene",
    status: "failed",
    ageDays: 5,
    touchedDays: 1,
    failureStage: "design",
  },
  {
    topic: "OAuth for web apps",
    goal: "Add a secure sign-in flow",
    status: "failed",
    lessons: 6,
    ageDays: 9,
    touchedDays: 2,
    failureStage: "generation",
  },
];

if (seeds.length !== SYNTHETIC_COURSE_COUNT) {
  throw new Error(`Expected ${SYNTHETIC_COURSE_COUNT} synthetic Courses, found ${seeds.length}.`);
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function courseId(index: number): string {
  return `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

function makeOutline(topic: string, lessonCount: number) {
  const moduleCount = Math.ceil(lessonCount / 2);
  let lessonNumber = 0;
  return {
    modules: Array.from({ length: moduleCount }, (_, moduleIndex) => {
      const remaining = lessonCount - lessonNumber;
      const count = Math.min(2, remaining);
      const moduleNumber = moduleIndex + 1;
      return {
        id: `m${moduleNumber}`,
        ordinal: moduleNumber,
        numeral: NUMERALS[moduleIndex],
        title:
          moduleIndex === 0
            ? "Foundations"
            : moduleIndex === moduleCount - 1
              ? "Putting it together"
              : `Practice ${moduleNumber - 1}`,
        lessons: Array.from({ length: count }, () => {
          lessonNumber += 1;
          return {
            id: `l${lessonNumber}`,
            ordinal: lessonNumber,
            title:
              lessonNumber === 1
                ? `A first model of ${topic}`
                : lessonNumber === lessonCount
                  ? "Complete the final result"
                  : `Practice step ${lessonNumber - 1}`,
            summary: `A synthetic Lesson used to inspect Course state ${lessonNumber}.`,
            minutes: 10 + (lessonNumber % 4) * 5,
          };
        }),
      };
    }),
  };
}

function makeSpecification(seed: SeedCourse, outline: ReturnType<typeof makeOutline>) {
  const lessonRows = outline.modules.flatMap((module) => module.lessons);
  return {
    contract: {
      topic: seed.topic,
      goal: seed.goal,
      background: "This is synthetic development data.",
      depth: seed.depth ?? "reach",
      language: "en",
      terminalPerformances: [seed.goal],
      exclusions: [],
      learnerAssumptions: [],
    },
    throughline: {
      premise: `Each Lesson moves toward this result: ${seed.goal}`,
      runningExample: `One continuing ${seed.topic} example`,
      vocabulary: [],
    },
    learningGraph: lessonRows.map((lesson, index) => ({
      id: `skill-${lesson.id}`,
      skill: lesson.title,
      requires: index === 0 ? [] : [`skill-${lessonRows[index - 1].id}`],
      lessonId: lesson.id,
    })),
    alignment: lessonRows.map((lesson, index) => ({
      lessonId: lesson.id,
      performance: `Complete practice step ${index + 1}`,
      prerequisiteNodes: index === 0 ? [] : [`skill-${lessonRows[index - 1].id}`],
      moduleMilestone: `Milestone for ${lesson.title}`,
      exerciseContribution: `Practice ${lesson.title.toLowerCase()}`,
      exampleStart: `Example state ${index}`,
      exampleEnd: `Example state ${index + 1}`,
      sourceRefs: [],
    })),
    finalExercise: {
      task: seed.goal,
      acceptanceChecks: ["The result is complete and can be explained."],
    },
    evidence: [],
  };
}

function lessonContent(seed: SeedCourse, lesson: { id: string; title: string }, index: number) {
  return {
    body: [
      {
        kind: "p",
        text: `This synthetic Lesson introduces ${lesson.title.toLowerCase()} for ${seed.topic}.`,
      },
      {
        kind: "p",
        text: `Use it as practice toward the Goal: ${seed.goal}.`,
      },
      {
        kind: "note",
        title: "Development fixture",
        text: "This content exists to make the reading view usable without running generation.",
      },
    ],
    workedExample: [
      {
        kind: "p",
        text: `Worked example ${index + 1}: apply the idea once, then inspect the result.`,
      },
    ],
    recallPrompt: `What is the main idea in ${lesson.title}?`,
    selfExplanationPrompt: "Explain how this Lesson changes the running example.",
    exercise: {
      task: `Complete one small practice for ${lesson.title.toLowerCase()}.`,
      check: "You can describe what changed and why.",
    },
    bridge: "The next Lesson adds one more part to the same result.",
  };
}

const sql = postgres(connectionString, { max: 1 });

try {
  const requestedEmail = argument("--email");
  const learners = requestedEmail
    ? await sql`select id, name, email from users where email = ${requestedEmail}`
    : await sql`select id, name, email from users order by created_at`;

  if (learners.length === 0) {
    throw new Error(
      requestedEmail
        ? `No Learner has the email ${requestedEmail}.`
        : "No Learners exist. Sign in once, then run the seed again.",
    );
  }
  if (!requestedEmail && learners.length > 1) {
    const emails = learners.map((learner) => learner.email).join(", ");
    throw new Error(`More than one Learner exists. Pass --email with one of: ${emails}`);
  }

  const learner = learners[0];
  const now = new Date();

  await sql.begin(async (tx) => {
    for (let index = 0; index < seeds.length; index += 1) {
      await tx`delete from courses where id = ${courseId(index)} and owner_id = ${learner.id}`;
    }

    for (let index = 0; index < seeds.length; index += 1) {
      const seed = seeds[index];
      const id = courseId(index);
      const createdAt = new Date(now.getTime() - seed.ageDays * DAY);
      const updatedAt = new Date(now.getTime() - seed.touchedDays * DAY);
      const lessonCount = seed.lessons ?? 0;
      const outline = lessonCount > 0 ? makeOutline(seed.topic, lessonCount) : null;
      const published = seed.status === "ready";
      const completed = published && (seed.done ?? 0) === lessonCount;

      await tx`
        insert into courses (
          id, owner_id, topic, goal, background, language, depth, grounding,
          status, completed_at, created_at, updated_at
        ) values (
          ${id}, ${learner.id}, ${seed.topic}, ${seed.goal},
          ${"This is synthetic development data."}, ${"en"}, ${seed.depth ?? "reach"},
          ${index % 3 !== 0}, ${seed.status}, ${completed ? updatedAt : null},
          ${createdAt}, ${updatedAt}
        )
      `;

      if (outline) {
        await tx`
          insert into outlines (course_id, version, data, created_at)
          values (${id}, 1, ${tx.json(outline)}, ${createdAt})
        `;
        await tx`
          insert into course_specs (course_id, spec, outline_version, created_at)
          values (${id}, ${tx.json(makeSpecification(seed, outline))}, 1, ${createdAt})
        `;
      }

      if (seed.status === "designing" || seed.failureStage === "design") {
        const failed = seed.failureStage === "design";
        const [run] = await tx`
          insert into design_runs (
            course_id, status, current_step, error, started_at, updated_at
          ) values (
            ${id}, ${failed ? "failed" : "running"}, ${failed ? "outline" : "sources"},
            ${failed ? "The synthetic Source step stopped before the Outline was ready." : null},
            ${createdAt}, ${updatedAt}
          ) returning id
        `;
        if (!failed) {
          await tx`
            insert into design_events (course_id, run_id, kind, message, created_at)
            values (
              ${id}, ${run.id}, ${"progress"},
              ${index % 2 === 0 ? "Reading the available Sources." : "Sketching the first Modules."},
              ${updatedAt}
            )
          `;
        }
      }

      const hasGenerationRun =
        seed.status === "generating" ||
        seed.status === "reviewing" ||
        seed.failureStage === "generation";
      if (hasGenerationRun) {
        const failed = seed.failureStage === "generation";
        await tx`
          insert into generation_runs (
            course_id, outline_version, status, current_step, fragments_status,
            error, started_at, updated_at
          ) values (
            ${id}, 1, ${failed ? "failed" : "running"},
            ${seed.status === "reviewing" ? "review" : "lessons"}, ${"pending"},
            ${failed ? "The synthetic Lesson run stopped while writing Lesson 4." : null},
            ${createdAt}, ${updatedAt}
          )
        `;
      }

      const needsLessons =
        outline && (published || seed.status === "reviewing" || seed.failureStage === "generation");
      if (needsLessons && outline) {
        const lessonRows = outline.modules.flatMap((module) => module.lessons);
        const rowsToWrite =
          seed.failureStage === "generation" ? lessonRows.slice(0, 3) : lessonRows;
        for (let lessonIndex = 0; lessonIndex < rowsToWrite.length; lessonIndex += 1) {
          const lesson = rowsToWrite[lessonIndex];
          const content = lessonContent(seed, lesson, lessonIndex);
          await tx`
            insert into lessons (
              course_id, outline_version, lesson_ref, title, body, worked_example,
              recall_prompt, self_explanation_prompt, exercise, bridge, created_at, updated_at
            ) values (
              ${id}, 1, ${lesson.id}, ${lesson.title}, ${tx.json(content.body)},
              ${tx.json(content.workedExample)}, ${content.recallPrompt},
              ${content.selfExplanationPrompt}, ${tx.json(content.exercise)}, ${content.bridge},
              ${createdAt}, ${updatedAt}
            )
          `;
        }
      }

      if (published && outline) {
        await tx`
          insert into revisions (course_id, revision_number, outline_version, published_at)
          values (${id}, 1, 1, ${createdAt})
        `;
        const lessonRows = outline.modules.flatMap((module) => module.lessons);
        for (let doneIndex = 0; doneIndex < (seed.done ?? 0); doneIndex += 1) {
          const doneAt = new Date(updatedAt.getTime() - ((seed.done ?? 0) - doneIndex - 1) * DAY);
          await tx`
            insert into completions (course_id, lesson_ref, done_at)
            values (${id}, ${lessonRows[doneIndex].id}, ${doneAt})
          `;
        }
      }

      if (seed.plan && outline) {
        const [plan] = await tx`
          insert into change_plans (
            course_id, base_outline_version, base_revision_number, status,
            staged_outline_version, touched_lessons, touched_modules,
            regenerated_lessons, created_at, updated_at
          ) values (
            ${id}, 1, 1, ${seed.plan}, ${seed.plan === "staged" ? 2 : null},
            ${seed.plan === "staged" ? tx.json(["l2"]) : null},
            ${seed.plan === "staged" ? tx.json([]) : null},
            ${seed.plan === "staged" ? tx.json(["l2"]) : null},
            ${updatedAt}, ${updatedAt}
          ) returning id
        `;
        const operations = [
          {
            kind: "lessonProse",
            lessonId: "l2",
            instruction: "Add one concrete example before the Exercise.",
          },
          {
            kind: "exercise",
            lessonId: "l3",
            task: "Try the idea on a fresh example.",
            check: "Explain why the result meets the Goal.",
          },
          {
            kind: "renameLesson",
            lessonId: "l4",
            title: "Test the complete approach",
            summary: "Check the approach under realistic conditions.",
          },
        ];
        for (let operationIndex = 0; operationIndex < operations.length; operationIndex += 1) {
          const operation = operations[operationIndex];
          await tx`
            insert into change_operations (plan_id, position, kind, payload, status, created_at)
            values (
              ${plan.id}, ${operationIndex}, ${operation.kind}, ${tx.json(operation)},
              ${seed.plan === "staged" ? "accepted" : "proposed"}, ${updatedAt}
            )
          `;
        }

        if (seed.plan === "staged") {
          await tx`
            insert into outlines (course_id, version, data, created_at)
            values (${id}, 2, ${tx.json(outline)}, ${updatedAt})
          `;
          await tx`
            insert into generation_runs (
              course_id, outline_version, status, current_step, fragments_status,
              started_at, updated_at
            ) values (${id}, 2, ${"running"}, ${"lessons"}, ${"pending"}, ${updatedAt}, ${updatedAt})
          `;
        }
      }
    }
  });

  const summary = await sql`
    select status, count(*)::int as count
    from courses
    where owner_id = ${learner.id}
      and id in ${sql(seeds.map((_, index) => courseId(index)))}
    group by status
    order by status
  `;
  console.log(`Seeded ${seeds.length} synthetic Courses for ${learner.name} <${learner.email}>.`);
  for (const row of summary) console.log(`  ${row.status}: ${row.count}`);
} finally {
  await sql.end();
}
