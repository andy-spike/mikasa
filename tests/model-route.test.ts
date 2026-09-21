import { describe, expect, it } from "vitest";
import { GLM_FLASH_ROUTE, MODEL_PROFILES, reasoningOptions } from "@/lib/model";

describe("Course model route", () => {
  it("uses GLM 5.3 Flash Nitro on the selected providers", () => {
    for (const profile of ["design", "grounding", "generation", "tutor"] as const) {
      expect(MODEL_PROFILES[profile].model).toBe("z-ai/glm-5.3-flash:nitro");
    }
    expect(GLM_FLASH_ROUTE.provider).toMatchObject({
      only: ["coreweave", "together", "fireworks", "baseten"],
      allow_fallbacks: false,
      require_parameters: true,
    });
  });

  it("passes the chosen reasoning effort through to OpenRouter", () => {
    expect(reasoningOptions("low")).toEqual({ openrouter: { reasoning: { effort: "low" } } });
    expect(reasoningOptions("medium")).toEqual({ openrouter: { reasoning: { effort: "medium" } } });
  });
});
