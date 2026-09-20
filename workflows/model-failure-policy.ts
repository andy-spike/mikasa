import { FatalError, RetryableError } from "workflow";

type GenerationFailure = {
  _tag?: string;
  message?: string;
  retryable?: boolean;
};

const MODEL_STEP_RETRIES = 2;

export async function withModelFailurePolicy<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const failure = error as GenerationFailure;
    const message = failure.message || "Structured Course generation failed.";

    if (failure._tag === "GenerationTimedOut") {
      throw new RetryableError(message, { retryAfter: "5s" });
    }
    if (failure._tag === "ProviderGenerationFailure") {
      if (failure.retryable) throw new RetryableError(message, { retryAfter: "5s" });
      throw new FatalError(message);
    }
    if (
      failure._tag === "StructuredOutputTruncated" ||
      failure._tag === "StructuredOutputFiltered" ||
      failure._tag === "InvalidStructuredOutput" ||
      failure._tag === "GenerationConfigurationError"
    ) {
      throw new FatalError(message);
    }
    throw error;
  }
}

export function setModelStepRetryLimit<T extends (...args: never[]) => Promise<unknown>>(
  step: T,
): void {
  (step as T & { maxRetries: number }).maxRetries = MODEL_STEP_RETRIES;
}
