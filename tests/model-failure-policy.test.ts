import { FatalError, RetryableError } from "workflow";
import { describe, expect, it } from "vitest";
import { setModelStepRetryLimit, withModelFailurePolicy } from "@/workflows/model-failure-policy";

function failure(_tag: string, fields: Record<string, unknown> = {}) {
  return Object.assign(new Error(`${_tag} failed.`), { _tag, ...fields });
}

describe("model Workflow failure policy", () => {
  it.each([
    failure("GenerationTimedOut"),
    failure("ProviderGenerationFailure", { retryable: true }),
  ])("retries transient model failures", async (error) => {
    await expect(withModelFailurePolicy(async () => Promise.reject(error))).rejects.toSatisfy(
      RetryableError.is,
    );
  });

  it.each([
    failure("ProviderGenerationFailure", { retryable: false }),
    failure("StructuredOutputTruncated"),
    failure("StructuredOutputFiltered"),
    failure("InvalidStructuredOutput"),
    failure("GenerationConfigurationError"),
  ])("fails permanent model failures without a blind replay", async (error) => {
    await expect(withModelFailurePolicy(async () => Promise.reject(error))).rejects.toSatisfy(
      FatalError.is,
    );
  });

  it("leaves non-model failures to the Workflow default policy", async () => {
    const error = new Error("database unavailable");
    await expect(withModelFailurePolicy(async () => Promise.reject(error))).rejects.toBe(error);
  });

  it("sets an explicit two-retry step limit", () => {
    const step = async () => undefined;
    setModelStepRetryLimit(step);
    expect((step as typeof step & { maxRetries: number }).maxRetries).toBe(2);
  });
});
