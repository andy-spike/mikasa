/* Code blocks are highlighted where the Course is assembled, not where it is
   read: Shiki runs on the server and hands each block a rendered tree of the
   design system's five syntax roles. The highlighter is heavy and the reading
   surface is a client component, so this module is server-only and the browser
   ships none of it. */
import "server-only";
import type { ReactNode } from "react";
import { createHighlighter, type BundledLanguage, type Highlighter } from "shiki";
import type { ReadingBlock, ReadingCourse } from "./reading";

/* A theme with no palette of its own. Every role points at the token that
   already owns that ink, so both grounds answer for free and there is no
   second place to edit a colour. */
const ROLES = {
  key: "var(--code-green)",
  str: "var(--code-orange)",
  num: "var(--code-purple)",
  func: "var(--code-blue)",
  com: "var(--fg-3)",
} as const;

/* Shiki's tokenizer hands back strings, not scopes, so the role is recovered
   from the colour the theme assigned it. */
const CLASSES: Record<string, string> = {
  [ROLES.key]: "tok-key",
  [ROLES.str]: "tok-str",
  [ROLES.num]: "tok-num",
  [ROLES.func]: "tok-func",
  [ROLES.com]: "tok-com",
};

const THEME = {
  name: "mikasa",
  type: "dark" as const,
  settings: [
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: ROLES.com, fontStyle: "italic" },
    },
    {
      scope: [
        "string",
        "string.regexp",
        "punctuation.definition.string",
        "constant.character.escape",
      ],
      settings: { foreground: ROLES.str },
    },
    {
      scope: ["constant.numeric", "constant.language", "constant.language.*"],
      settings: { foreground: ROLES.num },
    },
    {
      scope: [
        "entity.name.function",
        "support.function",
        "meta.function-call",
        "entity.name.tag",
        "support.class",
        "entity.name.type",
        "entity.name.class",
      ],
      settings: { foreground: ROLES.func },
    },
    {
      scope: [
        "keyword.control",
        "keyword.other",
        "keyword.operator.new",
        "keyword.operator.expression",
        "keyword.operator.word",
        "storage",
        "storage.type",
        "storage.modifier",
        "variable.language",
        "support.type",
      ],
      settings: { foreground: ROLES.key, fontStyle: "bold" as const },
    },
  ],
};

/* What a Course written for developers can plausibly contain. Anything else
   renders as plain code rather than guessing at a grammar. */
const LANGUAGES = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "sql",
  "bash",
  "python",
  "css",
  "html",
  "markdown",
  "yaml",
] as const satisfies readonly BundledLanguage[];

const ALIASES: Record<string, string> = {
  typescript: "ts",
  javascript: "js",
  node: "js",
  "node.js": "js",
  shell: "bash",
  sh: "bash",
  zsh: "bash",
  console: "bash",
  py: "python",
  python3: "python",
  yml: "yaml",
  md: "markdown",
  postgres: "sql",
  postgresql: "sql",
};

let pending: Promise<Highlighter> | null = null;
function highlighter(): Promise<Highlighter> {
  pending ??= createHighlighter({ langs: [...LANGUAGES], themes: [THEME] });
  return pending;
}

function normalizeLanguage(language: string): BundledLanguage | null {
  const key = language.trim().toLowerCase();
  const lang = ALIASES[key] ?? key;
  return (LANGUAGES as readonly string[]).includes(lang) ? (lang as BundledLanguage) : null;
}

/* Highlighting is deterministic per code and language, and the same Course is
   read many times, so the rendered tree is kept per process. */
const cache = new Map<string, ReactNode[]>();

export async function highlightCode(code: string, language: string): Promise<ReactNode[] | null> {
  const lang = normalizeLanguage(language);
  if (!lang) return null;

  const cached = cache.get(`${lang}\u0000${code}`);
  if (cached) return cached;

  const { tokens } = (await highlighter()).codeToTokens(code, { lang, theme: THEME });
  const nodes: ReactNode[] = [];
  tokens.forEach((line, i) => {
    if (i > 0) nodes.push("\n");
    for (const token of line) {
      const role = token.color ? CLASSES[token.color] : undefined;
      nodes.push(
        role ? (
          <span key={nodes.length} className={role}>
            {token.content}
          </span>
        ) : (
          token.content
        ),
      );
    }
  });

  cache.set(`${lang}\u0000${code}`, nodes);
  return nodes;
}

export async function highlightBlocks(blocks: ReadingBlock[]): Promise<ReadingBlock[]> {
  return Promise.all(
    blocks.map(async (block) => {
      if (block.kind !== "code" && block.kind !== "sql") return block;
      const rendered = await highlightCode(
        block.code,
        block.kind === "sql" ? "sql" : block.language,
      );
      return rendered ? { ...block, rendered } : block;
    }),
  );
}

export async function highlightReading(course: ReadingCourse): Promise<ReadingCourse> {
  return {
    ...course,
    modules: await Promise.all(
      course.modules.map(async (module) => ({
        ...module,
        lessons: await Promise.all(
          module.lessons.map(async (lesson) => ({
            ...lesson,
            body: await highlightBlocks(lesson.body),
          })),
        ),
      })),
    ),
  };
}
