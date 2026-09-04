import type { FetchedPage, SourceSearcher } from "@/lib/course/design";

export function fakeFirecrawl(pages: FetchedPage[]) {
  const queries: string[] = [];
  const limits: number[] = [];

  const searcher: SourceSearcher = async (query, limit) => {
    queries.push(query);
    limits.push(limit);
    return pages;
  };

  return { searcher, queries, limits };
}

export function page(overrides: Partial<FetchedPage> = {}): FetchedPage {
  return {
    title: "A page about the topic",
    url: "https://example.com/topic",
    fetchedAt: "2026-08-31T12:00:00.000Z",
    content: "The page explains the topic in depth. ".repeat(20),
    ...overrides,
  };
}
