import "server-only";

import {
  createUIMessageStreamResponse,
  toUIMessageStream,
  type TextStreamPart,
  type ToolSet,
} from "ai";

export function jsonError(status: number, error: string) {
  return Response.json({ error }, { status });
}

type TextPart = { type: "text"; text: string };

export function collectStreamText(event: {
  content: { type: string; text?: string }[];
  text: string;
}): string {
  return (
    event.content
      .filter((part): part is TextPart => part.type === "text")
      .map((part) => part.text)
      .join("") || event.text
  );
}

/** The AI SDK UI message stream over SSE, which `useChat` reads. Reasoning
 *  parts stay server-side; the client renders text and tool parts. */
export function uiMessageStreamResponse<TOOLS extends ToolSet>(
  stream: ReadableStream<TextStreamPart<TOOLS>>,
  fallbackError: string,
) {
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream,
      sendReasoning: false,
      onError: () => fallbackError,
    }),
  });
}
