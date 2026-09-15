/* Fixture content and scripted timing for the lesson-generation mock. Disposable. */

import type { ReadingBlock } from "@/lib/course/reading";

export const TOPIC = "The Vercel AI SDK";
export const GOAL = "Build my own AI chat app";

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

export const TOTAL_LESSONS = MODULES.reduce((n, m) => n + m.lessons.length, 0);

export type LessonDoc = {
  /* explanation and worked example, in reading order */
  body: ReadingBlock[];
  recall: string;
  explain: string;
  bridge: string;
  exercise: { task: string; check: string };
  /* the corrected page, once the check has fixed a finding on this Lesson */
  correctedBody?: ReadingBlock[];
};

export const DOCS: Record<string, LessonDoc> = {
  l1: {
    body: [
      {
        kind: "p",
        text: "A streamed answer arrives in pieces. The SDK hands you those pieces as an async iterable, so the first words can reach the learner while the model is still speaking.",
      },
      {
        kind: "code",
        language: "ts",
        code: `import { streamText } from "ai";

const result = streamText({
  model: openrouter("google/gemini-2.5-flash"),
  prompt: "Explain streaming in two sentences.",
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}`,
        caption: "Every chunk is written the moment it arrives.",
      },
      {
        kind: "p",
        text: "Nothing about the request is different from a blocking call. What changes is when the answer becomes visible: the loop writes each chunk instead of waiting for the finished string.",
      },
    ],
    recall: "At what moment does the first chunk leave the model?",
    explain: "Why does streaming change when the answer is seen, not what the answer is?",
    bridge:
      "One stream is the smallest turn. The next Lesson is what happens when a turn has history.",
    exercise: {
      task: "Call `streamText` from a script and write every chunk to the terminal as it arrives.",
      check:
        "The output appears in several pieces, in order, with no final string assembled first.",
    },
  },
  l2: {
    body: [
      {
        kind: "p",
        text: "The model keeps no memory between calls. A conversation is a list the caller sends every time: each message has a role and a content, and the order is the thread.",
      },
      {
        kind: "code",
        language: "ts",
        code: `const { text } = await generateText({
  model: openrouter("google/gemini-2.5-flash"),
  messages: [
    { role: "user", content: "What is a token?" },
    { role: "assistant", content: "A token is a piece of text." },
    { role: "user", content: "And a stream?" },
  ],
});`,
        caption: "History is sent, not remembered.",
      },
      {
        kind: "p",
        text: "In a streamed answer the parts are not only text: a tool call, a finish signal, and a refusal all arrive through the same stream, each with its own type.",
      },
    ],
    recall: "Where does the conversation live between two calls to the model?",
    explain: "Why is a message list a better model of a chat than one growing string?",
    bridge:
      "A list of messages can be resent. The next Lesson is what to do when that resend fails mid-answer.",
    exercise: {
      task: "Send a three-message history with `generateText` and print the answer.",
      check:
        "The answer responds to the last message and the earlier turns are visibly in the request.",
    },
  },
  l3: {
    body: [
      {
        kind: "p",
        text: "A provider can fail after the first chunk has rendered. The stream ends with an error, and the learner is left with half an answer and no way to ask again.",
      },
      {
        kind: "code",
        language: "ts",
        code: `try {
  for await (const chunk of result.textStream) {
    render(chunk);
  }
} catch (error) {
  // The turn stopped mid-answer.
  await retryLastMessage();
}`,
        caption: "Catch the stream, keep the message.",
      },
      {
        kind: "p",
        text: "Keep the learner's last message in the thread while the retry runs. An error that erases what was typed makes the failure the learner remembers.",
      },
    ],
    recall: "What should happen to the last message when a stream fails?",
    explain: "Why is retrying the last message better than starting the turn over?",
    bridge:
      "Turns survive failures now. The next Module gives the model something to do besides talk.",
    exercise: {
      task: "Make the provider fail on purpose and catch it in the UI.",
      check:
        "The partial answer stays, the last message is still there, and a retry continues from it.",
    },
  },
  l4: {
    body: [
      {
        kind: "p",
        text: "A tool is a function the model may ask you to run. You describe it in the request: a name, what it does, and a schema for its arguments.",
      },
      {
        kind: "code",
        language: "ts",
        code: `const weather = tool({
  description: "Read the weather for one city.",
  inputSchema: z.object({ city: z.string() }),
  execute: async ({ city }) => readWeather(city),
});`,
        caption: "One description, one schema, one function.",
      },
      {
        kind: "p",
        text: "The description is the model's documentation. When it is vague, the model calls the tool at the wrong moment — or never calls it at all.",
      },
    ],
    recall: "What does the model actually see of a tool?",
    explain: "Why does the description decide when the model reaches for the tool?",
    bridge: "A tool the model can call is half the loop. The next Lesson closes it.",
    exercise: {
      task: "Describe one tool of your own and pass it to `streamText`.",
      check: "The model asks for the tool when the request needs it and ignores it otherwise.",
    },
  },
  l5: {
    body: [
      {
        kind: "p",
        text: "One tool call is not an answer. The result goes back into the conversation and the model speaks again, until it has nothing left to call.",
      },
      {
        kind: "code",
        language: "ts",
        code: `const result = streamText({
  model: openrouter("google/gemini-2.5-flash"),
  messages,
  tools: { weather, search },
  stopWhen: stepCountIs(5),
});`,
        caption: "A ceiling on the loop before it runs.",
      },
      {
        kind: "p",
        text: "Decide the ceiling before the loop starts. An unbounded loop is a bill with no floor, and the answer rarely improves after the third step.",
      },
    ],
    recall: "How does the loop know it is finished?",
    explain: "Why does the loop need a ceiling decided in advance?",
    bridge: "The loop ends. The next Module keeps what it said, across turns and across reloads.",
    exercise: {
      task: "Give the model two tools and a step ceiling, then run a turn that uses both.",
      check:
        "The loop stops on its own after the last tool call and the final text arrives without another call.",
    },
    correctedBody: [
      {
        kind: "p",
        text: "One tool call is not an answer. The result goes back into the conversation and the model speaks again, until it has nothing left to call.",
      },
      {
        kind: "code",
        language: "ts",
        code: `const result = streamText({
  model: openrouter("google/gemini-2.5-flash"),
  messages,
  tools: { weather, search },
  stopWhen: stepCountIs(5),
});

// step 1: the model calls weather
// step 2: the result is in, the model calls search
// step 3: no calls left — the answer streams`,
        caption: "The loop closing, step by step.",
      },
      {
        kind: "p",
        text: "Decide the ceiling before the loop starts. An unbounded loop is a bill with no floor, and the answer rarely improves after the third step.",
      },
    ],
  },
  l6: {
    body: [
      {
        kind: "p",
        text: "A thread that lives only in React state disappears on reload. Store the messages, not the rendered text, so every part survives the round trip.",
      },
      {
        kind: "code",
        language: "ts",
        code: `await db.insert(messages).values({
  id: turn.id,
  role: turn.role,
  parts: turn.parts, // text, tool calls, files
});`,
        caption: "Parts in, parts out.",
      },
      {
        kind: "p",
        text: "Saving only the text throws away the tool calls and files that produced it, and the thread cannot be replayed or continued honestly.",
      },
    ],
    recall: "Which half of a message must reach the database?",
    explain: "Why does storing the text alone break the thread on reload?",
    bridge:
      "The thread survives a reload. The next Lesson is what happens when it grows too long to send.",
    exercise: {
      task: "Reload a thread from storage and render it without sending a new request.",
      check: "The same turns appear in the same order, tool calls included.",
    },
  },
  l7: {
    body: [
      {
        kind: "p",
        text: "Every request resends the whole thread, and the window is finite. When the history outgrows it, something has to shrink without losing what the next answer needs.",
      },
      {
        kind: "code",
        language: "ts",
        code: `const recent = messages.slice(-8);
const older = await summarize(messages.slice(0, -8));

const sent = [summaryMessage(older), ...recent];`,
        caption: "Keep the tail exact, compress the head.",
      },
      {
        kind: "p",
        text: "Summaries are for context, not for facts the learner is using. Keep the last turns verbatim, and keep the running facts as structured notes rather than prose.",
      },
    ],
    recall: "Which part of the history must stay exact?",
    explain: "Why is a summary the wrong place to keep a fact the learner just used?",
    bridge:
      "The context has a floor now. The next Module puts the whole loop in front of the learner.",
    exercise: {
      task: "Send a long thread with the head summarized and the last turns exact.",
      check:
        "The answer still knows the recent turns word for word and the earlier context well enough to stay on topic.",
    },
  },
  l8: {
    body: [
      {
        kind: "p",
        text: "`useChat` owns the transport. It sends the turn, tracks the streaming state, and hands you messages — each one a list of parts, each part with a type.",
      },
      {
        kind: "code",
        language: "tsx",
        code: `const { messages, sendMessage } = useChat();

messages.map((message) =>
  message.parts.map((part) =>
    part.type === "text" ? <p>{part.text}</p> : null,
  ),
);`,
        caption: "Render parts, not strings.",
      },
      {
        kind: "p",
        text: "Because the protocol labels each part, a tool call and a file can render beside the text without guessing where the boundaries are.",
      },
    ],
    recall: "What does a message hold besides its text?",
    explain: "Why is rendering parts safer than rendering one concatenated string?",
    bridge: "The thread renders itself. The next Lesson lets the learner interrupt it.",
    exercise: {
      task: "Render a streamed thread with `useChat`, one element per part.",
      check: "Text, a tool call, and a file each render in their own place, in order.",
    },
    correctedBody: [
      {
        kind: "p",
        text: "A message from `useChat` is a list of parts, not a string: text, tool calls, and files each arrive with a type. Render the parts and you never parse the protocol yourself.",
      },
      {
        kind: "p",
        text: "`useChat` owns the transport. It sends the turn, tracks the streaming state, and hands you messages — each one a list of parts, each part with a type.",
      },
      {
        kind: "code",
        language: "tsx",
        code: `const { messages, sendMessage } = useChat();

messages.map((message) =>
  message.parts.map((part) =>
    part.type === "text" ? <p>{part.text}</p> : null,
  ),
);`,
        caption: "Render parts, not strings.",
      },
      {
        kind: "p",
        text: "Because the protocol labels each part, a tool call and a file can render beside the text without guessing where the boundaries are.",
      },
    ],
  },
  l9: {
    body: [
      {
        kind: "p",
        text: "A long answer is not always the wanted one. Stopping the stream keeps what has already arrived and hands the thread back to the learner.",
      },
      {
        kind: "code",
        language: "tsx",
        code: `const { stop, status } = useChat();

<button onClick={stop} disabled={status !== "streaming"}>
  Stop
</button>`,
        caption: "Stop the stream, keep the partial answer.",
      },
      {
        kind: "p",
        text: "Optimistic turns show the learner's next message the instant it is sent. If the request fails, the turn is rolled back rather than shown as sent.",
      },
    ],
    recall: "What happens to the text already rendered when the stream stops?",
    explain: "Why does an optimistic turn need a rollback path?",
    bridge:
      "The learner can interrupt. The next Module asks the model for something stricter than prose.",
    exercise: {
      task: "Add a stop control and send a follow-up while the stopped answer is still on screen.",
      check: "The partial answer stays in the thread and the follow-up continues from it.",
    },
  },
  l10: {
    body: [
      {
        kind: "p",
        text: "Some answers must fit a shape. A schema constrains the output before it is parsed, so the UI receives an object it can trust instead of text it must coax.",
      },
      {
        kind: "code",
        language: "ts",
        code: `const { object } = await generateObject({
  model: openrouter("google/gemini-2.5-flash"),
  schema: z.object({
    title: z.string(),
    tags: z.array(z.string()),
  }),
  prompt: "Label this support ticket.",
});`,
        caption: "The schema is the contract.",
      },
      {
        kind: "p",
        text: "A schema narrows what the model can say, not what it knows. When the request needs judgement, ask for it in a field rather than in more prose.",
      },
    ],
    recall: "When does the object get validated?",
    explain: "Why does a schema improve reliability more than a careful prompt alone?",
    bridge: "Text and objects arrive now. The next Lesson sends something in.",
    exercise: {
      task: "Extract a title and tags from a paragraph with `generateObject`.",
      check:
        "The result is typed, validated, and rejects a malformed model answer instead of rendering it.",
    },
  },
  l11: {
    body: [
      {
        kind: "p",
        text: "A file enters a turn like any other part. The provider reads it, and the answer can cite what it found instead of paraphrasing from memory.",
      },
      {
        kind: "code",
        language: "ts",
        code: `const { text } = await generateText({
  model: openrouter("google/gemini-2.5-flash"),
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "What does the contract say?" },
        { type: "file", data: pdf, mediaType: "application/pdf" },
      ],
    },
  ],
});`,
        caption: "One part among many.",
      },
      {
        kind: "p",
        text: "Cite the passage the answer came from. A claim without a citation is a claim the learner cannot check.",
      },
    ],
    recall: "How does a file differ from a pasted paragraph in the thread?",
    explain: "Why should an answer over a document cite the page it used?",
    bridge: "The model reads now. The last Module is what it costs, and who holds the key.",
    exercise: {
      task: "Attach a PDF and ask a question whose answer names the page.",
      check:
        "The answer quotes or cites the page it came from, and the file part persists in the thread.",
    },
  },
  l12: {
    body: [
      {
        kind: "p",
        text: "The API key is the whole account. If it reaches the browser, anyone with the page can spend your budget, so the model call lives behind a route handler and the key stays on the server.",
      },
      {
        kind: "code",
        language: "tsx",
        code: `// components/chat.tsx  ← wrong
const response = await fetch("/api/chat", {
  headers: {
    Authorization: \`Bearer \${process.env.NEXT_PUBLIC_OPENROUTER_KEY}\`,
  },
});`,
        caption: "The key in the bundle is a key given away.",
      },
      {
        kind: "p",
        text: "A route handler is the only place the key is read. The client sends messages; it never sends credentials.",
      },
    ],
    recall: "Where is the only place the key may be read?",
    explain: "Why does a `NEXT_PUBLIC_` prefix turn a secret into published text?",
    bridge: "The key is safe. The last Lesson is what happens when the bill arrives anyway.",
    exercise: {
      task: "Move the model call into a route handler and delete the key from the client.",
      check: "The browser bundle contains no key and the chat still streams.",
    },
    correctedBody: [
      {
        kind: "p",
        text: "The API key is the whole account. If it reaches the browser, anyone with the page can spend your budget, so the model call lives behind a route handler and the key stays on the server.",
      },
      {
        kind: "code",
        language: "ts",
        code: `// app/api/chat/route.ts
export async function POST(request: Request) {
  const { messages } = await request.json();

  const result = streamText({
    model: openrouter("google/gemini-2.5-flash"),
    messages,
  });

  return result.toUIMessageStreamResponse();
}`,
        caption: "The key is read here and nowhere else.",
      },
      {
        kind: "p",
        text: "The client sends messages to the handler and never holds credentials. A `NEXT_PUBLIC_` prefix would put the key in the bundle for anyone to read.",
      },
    ],
  },
  l13: {
    body: [
      {
        kind: "p",
        text: "Every turn has a price, and a loop with tools multiplies it. A budget set before launch turns an outage into a bad afternoon instead of a disaster.",
      },
      {
        kind: "code",
        language: "ts",
        code: `const result = streamText({
  model: openrouter("google/gemini-2.5-flash"),
  messages,
  maxOutputTokens: 1200,
  stopWhen: stepCountIs(5),
});`,
        caption: "Two ceilings: tokens per answer, steps per turn.",
      },
      {
        kind: "p",
        text: "Read the failures, not only the successes. A rising error rate and a falling answer length usually arrive before the invoice does.",
      },
    ],
    recall: "Which two ceilings does one turn carry?",
    explain: "Why does a tool loop change the cost of a turn more than a longer answer does?",
    bridge:
      "That is the whole Course. You have a chat app that streams, remembers, reaches for tools, and fails honestly.",
    exercise: {
      task: "Set a token ceiling and a step ceiling, then read one day of failures from the logs.",
      check: "A runaway turn stops at the ceiling and the log names which ceiling it hit.",
    },
  },
};

export type Finding = {
  id: string;
  lessonRef: string;
  kind: "structural" | "factual";
  text: string;
};

/* The check's findings, in correction order (reading order). */
export const FINDINGS: Finding[] = [
  {
    id: "f1",
    lessonRef: "l5",
    kind: "factual",
    text: "The worked example stops before the loop closes — the second call is described but never shown.",
  },
  {
    id: "f2",
    lessonRef: "l8",
    kind: "structural",
    text: "`useChat` is used before it is introduced; the `parts` shape needs one sentence up front.",
  },
  {
    id: "f3",
    lessonRef: "l12",
    kind: "factual",
    text: "The code sample reads the key in the browser, against the Lesson's own rule.",
  },
];

/* The scripted run: writing, the check, the corrections, the re-check, publish. */
export const WRITE_MS = 1900;
export const CHECK_MS = 9000;
export const CORRECT_MS = 2200;
/* A correction lands before its window ends, so the fixed page holds a beat
   at the measure before the run turns to the next finding. */
export const CORRECT_LAND_MS = 1500;
export const RE_CHECK_MS = 3000;
export const READY_MS = 5000;

export const WRITE_END = TOTAL_LESSONS * WRITE_MS;
export const CHECK_END = WRITE_END + CHECK_MS;
export const CORRECT_END = CHECK_END + FINDINGS.length * CORRECT_MS;
export const RE_CHECK_END = CORRECT_END + RE_CHECK_MS;
export const LOOP_MS = RE_CHECK_END + READY_MS;
