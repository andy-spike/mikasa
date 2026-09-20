import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generatedLessonContentSchema } from "@/lib/course/content";

type ContractCase = { name: string; valid: boolean; value: unknown };
const cases = JSON.parse(
  readFileSync(new URL("./fixtures/lesson-contract-cases.json", import.meta.url), "utf8"),
) as ContractCase[];

describe("stored model contract corpus", () => {
  it.each(cases)("classifies $name", ({ valid, value }) => {
    expect(generatedLessonContentSchema.safeParse(value).success).toBe(valid);
  });
});
