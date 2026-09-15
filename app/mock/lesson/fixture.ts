/* Fixture content and scripted replies for the lesson-reading mock.
   The Course is the one the generation mock writes, read back at the
   measure. Disposable. */

import type { ReadingBlock } from "@/lib/course/reading";
import { DOCS, GOAL, MODULES, TOPIC, type LessonDoc } from "../lesson-generation/fixture";

export { GOAL, TOPIC, type LessonDoc };

export type MockTurn = { from: "learner" | "tutor" | "tailor"; text: string };
export type MockThread = { id: string; anchor: string | null; turns: MockTurn[] };

/* A conversation kept for later. The margin shows one at a time; the rest
   wait behind Previous chats, named by the question that opened them.
   The Tailor's plan and published list belong to the chat that made them. */
export type MockChat = {
  id: string;
  title: string;
  date: string;
  threads: MockThread[];
  plan?: MockChange[];
  published?: MockRevision[];
};

export type MockModuleRow = {
  numeral: string;
  title: string;
  lessons: { id: string; title: string; summary: string; n: number }[];
};

const NUMERALS = ["I", "II", "III", "IV", "V", "VI"];

export const MODULE_ROWS: MockModuleRow[] = (() => {
  let n = 0;
  return MODULES.map((m, i) => ({
    numeral: NUMERALS[i] ?? String(i + 1),
    title: m.title,
    lessons: m.lessons.map((l) => ({ ...l, n: ++n })),
  }));
})();

export type MockLesson = {
  id: string;
  title: string;
  summary: string;
  n: number;
  moduleNumeral: string;
  moduleTitle: string;
  doc: LessonDoc;
};

export const LESSONS: MockLesson[] = MODULE_ROWS.flatMap((m) =>
  m.lessons.map((l) => ({
    ...l,
    moduleNumeral: m.numeral,
    moduleTitle: m.title,
    doc: DOCS[l.id],
  })),
);

export const TOTAL = LESSONS.length;

/* The open Lesson is the live one: the four before it are stamped. */
export const OPEN_ID = "l5";

export const DONE: Record<string, string> = {
  l1: "2 Sep 2026",
  l2: "4 Sep 2026",
  l3: "6 Sep 2026",
  l4: "9 Sep 2026",
};

/* The day the mock is read: stamps and fresh conversations land on it. */
export const TODAY = "14 Sep 2026";

/* Margins already written. Anchors are exact passages from the Lessons,
   so the margin can tie an answer back to its sentence in the article. */
export const THREADS: Record<string, MockThread[]> = {
  l2: [
    {
      id: "t-l2-1",
      anchor: "History is sent, not remembered.",
      turns: [
        {
          from: "learner",
          text: "If the history is sent every time, why does it feel like the model remembers my name?",
        },
        {
          from: "tutor",
          text: "Because your name is in the list you sent. Nothing was remembered — the whole thread rides along and the model reads it again on every call. That is also why the oldest turns fall out of the window first: they were never stored anywhere the model could keep them.",
        },
      ],
    },
  ],
  l5: [
    {
      id: "t-l5-1",
      anchor: "until it has nothing left to call",
      turns: [
        {
          from: "learner",
          text: "How do I know the loop is finished rather than just paused?",
        },
        {
          from: "tutor",
          text: "The finish reason tells you. A step that ends with `tool-calls` wants another pass; a step that ends with `stop` has produced the answer. Your loop can look the same either way — the ceiling exists only for the turn that never reaches `stop`.",
        },
      ],
    },
    {
      id: "t-l5-2",
      anchor: "stopWhen: stepCountIs(5),",
      turns: [
        {
          from: "learner",
          text: "Is five a sensible default, or a guess?",
        },
        {
          from: "tutor",
          text: "A guess worth naming. Three steps is what this example needs; five is what a turn you cannot predict is allowed to use. Once you know your tools, lower it — a loop whose shape you know should carry the smallest ceiling that still finishes.",
        },
      ],
    },
  ],
  l8: [
    {
      id: "t-l8-1",
      anchor: "without guessing where the boundaries are",
      turns: [
        {
          from: "learner",
          text: "Do I need `message.parts` if I only render text?",
        },
        {
          from: "tutor",
          text: "You can read the text directly while the thread is text-only. The moment one tool call or file enters the turn, a joined string hides where it belongs. Render the parts from the start and the day a tool appears is not a rewrite.",
        },
      ],
    },
  ],
};

/* The Tutor's earlier conversation about the open Lesson, displaced by
   starting a new one. */
export const TUTOR_CHATS: Record<string, MockChat[]> = {
  l5: [
    {
      id: "chat-l5-1",
      title: "Why does the loop need a ceiling at all?",
      date: "11 Sep 2026",
      threads: [
        {
          id: "t-l5-0",
          anchor: "stopWhen: stepCountIs(5),",
          turns: [
            {
              from: "learner",
              text: "Why does the loop need a ceiling at all?",
            },
            {
              from: "tutor",
              text: "Because the loop cannot tell a slow turn from a stuck one. `stop` ends the turn that finished; the ceiling ends the one that will not. Both are exits — the second is the one you set.",
            },
          ],
        },
      ],
    },
  ],
};

/* The mock's Tutor: two rules before the rotation, so a question about the
   open Lesson reads as an answer, and anything else still reads as help. */
const CANNED_LOOP =
  "The step ends when the response carries no tool call: `tool-calls` means another pass, `stop` means the text you have is the answer. The loop looks identical either way — the ceiling is only for the turn that never reaches `stop`, and it should be the smallest number that still lets your tools finish.";

const CANNED_TOOL =
  "The model never sees your function, only the description and the schema. Write the description as the moment to call it — “read the weather for one city” — and the schema as the shape you can actually execute. A vague description is why a tool fires at the wrong moment, or never fires at all.";

const CANNED = [
  "Read the passage with the call in mind: every helper in the SDK is a thin wrapper over the provider request, and the behaviour that surprises you is usually a default you never set. Drop one level and log the request — the shape of the answer is decided there.",
  "That is worth testing by hand once. Run the smallest version of the example, change one value, and watch the response — a five-line script teaches the rule faster than the paragraph describing it, and you will trust it because you saw it hold.",
  "The Lesson is describing the ordinary case, not the only one. When your situation differs, the SDK's own reference is the authority; the Course is the map, not the territory.",
];

export function replyFor(anchor: string | null, question: string, index: number): string {
  if (/step|loop|ceiling|stop|limit/i.test(question) || (anchor ?? "").includes("stepCountIs")) {
    return CANNED_LOOP;
  }
  if (/tool|call|description|schema/i.test(question)) return CANNED_TOOL;
  return CANNED[index % CANNED.length];
}

/* The Tailor's side: one exchange about structure, the plan it produced,
   and the revision already published before it. */
export type MockChange = {
  id: string;
  verb: string;
  entry: string;
  detail: string;
  status: "open" | "discarded";
};

export type MockRevision = { id: string; n: number; count: number };

export const TAILOR_THREADS: MockThread[] = [
  {
    id: "t-tailor-1",
    anchor: null,
    turns: [
      {
        from: "learner",
        text: "Module one carries too much. Move the failure Lesson to where the shipping work is, and add a Lesson on cancelling a stream.",
      },
      {
        from: "tailor",
        text: "That works. The failure Lesson sits better beside the keys and the budget, and cancelling lands after the optimistic turns. The Change plan is below — discard anything that does not match your Goal before you apply.",
      },
    ],
  },
];

export const TAILOR_PLAN: MockChange[] = [
  {
    id: "c1",
    verb: "move",
    entry: "Failures that keep the turn",
    detail: 'The Lesson moves into "Shipping: Keys, Cost, and Failure" at position 1.',
    status: "open",
  },
  {
    id: "c2",
    verb: "add",
    entry: "Stop a stream mid-flight",
    detail:
      'A new Lesson, "Stop a stream mid-flight": cut an answer short, keep the part that arrived, and leave the thread honest.',
    status: "open",
  },
  {
    id: "c3",
    verb: "rewrite",
    entry: "Run the tool loop to an answer",
    detail: "Lead with the finish reason; let the ceiling be the second thought.",
    status: "open",
  },
];

export const PUBLISHED: MockRevision[] = [{ id: "r1", n: 1, count: 2 }];

/* The Tailor's earlier Course-level conversation. */
export const TAILOR_CHATS: MockChat[] = [
  {
    id: "chat-tailor-1",
    title: "The Goal promises deployment, but no Lesson covers it. Can one be added?",
    date: "10 Sep 2026",
    threads: [
      {
        id: "t-tailor-0",
        anchor: null,
        turns: [
          {
            from: "learner",
            text: "The Goal promises deployment, but no Lesson covers it. Can one be added?",
          },
          {
            from: "tailor",
            text: "It can, and it costs one revision. Ask for it again and the Change plan will carry the new Lesson — nothing is written until you apply.",
          },
        ],
      },
    ],
  },
];

/* Both replies stay true whatever is asked: the fixture's plan is fixed, so
   the Tailor never promises a shape the plan below does not carry. */
const TAILOR_CANNED = [
  "Course-level changes belong here, not inside a Lesson. The Change plan below has what I propose — discard anything you do not want, then apply what is left.",
  "That is doable, and it costs one revision. I wrote the details into the Change plan below; nothing is written until you apply.",
];

export function tailorReplyFor(index: number): string {
  return TAILOR_CANNED[index % TAILOR_CANNED.length];
}

export function chunksOf(text: string): string[] {
  const words = text.split(" ");
  const pieces: string[] = [];
  for (let i = 0; i < words.length; i += 8) {
    pieces.push((i === 0 ? "" : " ") + words.slice(i, i + 8).join(" "));
  }
  return pieces;
}

export function blockText(block: ReadingBlock): string {
  if (block.kind === "p" || block.kind === "note") return block.text;
  if (block.kind === "code" || block.kind === "sql") {
    return [block.code, "caption" in block ? (block.caption ?? "") : ""].join(" ");
  }
  return [block.head.join(" "), ...block.rows.flat(), block.caption].join(" ");
}
