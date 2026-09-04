import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import type {
  OpenRouterChatSettings,
  OpenRouterProviderOptions,
} from "@openrouter/ai-sdk-provider";

export const MODEL_PROFILES = {
  design: {
    model: "z-ai/glm-5.3-flash",
    reasoning: { effort: "medium" },
  },
  grounding: {
    model: "z-ai/glm-5.3-flash",
    reasoning: { effort: "low" },
  },
  tutor: {
    model: "z-ai/glm-5.3-flash",
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

// Ordered by measured throughput; fallbacks stay on so a total outage degrades instead of failing.
const DESIGN_PROVIDER_ORDER = ["baseten", "friendli", "makora", "digitalocean", "together"];

const DESIGN_ROUTING: OpenRouterChatSettings = {
  provider: { order: [...DESIGN_PROVIDER_ORDER], allow_fallbacks: true },
};

export function designProviderOptions(): { openrouter: OpenRouterProviderOptions } {
  return { openrouter: { reasoning: { ...MODEL_PROFILES.design.reasoning } } };
}

export function groundingProviderOptions(): { openrouter: OpenRouterProviderOptions } {
  return { openrouter: { reasoning: { ...MODEL_PROFILES.grounding.reasoning } } };
}

export function designModel(): LanguageModel {
  return openrouter()(MODEL_PROFILES.design.model, DESIGN_ROUTING);
}

export function groundingModel(): LanguageModel {
  return openrouter()(MODEL_PROFILES.grounding.model);
}

export function generationModel(): LanguageModel {
  return openrouter()(MODEL_PROFILES.design.model, DESIGN_ROUTING);
}

export function tutorModel(): LanguageModel {
  return openrouter()(MODEL_PROFILES.tutor.model);
}

export function tutorProviderOptions(): { openrouter: OpenRouterProviderOptions } {
  return { openrouter: { reasoning: { ...MODEL_PROFILES.tutor.reasoning } } };
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
