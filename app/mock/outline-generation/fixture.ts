/* Fixture content and timing for the outline-generation mock. Disposable. */

export const TOPIC = "The Vercel AI SDK";
export const GOAL = "Build my own AI chat app";

export type Lesson = { title: string; summary: string };
export type Module = { numeral: string; title: string; lessons: Lesson[] };

export const MODULES: Module[] = [
  {
    numeral: "I",
    title: "Foundations: Streaming Text from a Model",
    lessons: [
      {
        title: "Stream your first token",
        summary: "Install the SDK, wire an API key, and render an answer as it arrives.",
      },
      {
        title: "The shape of a conversation",
        summary: "Model a chat as messages, and read the parts a streamed answer is made of.",
      },
      {
        title: "Failures that keep the turn",
        summary: "Catch provider errors in the UI and retry the last message without losing it.",
      },
    ],
  },
  {
    numeral: "II",
    title: "Tools: Letting the Model Do Something",
    lessons: [
      {
        title: "Define a tool the model can follow",
        summary: "Describe a tool, its parameters, and when the model should reach for it.",
      },
      {
        title: "Run the tool loop to an answer",
        summary: "Drive the multi-step loop and decide when there is nothing left to call.",
      },
    ],
  },
  {
    numeral: "III",
    title: "Memory: Keeping Context Across Turns",
    lessons: [
      {
        title: "Store the conversation without losing parts",
        summary: "Persist messages so a reload keeps the thread exactly where it was.",
      },
      {
        title: "Summarize when the window fills",
        summary: "Compress old turns without dropping the facts the next answer needs.",
      },
    ],
  },
  {
    numeral: "IV",
    title: "The Interface: Streaming into React",
    lessons: [
      {
        title: "useChat and the parts it hands you",
        summary: "Render streamed message parts without re-implementing the protocol.",
      },
      {
        title: "Stop buttons and optimistic turns",
        summary: "Let the learner cut an answer short and keep the thread honest.",
      },
    ],
  },
  {
    numeral: "V",
    title: "Beyond Text: Structure and Files",
    lessons: [
      {
        title: "Ask for JSON the schema can trust",
        summary: "Constrain structured output and handle the case where the model breaks it.",
      },
      {
        title: "Attach a document and let it read",
        summary: "Pass a file into the turn and cite what came out of it.",
      },
    ],
  },
  {
    numeral: "VI",
    title: "Shipping: Keys, Cost, and Failure",
    lessons: [
      {
        title: "Keep the key on the server",
        summary: "Move model calls behind a route handler and out of the browser.",
      },
      {
        title: "Cap the spend and watch the logs",
        summary: "Set a budget, read failures, and know what a bad day looks like.",
      },
    ],
  },
];

export const TOTAL_LESSONS = MODULES.reduce((n, m) => n + m.lessons.length, 0);

export const SOURCES = [
  { title: "AI SDK Core: Generating text", url: "https://sdk.vercel.ai/docs", domain: "sdk.vercel.ai" },
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

/* A scripted run so the mock loops through every state by itself:
   sources → outline drafting → connections → saving → ready. */
export const T = {
  sourcesReading: 2000,
  sourcesFound: 4500,
  outlineStart: 7000,
  outlineDrafting: 13000,
  connections: 40000,
  saving: 44000,
  ready: 48000,
} as const;

export const LOOP_MS = 54000;
export const LESSON_MS = 2500;
export const SOURCE_MS = 1400;
