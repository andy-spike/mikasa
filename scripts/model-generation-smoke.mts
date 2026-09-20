import { config } from "dotenv";
import { z } from "zod";
// @ts-expect-error Node runs this .mts file with native type stripping.
import { generationModel, generationProviderOptions, MODEL_PROFILES } from "../lib/model.ts";
// @ts-expect-error Node runs this .mts file with native type stripping.
import { generateStructuredStage } from "../lib/course/structured-generation.ts";

config({ path: ".env.local" });
config();

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error("OPENROUTER_API_KEY is required for the model capability preflight.");
}

const schema = z.object({
  status: z.literal("ready"),
  checks: z.array(z.enum(["structured-output", "reasoning-options"])).length(2),
});

const result = await generateStructuredStage({
  stage: "capability-preflight",
  model: generationModel(),
  providerOptions: generationProviderOptions(),
  schema,
  prompt:
    'Return {"status":"ready","checks":["structured-output","reasoning-options"]}. Do not add fields.',
});

console.log(
  JSON.stringify(
    {
      profile: MODEL_PROFILES.generation,
      output: result.output,
      metadata: {
        provider: result.metadata.provider,
        modelId: result.metadata.modelId,
        finishReason: result.metadata.finishReason,
        warnings: result.metadata.warnings,
        durationMs: result.metadata.durationMs,
        providerCalls: result.metadata.providerCalls,
        usage: result.metadata.usage,
      },
    },
    null,
    2,
  ),
);
