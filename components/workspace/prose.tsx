import type { CSSProperties, ReactNode } from "react";
import type { Block } from "@/lib/demo-course";

/** `code` and **emphasis** inside a Lesson paragraph. */
export function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
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
        return part;
      })}
    </>
  );
}

const SQL_TOKEN =
  /(--[^\n]*)|('(?:[^']|'')*')|\b(select|from|where|group|order|by|partition|over|as|with|sum|avg|count|min|max|rows|range|between|unbounded|preceding|following|current|row|and|or|not|null|nulls|first|last|interval|on|join|left|inner|case|when|then|else|end|distinct|having|limit|desc|asc|insert|into|values|delete|update|set|create|table)\b/gi;

/**
 * Weight carries the keywords; one dim step, italicised for strings, carries
 * the rest. No colour of any kind in code: the accent means the Lesson you
 * are up to, and code is never that.
 */
function highlightSql(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  SQL_TOKEN.lastIndex = 0;
  let key = 0;
  while ((m = SQL_TOKEN.exec(code)) !== null) {
    if (m.index > last) out.push(code.slice(last, m.index));
    if (m[1]) {
      out.push(
        <span key={key++} className="text-fg-3">
          {m[1]}
        </span>,
      );
    } else if (m[2]) {
      out.push(
        <span key={key++} className="text-fg-3 italic">
          {m[2]}
        </span>,
      );
    } else {
      out.push(
        <span key={key++} className="font-semibold text-fg">
          {m[3]}
        </span>,
      );
    }
    last = m.index + m[0].length;
    key++;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

export function LessonBlock({ block }: { block: Block }) {
  if (block.kind === "p") {
    return (
      <p className="max-w-(--measure) text-[1rem] leading-[1.72] text-fg-2">
        <Inline text={block.text} />
      </p>
    );
  }

  if (block.kind === "sql") {
    /* Code sits one luminance step up. No border, no chrome. */
    return (
      <div className="max-w-(--measure) overflow-hidden rounded-md bg-panel">
        <div className="flex items-center border-b border-hair px-3.5 py-2">
          <span className="label text-fg-3">sql</span>
        </div>
        <pre
          className="scroll-thin scroll-x"
          style={{ "--scroll-bg": "var(--panel)" } as CSSProperties}
        >
          <code className="block w-max min-w-full px-3.5 py-3.5 font-mono text-[0.8125rem] leading-[1.72] text-fg-2">
            {highlightSql(block.code)}
          </code>
        </pre>
      </div>
    );
  }

  if (block.kind === "note") {
    /* Set into the flow at one step up, with a hairline. Not a callout card. */
    return (
      <aside className="max-w-(--measure) border-l border-rule py-1 pl-4">
        <h3 className="label mb-2 text-fg-3">{block.title}</h3>
        <p className="text-[0.9375rem] leading-[1.66] text-fg-2">
          <Inline text={block.text} />
        </p>
      </aside>
    );
  }

  return (
    <figure className="max-w-(--measure)">
      <div
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
                    className={
                      "py-[0.4rem] pr-6 last:pr-0 " +
                      (j === row.length - 1
                        ? "font-medium text-fg"
                        : "text-fg-2")
                    }
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
