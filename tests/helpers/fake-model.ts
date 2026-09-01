/**
 * A scripted model. Each `generateText` call consumes the next response in
 * order; the last one repeats, so a two-call flow (Outline, then
 * specification) can share one model. Records every prompt it saw, so
 * tests can assert the model was given the real Course inputs.
 */
import { MockLanguageModelV4 } from "ai/test";

export function scriptedModel(responses: string[]) {
  const prompts: string[] = [];
  let i = 0;

  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      const parts: string[] = [];
      for (const message of options.prompt) {
        if ("content" in message) {
          if (typeof message.content === "string") parts.push(message.content);
          else if (Array.isArray(message.content)) {
            for (const part of message.content) {
              if (part.type === "text") parts.push(part.text);
            }
          }
        }
      }
      prompts.push(parts.join("\n"));

      const text = responses[Math.min(i, responses.length - 1)];
      i += 1;

      return {
        content: [{ type: "text", text }],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage: {
          inputTokens: {
            total: 10,
            noCache: 10,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: { total: 20, text: 20, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });

  return { model, prompts, calls: () => i };
}

export function json(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * A scripted streaming model. Each `streamText` call consumes the next
 * response in order (the last repeats); the prompt it saw is recorded, so
 * tests can assert the Tutor was given the real context. A response may
 * be:
 *   - a plain string — streamed in word chunks;
 *   - `{ error: true }` — fails the stream mid-way (an interrupted turn);
 *   - `{ toolCall: { name, input } }` — one tool call, then finish, so
 *     the SDK executes the tool and steps again.
 */
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";

export type StreamResponse =
  | string
  | { error: true }
  | { toolCall: { name: string; input: unknown } };

export function streamingModel(responses: StreamResponse[]) {
  const prompts: string[] = [];
  let i = 0;

  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      const parts: string[] = [];
      for (const message of options.prompt) {
        if ("content" in message) {
          if (typeof message.content === "string") parts.push(message.content);
          else if (Array.isArray(message.content)) {
            for (const part of message.content) {
              if (part.type === "text") parts.push(part.text);
            }
          }
        }
      }
      prompts.push(parts.join("\n"));

      const response = responses[Math.min(i, responses.length - 1)];
      i += 1;

      const usage = {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 20, text: 20, reasoning: undefined },
      };
      const finish = (unified: "stop" | "tool-calls"): LanguageModelV4StreamPart => ({
        type: "finish",
        finishReason: { unified, raw: undefined },
        usage,
      });

      if (typeof response !== "string" && "error" in response) {
        return {
          stream: new ReadableStream<LanguageModelV4StreamPart>({
            start(controller) {
              controller.enqueue({
                type: "error",
                error: new Error("The model failed mid-stream."),
              });
              controller.close();
            },
          }),
        };
      }

      if (typeof response !== "string" && "toolCall" in response) {
        const input = JSON.stringify(response.toolCall.input);
        const chunks: LanguageModelV4StreamPart[] = [
          { type: "tool-input-start", id: "call1", toolName: response.toolCall.name },
          { type: "tool-input-delta", id: "call1", delta: input },
          { type: "tool-input-end", id: "call1" },
          /* The provider emits the assembled call itself; the input-* parts
             alone do not produce one. */
          { type: "tool-call", toolCallId: "call1", toolName: response.toolCall.name, input },
          finish("tool-calls"),
        ];
        return {
          stream: new ReadableStream<LanguageModelV4StreamPart>({
            start(controller) {
              for (const chunk of chunks) controller.enqueue(chunk);
              controller.close();
            },
          }),
        };
      }

      const words = (response as string).split(/(?<= )/);
      const chunks: LanguageModelV4StreamPart[] = [
        { type: "text-start", id: "t1" } as LanguageModelV4StreamPart,
        ...words.map(
          (w): LanguageModelV4StreamPart => ({ type: "text-delta", id: "t1", delta: w }),
        ),
        { type: "text-end", id: "t1" } as LanguageModelV4StreamPart,
        finish("stop"),
      ];
      return {
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
          },
        }),
      };
    },
  });

  return { model, prompts, calls: () => i };
}
