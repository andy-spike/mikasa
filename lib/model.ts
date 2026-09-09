import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import type {
  OpenRouterChatSettings,
  OpenRouterProviderOptions,
} from "@openrouter/ai-sdk-provider";

export type ReasoningEffort = "low" | "medium" | "high";

export const MODEL_PROFILES = {
  // Gemini 3.7 Flash supports the three thinking levels exposed to the
  // Learner and a 1M-token window for sequential Lesson generation.
  design: {
    model: "google/gemini-3.7-flash",
    reasoning: { effort: "medium" },
  },
  grounding: {
    model: "google/gemini-3.7-flash",
    reasoning: { effort: "low" },
  },
  generation: {
    model: "google/gemini-3.7-flash",
    reasoning: { effort: "high" },
  },
  tutor: {
    model: "google/gemini-3.7-flash",
    reasoning: { effort: "low" },
  },
  embedding: {
    model: "openai/text-embedding-3-small",
    dimensions: 1536,
  },
} as const;

function openrouter() {
  return createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
}

const GOOGLE_AI_STUDIO_FLEX: OpenRouterChatSettings = {
  provider: {
    order: ["google-ai-studio"],
    allow_fallbacks: false,
    require_parameters: true,
  },
  extraBody: { service_tier: "flex" },
};

export function reasoningOptions(effort: ReasoningEffort): {
  openrouter: OpenRouterProviderOptions;
} {
  return { openrouter: { reasoning: { effort } } };
}

export function designProviderOptions(
  effort: ReasoningEffort = MODEL_PROFILES.design.reasoning.effort,
): { openrouter: OpenRouterProviderOptions } {
  return reasoningOptions(effort);
}

export function groundingProviderOptions(): { openrouter: OpenRouterProviderOptions } {
  return reasoningOptions(MODEL_PROFILES.grounding.reasoning.effort);
}

export function generationProviderOptions(): { openrouter: OpenRouterProviderOptions } {
  return reasoningOptions(MODEL_PROFILES.generation.reasoning.effort);
}

type ModelProfile = "design" | "grounding" | "generation" | "tutor";

function modelFor(profile: ModelProfile): LanguageModel {
  return openrouter()(MODEL_PROFILES[profile].model, GOOGLE_AI_STUDIO_FLEX);
}

export function designModel(): LanguageModel {
  return modelFor("design");
}

export function groundingModel(): LanguageModel {
  return modelFor("grounding");
}

export function generationModel(): LanguageModel {
  return modelFor("generation");
}

export function tutorModel(): LanguageModel {
  return modelFor("tutor");
}

export function tutorProviderOptions(
  effort: ReasoningEffort = MODEL_PROFILES.tutor.reasoning.effort,
): { openrouter: OpenRouterProviderOptions } {
  return reasoningOptions(effort);
}

// 1536-dimensional by construction: the model and the embedding column agree, so no negotiation happens.
const EMBEDDINGS_ENDPOINT = "https://openrouter.ai/api/v1/embeddings";

const EMBED_BATCH = 64;

export class EmbeddingError extends Error {}

async function requestEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new EmbeddingError("OPENROUTER_API_KEY is not set.");

  const response = await fetch(EMBEDDINGS_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL_PROFILES.embedding.model,
      input: texts,
      encoding_format: "float",
    }),
  });
  if (!response.ok) {
    throw new EmbeddingError(`The embeddings endpoint returned ${response.status}.`);
  }
  const payload = (await response.json()) as {
    data?: { embedding: number[]; index: number }[];
  };
  const data = payload.data ?? [];
  if (data.length !== texts.length) {
    throw new EmbeddingError("The embeddings response did not cover every text.");
  }
  const ordered = [...data].sort((a, b) => a.index - b.index);
  return ordered.map((d) => {
    if (d.embedding.length !== MODEL_PROFILES.embedding.dimensions) {
      throw new EmbeddingError(
        `Expected ${MODEL_PROFILES.embedding.dimensions} dimensions, got ${d.embedding.length}.`,
      );
    }
    return d.embedding;
  });
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    vectors.push(...(await requestEmbeddings(texts.slice(i, i + EMBED_BATCH))));
  }
  return vectors;
}

export async function embedQuery(text: string): Promise<number[]> {
  return (await embedTexts([text]))[0];
}
