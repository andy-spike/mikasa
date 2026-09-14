import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { highlightBlocks, highlightCode } from "@/lib/course/highlight";

vi.mock("server-only", () => ({}));

const roles = (nodes: ReactNode[] | null) =>
  (nodes ?? []).filter(isValidElement).map((element) => {
    const props = element.props as { className?: string; children?: ReactNode };
    return [props.className, props.children];
  });

/* The five roles and the grammar scopes that reach them are a design contract:
   if a grammar upgrade renames a scope, the code blocks lose their ink and
   nothing else would notice. */
describe("code highlighting", () => {
  it("maps a Lesson's scopes onto the design system's roles", async () => {
    const tokens = roles(
      await highlightCode(
        ["// the entry point", 'const answer = stream("hi", 3);'].join("\n"),
        "ts",
      ),
    );

    expect(tokens).toContainEqual(["tok-com", "// the entry point"]);
    expect(tokens).toContainEqual(["tok-key", "const"]);
    expect(tokens).toContainEqual(["tok-str", '"hi"']);
    expect(tokens).toContainEqual(["tok-num", "3"]);
    expect(tokens).toContainEqual(["tok-func", "stream"]);
    /* Punctuation and operators stay in the block's own ink. */
    expect(tokens).not.toContainEqual(["tok-key", "="]);
  });

  it("resolves an alias and refuses a language it does not carry", async () => {
    expect(await highlightCode("SELECT 1", "postgres")).not.toBeNull();
    expect(await highlightCode("print('hi')", "brainfuck")).toBeNull();
  });

  it("leaves a block that is not code untouched and marks the one that is", async () => {
    const blocks = await highlightBlocks([
      { kind: "p", text: "Plain." },
      { kind: "code", language: "ts", code: "const x = 1;" },
    ]);

    expect(blocks[0]).toEqual({ kind: "p", text: "Plain." });
    expect(blocks[1].rendered).toBeTruthy();
  });
});
