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
        if ("content" in message && Array.isArray(message.content)) {
          for (const part of message.content) {
            if (part.type === "text") parts.push(part.text);
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
