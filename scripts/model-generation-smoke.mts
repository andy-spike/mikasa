import { config } from "dotenv";
import { z } from "zod";
// @ts-expect-error Node runs this .mts file with native type stripping.
import { GLM_FLASH_ROUTE } from "../lib/model.ts";
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

// Every host in the route must advertise the parameters the Course workflow
// sends. Advertised support is not enforcement, but a gap here means the route
// can silently drop a setting or fail over to a host that cannot serve the
// request at all.
const REQUIRED_PROVIDER_PARAMETERS = [
  "structured_outputs",
  "response_format",
  "reasoning",
  "tools",
];

const endpointsResponse = await fetch(
  `https://openrouter.ai/api/v1/models/${MODEL_PROFILES.generation.model.replace(/:nitro$/, "")}/endpoints`,
);
if (!endpointsResponse.ok) {
  throw new Error(`OpenRouter endpoints lookup failed: ${endpointsResponse.status}.`);
}
const endpointsPayload = (await endpointsResponse.json()) as {
  data?: { endpoints?: { provider_name?: string; supported_parameters?: string[] }[] };
};
const endpoints = endpointsPayload.data?.endpoints ?? [];

const allowedProviders = GLM_FLASH_ROUTE.provider?.only ?? [];
const capabilityGaps = allowedProviders.flatMap((provider) => {
  const matching = endpoints.filter(
    (candidate) =>
      (candidate.provider_name ?? "").toLowerCase().replace(/[^a-z]/g, "") ===
      provider.replace(/[^a-z]/g, ""),
  );
  if (matching.length === 0) return [`${provider}: endpoint not found`];
  return matching.flatMap((endpoint) =>
    REQUIRED_PROVIDER_PARAMETERS.filter(
      (parameter) => !(endpoint.supported_parameters ?? []).includes(parameter),
    ).map((parameter) => `${provider}: missing ${parameter}`),
  );
});
const upstreamProvider = result.metadata.providerMetadata?.openrouter?.provider;
if (
  typeof upstreamProvider === "string" &&
  !allowedProviders.includes(upstreamProvider.toLowerCase().replace(/[^a-z]/g, ""))
) {
  capabilityGaps.push(`Unexpected upstream provider: ${upstreamProvider}`);
}

console.log(
  JSON.stringify(
    {
      profile: MODEL_PROFILES.generation,
      output: result.output,
      metadata: {
        provider: result.metadata.provider,
        upstreamProvider: result.metadata.providerMetadata?.openrouter?.provider ?? null,
        modelId: result.metadata.modelId,
        finishReason: result.metadata.finishReason,
        warnings: result.metadata.warnings,
        durationMs: result.metadata.durationMs,
        providerCalls: result.metadata.providerCalls,
        usage: result.metadata.usage,
      },
      capabilities: {
        required: REQUIRED_PROVIDER_PARAMETERS,
        allowedProviders,
        gaps: capabilityGaps,
      },
    },
    null,
    2,
  ),
);

if (capabilityGaps.length > 0) {
  process.exitCode = 1;
}
