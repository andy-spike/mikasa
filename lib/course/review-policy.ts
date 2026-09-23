// Workflow-safe review policy: pure values the orchestration layer needs.
// This module stays free of model, provider, and Node imports so workflow
// files can import it without pulling the AI SDK into the workflow bundle.
// The workflow sandbox warns on third-party serde classes such as the AI
// Gateway models; keeping them out of the bundle keeps the warning away.
import type { Finding } from "./review";

// Three rounds: the complete Course review can find later conflicts after an
// earlier summary or Lesson is corrected (see ADRs 0009 and 0010).
export const MAX_CORRECTION_ROUNDS = 3;

export const CORRECTION_SOURCE_QUERY_CAP = 3;

export function dedupeCorrectionQueries(
  findings: Finding[],
  cap: number = CORRECTION_SOURCE_QUERY_CAP,
): string[] {
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const finding of findings) {
    const query = finding.sourceQuery?.trim();
    if (!query || finding.kind !== "factual") continue;
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push(query);
    if (queries.length >= cap) break;
  }
  return queries;
}
