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
import type { OpenRouterChatSettings, OpenRouterProviderOptions } from "@openrouter/ai-sdk-provider";

/**
 * Feature profiles. `model` is an OpenRouter model id; `reasoning` is the
 * effort the feature needs. Design plans a whole Course, so it reasons
 * hardest; excerpt selection is a narrow reading task.
 */
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

/**
 * Provider routing for the design/generation family. Slugs verified live
 * against OpenRouter's endpoints list for z-ai/glm-5.3-flash: Baseten is
 * the fastest option OpenRouter carries (~214 t/s on Artificial
 * Analysis), Friendli next (~175), then Makora (~102), DigitalOcean
 * (~90), Together (~81). Nebius, Databricks, and Inco are faster on AA
 * but do not serve this model through OpenRouter. `allow_fallbacks`
 * stays true so a total outage falls back to default routing instead of
 * failing. In provider v3 routing rides model settings (the second
 * `openrouter()` argument), not per-call `providerOptions`. Tutor and
 * grounding keep default routing: their turns are short, so first-token
 * latency dominates and provider choice matters less.
 */
const DESIGN_PROVIDER_ORDER = ["baseten", "friendli", "makora", "digitalocean", "together"];

/** Routing for the design/generation family, applied at model construction. */
const DESIGN_ROUTING: OpenRouterChatSettings = {
  provider: { order: [...DESIGN_PROVIDER_ORDER], allow_fallbacks: true },
};

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
  return openrouter()(MODEL_PROFILES.design.model, DESIGN_ROUTING);
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
  return openrouter()(MODEL_PROFILES.design.model, DESIGN_ROUTING);
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
 * embeddings endpoint. text-embedding-3-small is natively
 * 1536-dimensional — the same shape as the `lesson_fragments.embedding`
 * column — so no dimension negotiation happens; the column and the model
 * agree by construction. Documents and queries embed through one
 * deterministic endpoint with no prefix: unlike the previous bge model,
 * OpenAI embeddings take raw text on both sides.
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

/** Embeds Course content (fragment text) at 1536 dimensions. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    vectors.push(...(await requestEmbeddings(texts.slice(i, i + EMBED_BATCH))));
  }
  return vectors;
}

/** Embeds a retrieval query. No prefix: the model takes raw text. */
export async function embedQuery(text: string): Promise<number[]> {
  return (await embedTexts([text]))[0];
}
