import { APICallError, NoOutputGeneratedError } from "ai";
import type { FinishReason, LanguageModelUsage } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createStructuredGenerator,
  GenerationConfigurationError,
  GenerationTimedOut,
  InvalidStructuredOutput,
  ProviderGenerationFailure,
  StructuredOutputFiltered,
  StructuredOutputTruncated,
  type StructuredGenerationAdapter,
  type StructuredGenerationAdapterRequest,
} from "@/lib/course/structured-generation";
import { scriptedModel } from "./helpers/fake-model";

const usage: LanguageModelUsage = {
  inputTokens: 10,
  inputTokenDetails: {
    noCacheTokens: 10,
    cacheReadTokens: undefined,
    cacheWriteTokens: undefined,
  },
  outputTokens: 20,
  outputTokenDetails: { textTokens: 20, reasoningTokens: undefined },
  totalTokens: 30,
};

function metadata(finishReason: FinishReason = "stop") {
  return {
    finishReason,
    rawFinishReason: finishReason,
    warnings: [],
    usage,
    provider: "test-provider",
    modelId: "test-model",
    responseId: "response-1",
    durationMs: 25,
    providerCalls: 1,
  };
}

const model = scriptedModel(["{}"]).model;
const schema = z.object({ value: z.string() });

function request() {
  return {
    stage: "lesson-generation" as const,
    model,
    schema,
    prompt: "private Course prompt",
  };
}

describe("structured Course generation", () => {
  it("applies the stage policy and returns safe response metadata", async () => {
    const seen: { timeoutMs: number; maxRetries: number }[] = [];
    const adapter: StructuredGenerationAdapter = async <T>(
      input: StructuredGenerationAdapterRequest<T>,
    ) => {
      seen.push({ timeoutMs: input.timeoutMs, maxRetries: input.maxRetries });
      return { output: { value: "done" } as T, metadata: metadata() };
    };
    const generate = createStructuredGenerator(adapter);

    const result = await generate(request());

    expect(result.output).toEqual({ value: "done" });
    expect(result.metadata).toMatchObject({
      stage: "lesson-generation",
      finishReason: "stop",
      provider: "test-provider",
      modelId: "test-model",
      responseId: "response-1",
    });
    expect(seen).toEqual([{ timeoutMs: 180_000, maxRetries: 1 }]);
  });

  it("emits prompt-free diagnostics and ignores observer failures", async () => {
    const events: unknown[] = [];
    const adapter: StructuredGenerationAdapter = async <T>() => ({
      output: { value: "done" } as T,
      metadata: metadata(),
    });
    const generate = createStructuredGenerator(adapter, (event) => events.push(event));
    await generate(request());

    expect(events).toEqual([
      expect.objectContaining({
        stage: "lesson-generation",
        outcome: "succeeded",
        durationMs: 25,
        providerCalls: 1,
        inputTokens: 10,
        outputTokens: 20,
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain("private Course prompt");

    const generateWithBrokenObserver = createStructuredGenerator(adapter, () => {
      throw new Error("diagnostics unavailable");
    });
    await expect(generateWithBrokenObserver(request())).resolves.toMatchObject({
      output: { value: "done" },
    });
  });

  it.each([
    ["length" as const, StructuredOutputTruncated],
    ["content-filter" as const, StructuredOutputFiltered],
    ["other" as const, InvalidStructuredOutput],
  ])("rejects a %s finish reason", async (finishReason, ErrorType) => {
    const adapter: StructuredGenerationAdapter = async () => ({ metadata: metadata(finishReason) });
    const generate = createStructuredGenerator(adapter);

    await expect(generate(request())).rejects.toBeInstanceOf(ErrorType);
  });

  it("rejects a stopped response with no structured output", async () => {
    const adapter: StructuredGenerationAdapter = async () => ({ metadata: metadata() });
    const generate = createStructuredGenerator(adapter);

    await expect(generate(request())).rejects.toBeInstanceOf(InvalidStructuredOutput);
  });

  it("classifies a timeout without retaining the prompt", async () => {
    const adapter: StructuredGenerationAdapter = async () => {
      throw new DOMException("private Course content", "TimeoutError");
    };
    const generate = createStructuredGenerator(adapter);

    const failure = await generate(request()).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(GenerationTimedOut);
    expect(failure).toMatchObject({ stage: "lesson-generation", timeoutMs: 180_000 });
    expect(String(failure)).not.toContain("private Course content");
  });

  it("keeps provider retryability and status without retaining response content", async () => {
    const adapter: StructuredGenerationAdapter = async () => {
      throw new APICallError({
        message: "private provider response",
        url: "https://provider.example/generate",
        requestBodyValues: { prompt: "private Course prompt" },
        statusCode: 503,
        responseBody: "private response body",
        isRetryable: true,
      });
    };
    const generate = createStructuredGenerator(adapter);

    const failure = await generate(request()).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ProviderGenerationFailure);
    expect(failure).toMatchObject({ retryable: true, statusCode: 503 });
    expect(JSON.stringify(failure)).not.toContain("private");
  });

  it("classifies missing structured output", async () => {
    const adapter: StructuredGenerationAdapter = async () => {
      throw new NoOutputGeneratedError();
    };
    const generate = createStructuredGenerator(adapter);

    await expect(generate(request())).rejects.toBeInstanceOf(InvalidStructuredOutput);
  });

  it("classifies model configuration failures", async () => {
    const adapter: StructuredGenerationAdapter = async () => {
      throw Object.assign(new Error("secret key"), { name: "AI_LoadAPIKeyError" });
    };
    const generate = createStructuredGenerator(adapter);

    const failure = await generate(request()).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(GenerationConfigurationError);
    expect(String(failure)).not.toContain("secret key");
  });
});
