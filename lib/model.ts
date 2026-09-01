/**
 * The one place that names models. ADR 0002: every feature uses a fixed
 * model and reasoning profile through OpenRouter; the Learner never picks.
 * Later tickets import from here instead of naming a model themselves.
 *
 * This module is server-side only in spirit: it reads OPENROUTER_API_KEY at
 * call time and is imported by Workflow steps and route handlers. Tests
 * never import it — they inject a fake model into the domain functions.
 */
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import type { OpenRouterProviderOptions } from "@openrouter/ai-sdk-provider";

/**
 * Feature profiles. `model` is an OpenRouter model id; `reasoning` is the
 * effort the feature needs. Design plans a whole Course, so it reasons
 * hardest; excerpt selection is a narrow reading task.
 */
export const MODEL_PROFILES = {
  design: {
    model: "anthropic/claude-sonnet-4.5",
    reasoning: { effort: "medium" },
  },
  grounding: {
    model: "anthropic/claude-sonnet-4.5",
    reasoning: { effort: "low" },
  },
  tutor: {
    model: "anthropic/claude-sonnet-4.5",
    reasoning: { effort: "low" },
  },
  embedding: {
    model: "baai/bge-base-en-v1.5",
    dimensions: 768,
  },
} as const;

function openrouter() {
  return createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
}

/**
 * OpenRouter provider options for a feature: the reasoning profile rides
 * per call (the AI SDK's `providerOptions`), never on a provider singleton.
 */
export function designProviderOptions(): { openrouter: OpenRouterProviderOptions } {
  return { openrouter: { reasoning: { ...MODEL_PROFILES.design.reasoning } } };
}

export function groundingProviderOptions(): { openrouter: OpenRouterProviderOptions } {
  return { openrouter: { reasoning: { ...MODEL_PROFILES.grounding.reasoning } } };
}

/** The model Course design runs on (Outline draft and specification). */
export function designModel(): LanguageModel {
  return openrouter()(MODEL_PROFILES.design.model);
}

/** The model that picks Source excerpts out of fetched pages. */
export function groundingModel(): LanguageModel {
  return openrouter()(MODEL_PROFILES.grounding.model);
}

/**
 * The model that writes Lesson content. Same profile as design: planning
 * a Course and writing its Lessons are the same class of work.
 */
export function generationModel(): LanguageModel {
  return openrouter()(MODEL_PROFILES.design.model);
}

/** The model the Tutor converses on: fast to first word, still sharp. */
export function tutorModel(): LanguageModel {
  return openrouter()(MODEL_PROFILES.tutor.model);
}

/** OpenRouter provider options for the Tutor: low reasoning effort. */
export function tutorProviderOptions(): { openrouter: OpenRouterProviderOptions } {
  return { openrouter: { reasoning: { ...MODEL_PROFILES.tutor.reasoning } } };
}

/**
 * Embeddings ride the same OpenRouter key, through its OpenAI-compatible
 * embeddings endpoint. bge-base-en-v1.5 is natively 768-dimensional — the
 * same shape as the `lesson_fragments.embedding` column — so no
 * dimension negotiation happens; the column and the model agree by
 * construction. Documents and queries embed through one deterministic
 * endpoint; the query side adds the retrieval prefix the model card
 * recommends.
 */
const EMBEDDINGS_ENDPOINT = "https://openrouter.ai/api/v1/embeddings";

/** How many texts ride in one embeddings request. */
const EMBED_BATCH = 64;

/** Raised when the endpoint returns vectors of the wrong shape. */
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

/** Embeds Course content (fragment text) at 768 dimensions. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    vectors.push(...(await requestEmbeddings(texts.slice(i, i + EMBED_BATCH))));
  }
  return vectors;
}

/** bge-base-en-v1.5's card recommends this prefix on the query side. */
const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

/** Embeds a retrieval query. Prefixes the query, per the model card. */
export async function embedQuery(text: string): Promise<number[]> {
  return (await embedTexts([`${QUERY_PREFIX}${text}`]))[0];
}
