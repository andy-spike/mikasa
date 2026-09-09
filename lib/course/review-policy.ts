// Workflow-safe review policy: pure values the orchestration layer needs.
// This module stays free of model, provider, and Node imports so workflow
// files can import it without pulling the AI SDK into the workflow bundle.
// The workflow sandbox warns on third-party serde classes such as the AI
// Gateway models; keeping them out of the bundle keeps the warning away.
import type { Finding } from "./review";

// Three rounds: with prose-aware generation and class-wide corrections the
// re-review keeps finding neighbor instances; the third round drains what two
// cannot (see the E2E finding arcs in ADR 0009).
export const MAX_CORRECTION_ROUNDS = 3;

export const CORRECTION_SOURCE_QUERY_CAP = 3;

export function dedupeCorrectionQueries(
  findings: Finding[],
  cap: number = CORRECTION_SOURCE_QUERY_CAP,
): string[] {
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const f of findings) {
    const q = f.sourceQuery?.trim();
    if (!q || f.kind !== "factual") continue;
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push(q);
    if (queries.length >= cap) break;
  }
  return queries;
}
