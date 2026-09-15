import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { ReadingBlock, SourceLink } from "@/lib/course/reading";
import { CopyButton } from "./copy-button";

export function SourceLinks({ sources }: { sources: SourceLink[] }) {
  return (
    <p className="flex max-w-(--measure) min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      {sources.map((source) => (
        <a
          key={source.ref}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-w-0 max-w-full items-center gap-1 text-[0.75rem] text-fg-3 underline decoration-hair underline-offset-2 transition-colors hover:text-fg-2 focus-visible:text-fg-2"
        >
          <span className="label shrink-0">Source</span>
          <span className="min-w-0 truncate">{source.title}</span>
        </a>
      ))}
    </p>
  );
}

export function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-fg">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="rounded-sm bg-raised px-[0.34em] py-[0.1em] font-mono text-[0.86em] text-fg"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (link) {
          return (
            <a
              key={i}
              href={link[2]}
              target="_blank"
              rel="noopener noreferrer"
              className="inline text-fg-3 underline decoration-hair underline-offset-2 transition-colors hover:text-fg-2 focus-visible:text-fg-2"
            >
              {link[1]}
            </a>
          );
        }
        return part;
      })}
    </>
  );
}

export function LessonBlock({
  block,
  sourceFor,
}: {
  block: ReadingBlock;
  sourceFor?: (ref: string) => SourceLink | undefined;
}) {
  const sources =
    "sourceRefs" in block && block.sourceRefs && sourceFor
      ? block.sourceRefs.map(sourceFor).filter((s): s is SourceLink => Boolean(s))
      : [];

  const links = sources.length > 0 ? <SourceLinks sources={sources} /> : null;

  if (block.kind === "p") {
    return (
      <>
        <p className="max-w-(--measure) text-[1rem] leading-[1.72] text-fg-2">
          <Inline text={block.text} />
        </p>
        {links}
      </>
    );
  }

  if (block.kind === "code" || block.kind === "sql") {
    const language = block.kind === "sql" ? "sql" : block.language;
    return (
      <figure className="max-w-(--measure)">
        <div className="overflow-hidden border border-hair bg-canvas">
          <div className="flex items-center justify-between gap-3 border-b border-hair bg-panel py-1.5 pr-1.5 pl-3.5">
            <span className="label text-fg-3">{language}</span>
            <CopyButton text={block.code} />
          </div>
          <pre
            tabIndex={0}
            className="scroll-thin scroll-x"
            style={{ "--scroll-bg": "var(--canvas)" } as CSSProperties}
          >
            <code className="block w-max min-w-full px-3.5 py-3.5 font-mono text-[0.8125rem] leading-[1.72] text-fg-2">
              {block.rendered ?? block.code}
            </code>
          </pre>
        </div>
        {"caption" in block && block.caption ? (
          <figcaption className="mt-2.5 text-[0.8125rem] leading-[1.55] text-fg-3">
            {block.caption}
          </figcaption>
        ) : null}
      </figure>
    );
  }

  if (block.kind === "note") {
    return (
      <>
        <aside className="max-w-(--measure) border-l border-rule py-1 pl-4">
          <h3 className="label mb-2 text-fg-3">{block.title}</h3>
          <p className="text-[0.9375rem] leading-[1.66] text-fg-2">
            <Inline text={block.text} />
          </p>
        </aside>
        {links}
      </>
    );
  }

  return (
    <figure className="max-w-(--measure)">
      <div
        tabIndex={0}
        className="scroll-thin scroll-x"
        style={{ "--scroll-bg": "var(--canvas)" } as CSSProperties}
      >
        <table className="tnum w-max min-w-full border-collapse text-left font-mono text-[0.8125rem]">
          <thead>
            <tr>
              {block.head.map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="label border-b border-rule pr-6 pb-2 text-fg-3 last:pr-0"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i} className="border-b border-hair last:border-b-0">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={cn(
                      "py-[0.4rem] pr-6 last:pr-0",
                      j === row.length - 1 ? "font-medium text-fg" : "text-fg-2",
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="mt-2.5 text-[0.8125rem] leading-[1.55] text-fg-3">
        {block.caption}
      </figcaption>
    </figure>
  );
}
