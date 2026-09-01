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
