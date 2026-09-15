/* Fixture content and scripted behaviour for the outline-review mock. Disposable. */

import type { PlanOperation, Turn } from "@/components/tailor-conversation";

export const TOPIC = "The Vercel AI SDK";
export const GOAL = "Build my own AI chat app";
export const DRAFTED_IN = "1m 52s";

export type MockLesson = { id: string; title: string; summary: string };
export type MockModule = { id: string; title: string; lessons: MockLesson[] };

export const MODULES: MockModule[] = [
  {
    id: "m1",
    title: "Foundations: Streaming Text from a Model",
    lessons: [
      {
        id: "l1",
        title: "Stream your first token",
        summary: "Install the SDK, wire an API key, and render an answer as it arrives.",
      },
      {
        id: "l2",
        title: "The shape of a conversation",
        summary: "Model a chat as messages, and read the parts a streamed answer is made of.",
      },
      {
        id: "l3",
        title: "Failures that keep the turn",
        summary: "Catch provider errors in the UI and retry the last message without losing it.",
      },
    ],
  },
  {
    id: "m2",
    title: "Tools: Letting the Model Do Something",
    lessons: [
      {
        id: "l4",
        title: "Define a tool the model can follow",
        summary: "Describe a tool, its parameters, and when the model should reach for it.",
      },
      {
        id: "l5",
        title: "Run the tool loop to an answer",
        summary: "Drive the multi-step loop and decide when there is nothing left to call.",
      },
    ],
  },
  {
    id: "m3",
    title: "Memory: Keeping Context Across Turns",
    lessons: [
      {
        id: "l6",
        title: "Store the conversation without losing parts",
        summary: "Persist messages so a reload keeps the thread exactly where it was.",
      },
      {
        id: "l7",
        title: "Summarize when the window fills",
        summary: "Compress old turns without dropping the facts the next answer needs.",
      },
    ],
  },
  {
    id: "m4",
    title: "The Interface: Streaming into React",
    lessons: [
      {
        id: "l8",
        title: "useChat and the parts it hands you",
        summary: "Render streamed message parts without re-implementing the protocol.",
      },
      {
        id: "l9",
        title: "Stop buttons and optimistic turns",
        summary: "Let the learner cut an answer short and keep the thread honest.",
      },
    ],
  },
  {
    id: "m5",
    title: "Beyond Text: Structure and Files",
    lessons: [
      {
        id: "l10",
        title: "Ask for JSON the schema can trust",
        summary: "Constrain structured output and handle the case where the model breaks it.",
      },
      {
        id: "l11",
        title: "Attach a document and let it read",
        summary: "Pass a file into the turn and cite what came out of it.",
      },
    ],
  },
  {
    id: "m6",
    title: "Shipping: Keys, Cost, and Failure",
    lessons: [
      {
        id: "l12",
        title: "Keep the key on the server",
        summary: "Move model calls behind a route handler and out of the browser.",
      },
      {
        id: "l13",
        title: "Cap the spend and watch the logs",
        summary: "Set a budget, read failures, and know what a bad day looks like.",
      },
    ],
  },
];

export const SOURCES = [
  {
    title: "AI SDK Core: Generating text",
    url: "https://sdk.vercel.ai/docs",
    domain: "sdk.vercel.ai",
  },
  { title: "Tool calling", url: "https://sdk.vercel.ai/docs/tools", domain: "sdk.vercel.ai" },
  { title: "OpenRouter model routing", url: "https://openrouter.ai/docs", domain: "openrouter.ai" },
  { title: "Streaming UI protocol", url: "https://ai-sdk.dev/docs", domain: "ai-sdk.dev" },
];

export const WHY = {
  terminalPerformances: [
    "Ship a chat route that streams tokens and survives a provider error.",
    "Give the model two tools and let it choose between them across a turn.",
    "Constrain one answer to a schema and validate it before it reaches the UI.",
  ],
  premise: "One running app grows from a single streamed reply to a tool-using assistant.",
  runningExample: "A support inbox that drafts, searches, and files as you chat.",
};

/* The Tailor the learner already talked to. The plan is live: accepting an
   operation and applying it mutates the register in place. */

export const TAILOR_TURNS: Turn[] = [
  {
    from: "learner",
    text: "I already know React. Don't spend a whole Lesson on the UI plumbing.",
  },
  {
    from: "tailor",
    text: "Then I would rewrite the plumbing Lesson down to the hook's contract and give the saved time to the tool loop. The plan below does that in three moves.",
  },
];

export type MockEffect =
  | { kind: "retitle"; lessonId: string; title: string; summary: string }
  | {
      kind: "add";
      moduleId: string;
      afterLessonId: string;
      title: string;
      summary: string;
    };

export type MockOperation = PlanOperation & { effect: MockEffect };

export const PLAN_ID = "plan-mock-1";

export const PLAN_OPERATIONS: MockOperation[] = [
  {
    id: "op-reframe",
    verb: "Rewrite",
    entry: "IV.1",
    detail:
      "“useChat and the parts it hands you” drops the plumbing — a fast pass over the hook's contract.",
    status: "proposed",
    effect: {
      kind: "retitle",
      lessonId: "l8",
      title: "useChat without the plumbing",
      summary: "The hook's contract for a React developer; the rendering details move to the docs.",
    },
  },
  {
    id: "op-retitle",
    verb: "Rewrite",
    entry: "VI.1",
    detail: "“Keep the key on the server” becomes “Ship the model call as a route handler”.",
    status: "proposed",
    effect: {
      kind: "retitle",
      lessonId: "l12",
      title: "Ship the model call as a route handler",
      summary: "Move model calls behind a route handler and out of the browser.",
    },
  },
  {
    id: "op-add",
    verb: "Add",
    entry: "II.3",
    detail: "A Lesson on streaming a tool result back into the turn.",
    status: "proposed",
    effect: {
      kind: "add",
      moduleId: "m2",
      afterLessonId: "l5",
      title: "Stream a tool result back into the turn",
      summary: "Render what a tool returned while the model keeps talking.",
    },
  },
];

/* No backend in the mock: an ask streams a canned reply and, once, adds one
   more move to the plan. */

export const SCRIPTED_REPLIES: { text: string; operation?: MockOperation }[] = [
  {
    text: "Done. I added one more move: a Lesson on rendering a tool result in the same turn, so the loop stays visible to the learner.",
    operation: {
      id: "op-add-2",
      verb: "Add",
      entry: "V.3",
      detail: "A Lesson on rendering a tool result without breaking the thread.",
      status: "proposed",
      effect: {
        kind: "add",
        moduleId: "m5",
        afterLessonId: "l11",
        title: "Render the tool result in place",
        summary: "Keep the thread readable when a tool answers mid-stream.",
      },
    },
  },
  {
    text: "That is everything I would change for that goal. Accept what you want and apply it.",
  },
];

export const START_DELAY_MS = 900;
export const LESSON_WRITE_MS = 1100;
