import {
  APICallError,
  generateText,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  RetryError,
} from "ai";
import type {
  CallWarning,
  FinishReason,
  LanguageModel,
  LanguageModelUsage,
  ProviderMetadata,
} from "ai";
import { Data, Effect, Either } from "effect";
import type { z } from "zod";

export type StructuredGenerationStage =
  | "source-excerpts"
  | "outline-draft"
  | "course-specification"
  | "course-specification-reconciliation"
  | "lesson-generation"
  | "course-review"
  | "lesson-correction";

type StagePolicy = {
  timeoutMs: number;
  maxRetries: number;
};

const STAGE_POLICIES: Record<StructuredGenerationStage, StagePolicy> = {
  "source-excerpts": { timeoutMs: 60_000, maxRetries: 1 },
  "outline-draft": { timeoutMs: 120_000, maxRetries: 1 },
  "course-specification": { timeoutMs: 120_000, maxRetries: 1 },
  "course-specification-reconciliation": { timeoutMs: 120_000, maxRetries: 1 },
  "lesson-generation": { timeoutMs: 180_000, maxRetries: 1 },
  "course-review": { timeoutMs: 180_000, maxRetries: 1 },
  "lesson-correction": { timeoutMs: 180_000, maxRetries: 1 },
};

export type StructuredGenerationMetadata = {
  stage: StructuredGenerationStage;
  finishReason: FinishReason;
  rawFinishReason?: string;
  warnings: CallWarning[];
  usage: LanguageModelUsage;
  provider: string;
  modelId: string;
  responseId: string;
  providerMetadata?: ProviderMetadata;
};

type FailureFields = {
  stage: StructuredGenerationStage;
};

export class ProviderGenerationFailure extends Data.TaggedError("ProviderGenerationFailure")<
  FailureFields & {
    retryable: boolean;
    statusCode?: number;
    causeName?: string;
  }
> {
  override get message(): string {
    return `The provider failed during ${this.stage}.`;
  }
}

export class GenerationTimedOut extends Data.TaggedError("GenerationTimedOut")<
  FailureFields & { timeoutMs: number }
> {
  override get message(): string {
    return `${this.stage} exceeded its ${this.timeoutMs}ms time limit.`;
  }
}

export class StructuredOutputTruncated extends Data.TaggedError("StructuredOutputTruncated")<
  FailureFields & { metadata?: StructuredGenerationMetadata }
> {
  override get message(): string {
    return `The model truncated its ${this.stage} output.`;
  }
}

export class StructuredOutputFiltered extends Data.TaggedError("StructuredOutputFiltered")<
  FailureFields & { metadata?: StructuredGenerationMetadata }
> {
  override get message(): string {
    return `The provider filtered the ${this.stage} output.`;
  }
}

export class InvalidStructuredOutput extends Data.TaggedError("InvalidStructuredOutput")<
  FailureFields & { causeName?: string; metadata?: StructuredGenerationMetadata }
> {
  override get message(): string {
    return `The model returned invalid structured output during ${this.stage}.`;
  }
}

export class GenerationConfigurationError extends Data.TaggedError("GenerationConfigurationError")<
  FailureFields & { causeName?: string }
> {
  override get message(): string {
    return `The model configuration is invalid for ${this.stage}.`;
  }
}

export type StructuredGenerationFailure =
  | ProviderGenerationFailure
  | GenerationTimedOut
  | StructuredOutputTruncated
  | StructuredOutputFiltered
  | InvalidStructuredOutput
  | GenerationConfigurationError;

export type StructuredGenerationRequest<T> = {
  stage: StructuredGenerationStage;
  model: LanguageModel;
  providerOptions?: Parameters<typeof generateText>[0]["providerOptions"];
  schema: z.ZodType<T>;
  prompt: string;
};

export type StructuredGenerationResult<T> = {
  output: T;
  metadata: StructuredGenerationMetadata;
};

export type StructuredGenerationAdapterRequest<T> = StructuredGenerationRequest<T> & StagePolicy;

type AdapterResult<T> = {
  output?: T;
  metadata: Omit<StructuredGenerationMetadata, "stage">;
};

export type StructuredGenerationAdapter = <T>(
  request: StructuredGenerationAdapterRequest<T>,
) => Promise<AdapterResult<T>>;

const aiSdkAdapter: StructuredGenerationAdapter = async <T>(
  request: StructuredGenerationAdapterRequest<T>,
) => {
  const result = await generateText({
    model: request.model,
    providerOptions: request.providerOptions,
    output: Output.object({ schema: request.schema }),
    prompt: request.prompt,
    timeout: request.timeoutMs,
    maxRetries: request.maxRetries,
  });
  const metadata: AdapterResult<T>["metadata"] = {
    finishReason: result.finishReason,
    ...(result.rawFinishReason ? { rawFinishReason: result.rawFinishReason } : {}),
    warnings: result.warnings ?? [],
    usage: result.usage,
    provider: result.finalStep.model.provider,
    modelId: result.finalStep.model.modelId,
    responseId: result.response.id,
    ...(result.providerMetadata ? { providerMetadata: result.providerMetadata } : {}),
  };

  if (result.finishReason !== "stop") return { metadata };
  return { output: result.output, metadata };
};

function causeName(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("name" in error)) return undefined;
  return typeof error.name === "string" ? error.name : undefined;
}

function finishFailure(
  stage: StructuredGenerationStage,
  finishReason: FinishReason,
  metadata?: StructuredGenerationMetadata,
): StructuredGenerationFailure {
  switch (finishReason) {
    case "length":
      return new StructuredOutputTruncated({ stage, metadata });
    case "content-filter":
      return new StructuredOutputFiltered({ stage, metadata });
    default:
      return new InvalidStructuredOutput({ stage, metadata });
  }
}

const CONFIGURATION_ERROR_NAMES = new Set([
  "AI_InvalidArgumentError",
  "AI_InvalidPromptError",
  "AI_LoadAPIKeyError",
  "AI_LoadSettingError",
  "AI_NoSuchModelError",
  "AI_NoSuchProviderError",
  "AI_NoSuchProviderReferenceError",
  "AI_UnsupportedFunctionalityError",
  "AI_UnsupportedModelVersionError",
]);

function classifyFailure(
  error: unknown,
  stage: StructuredGenerationStage,
  policy: StagePolicy,
): StructuredGenerationFailure {
  if (NoObjectGeneratedError.isInstance(error)) {
    if (error.finishReason) return finishFailure(stage, error.finishReason);
    return new InvalidStructuredOutput({ stage, causeName: error.name });
  }
  if (NoOutputGeneratedError.isInstance(error)) {
    return new InvalidStructuredOutput({ stage, causeName: error.name });
  }
  if (RetryError.isInstance(error)) {
    if (error.reason === "abort") {
      return new GenerationTimedOut({ stage, timeoutMs: policy.timeoutMs });
    }
    return classifyFailure(error.lastError, stage, policy);
  }
  if (APICallError.isInstance(error)) {
    return new ProviderGenerationFailure({
      stage,
      retryable: error.isRetryable,
      ...(error.statusCode ? { statusCode: error.statusCode } : {}),
      causeName: error.name,
    });
  }

  const name = causeName(error);
  if (name === "AbortError" || name === "TimeoutError") {
    return new GenerationTimedOut({ stage, timeoutMs: policy.timeoutMs });
  }
  if (name && CONFIGURATION_ERROR_NAMES.has(name)) {
    return new GenerationConfigurationError({ stage, causeName: name });
  }
  return new ProviderGenerationFailure({
    stage,
    retryable: false,
    ...(name ? { causeName: name } : {}),
  });
}

export function createStructuredGenerator(adapter: StructuredGenerationAdapter) {
  return async function generateStructuredStage<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<StructuredGenerationResult<T>> {
    const policy = STAGE_POLICIES[request.stage];
    const program = Effect.tryPromise({
      try: () => adapter({ ...request, ...policy }),
      catch: (error) => classifyFailure(error, request.stage, policy),
    }).pipe(
      Effect.flatMap((result) => {
        const metadata: StructuredGenerationMetadata = {
          stage: request.stage,
          ...result.metadata,
        };
        if (metadata.finishReason !== "stop") {
          return Effect.fail(finishFailure(request.stage, metadata.finishReason, metadata));
        }
        if (result.output === undefined) {
          return Effect.fail(new InvalidStructuredOutput({ stage: request.stage, metadata }));
        }
        return Effect.succeed({ output: result.output, metadata });
      }),
    );

    const outcome = await Effect.runPromise(Effect.either(program));
    if (Either.isLeft(outcome)) throw outcome.left;
    return outcome.right;
  };
}

export const generateStructuredStage = createStructuredGenerator(aiSdkAdapter);
