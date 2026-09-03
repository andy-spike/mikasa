import "server-only";

/**
 * Current web Sources through Firecrawl (ticket #11). The Tutor's
 * `searchWeb` tool calls this when the Course's own content is not
 * enough: it searches the live web and returns titles, URLs, and short
 * descriptions — read-only, no page fetches, nothing stored.
 */
const SEARCH_ENDPOINT = "https://api.firecrawl.dev/v1/search";

/** How many results one web search may return. */
const RESULT_LIMIT = 5;

export type WebResult = {
  title: string;
  url: string;
  snippet: string;
};

/** Raised when Firecrawl answers with a failure. */
export class FirecrawlError extends Error {}

export async function webSearch(query: string): Promise<WebResult[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new FirecrawlError("FIRECRAWL_API_KEY is not set.");

  const response = await fetch(SEARCH_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, limit: RESULT_LIMIT }),
  });
  if (!response.ok) {
    throw new FirecrawlError(`The web search endpoint returned ${response.status}.`);
  }
  const payload = (await response.json()) as {
    success?: boolean;
    data?: { title?: string; url?: string; description?: string }[];
  };
  if (payload.success === false) {
    throw new FirecrawlError("The web search did not succeed.");
  }
  return (payload.data ?? [])
    .filter((r): r is { title: string; url: string; description?: string } => Boolean(r.url))
    .slice(0, RESULT_LIMIT)
    .map((r) => ({
      title: r.title ?? r.url,
      url: r.url,
      snippet: (r.description ?? "").slice(0, 400),
    }));
}
