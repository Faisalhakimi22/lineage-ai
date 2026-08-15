import { logger } from "./logger";
import {
  normalizedUrlKey,
  rankSearchSources,
} from "./provenance/source-ranking";

const BRAVE_WEB_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const DEFAULT_MAX_RESULTS_PER_QUERY = 5;
const MAX_RESULTS_PER_QUERY = 10;
const DEFAULT_MAX_TOTAL_RESULTS = 12;
const MAX_TOTAL_RESULTS = 20;
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_DISCOVERY_QUERIES = 3;
const DEFAULT_QUERY_CONCURRENCY = 2;

export type LiveSearchStatus = "not_configured" | "searched" | "failed";
export type LiveSearchProvider = "Brave Search" | "Tavily";

export interface LiveSearchSource {
  title: string;
  url: string;
  description: string;
  publisher: string | null;
  published_date: string | null;
  provider_result_id: string | null;
  provider_score: number | null;
  domain: string;
  discovered_by_queries: string[];
}

export interface LiveSearchResult {
  provider: LiveSearchProvider;
  status: LiveSearchStatus;
  /** Backward-compatible primary query. */
  query: string | null;
  /** Every bounded query actually sent, in deterministic order. */
  queries: string[];
  searched_at: string | null;
  sources: LiveSearchSource[];
  note: string | null;
}

interface BraveResult {
  id?: unknown;
  title?: unknown;
  url?: unknown;
  description?: unknown;
  age?: unknown;
  score?: unknown;
  profile?: { long_name?: unknown } | null;
}

interface BraveResponse {
  web?: { results?: unknown } | null;
}

interface TavilyResult {
  id?: unknown;
  title?: unknown;
  url?: unknown;
  content?: unknown;
  published_date?: unknown;
  score?: unknown;
}

interface TavilyResponse {
  results?: unknown;
}

interface SearchProvider {
  kind: "brave" | "tavily";
  name: LiveSearchProvider;
  apiKey: string;
}

interface SingleSearchResult {
  status: "searched" | "failed";
  sources: LiveSearchSource[];
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maximum
    ? parsed
    : fallback;
}

function cleanText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, maximum) : null;
}

function finiteScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function domainFromUrl(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function normalizeQuery(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400)
    .split(/\s+/)
    .slice(0, 50)
    .join(" ");
}

function normaliseBraveResult(
  value: unknown,
  query: string,
): LiveSearchSource | null {
  if (!value || typeof value !== "object") return null;
  const result = value as BraveResult;
  const title = cleanText(result.title, 300);
  const url = safeHttpUrl(result.url);

  if (!title || !url) return null;

  return {
    title,
    url,
    description:
      cleanText(result.description, 4_000) ??
      "No summary was supplied by the search provider.",
    publisher: cleanText(result.profile?.long_name, 200),
    published_date: cleanText(result.age, 100),
    provider_result_id: cleanText(result.id, 300),
    provider_score: finiteScore(result.score),
    domain: domainFromUrl(url),
    discovered_by_queries: [query],
  };
}

function normaliseTavilyResult(
  value: unknown,
  query: string,
): LiveSearchSource | null {
  if (!value || typeof value !== "object") return null;
  const result = value as TavilyResult;
  const title = cleanText(result.title, 300);
  const url = safeHttpUrl(result.url);

  if (!title || !url) return null;

  return {
    title,
    url,
    description:
      cleanText(result.content, 4_000) ??
      "No summary was supplied by the search provider.",
    publisher: null,
    published_date: cleanText(result.published_date, 100),
    provider_result_id: cleanText(result.id, 300),
    provider_score: finiteScore(result.score),
    domain: domainFromUrl(url),
    discovered_by_queries: [query],
  };
}

function configuredProvider(): SearchProvider | null {
  const braveKey = process.env["BRAVE_SEARCH_API_KEY"];
  if (braveKey) {
    return { kind: "brave", name: "Brave Search", apiKey: braveKey };
  }

  const tavilyKey = process.env["TAVILY_API_KEY"];
  return tavilyKey
    ? { kind: "tavily", name: "Tavily", apiKey: tavilyKey }
    : null;
}

function missingConfiguration(): LiveSearchResult {
  return {
    provider: "Brave Search",
    status: "not_configured",
    query: null,
    queries: [],
    searched_at: null,
    sources: [],
    note: "Live web search is not configured for this deployment.",
  };
}

/** True only when this deployment has opted in to sending claims to a search provider. */
export function liveSearchAvailable(): boolean {
  return (
    configuredProvider() !== null &&
    (process.env.NODE_ENV !== "test" ||
      process.env["LIVE_SEARCH_IN_TEST"] === "on")
  );
}

async function searchOneQuery(
  provider: SearchProvider,
  query: string,
  count: number,
  timeoutMs: number,
): Promise<SingleSearchResult> {
  const braveUrl = new URL(BRAVE_WEB_SEARCH_URL);
  braveUrl.searchParams.set("q", query);
  braveUrl.searchParams.set("count", String(count));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      provider.kind === "brave" ? braveUrl : TAVILY_SEARCH_URL,
      provider.kind === "brave"
        ? {
            headers: {
              Accept: "application/json",
              "X-Subscription-Token": provider.apiKey,
            },
            signal: controller.signal,
          }
        : {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${provider.apiKey}`,
            },
            body: JSON.stringify({
              query,
              max_results: count,
              search_depth: "basic",
              include_answer: false,
              include_raw_content: false,
            }),
            signal: controller.signal,
          },
    );

    if (!response.ok) {
      logger.warn(
        { provider: provider.name, status: response.status, query },
        "live web search returned non-OK status",
      );
      return { status: "failed", sources: [] };
    }

    const body = (await response.json()) as BraveResponse | TavilyResponse;
    const rawResults: unknown[] =
      provider.kind === "brave"
        ? Array.isArray((body as BraveResponse).web?.results)
          ? ((body as BraveResponse).web!.results as unknown[])
          : []
        : Array.isArray((body as TavilyResponse).results)
          ? ((body as TavilyResponse).results as unknown[])
          : [];
    const sources = rawResults
      .map((result) =>
        provider.kind === "brave"
          ? normaliseBraveResult(result, query)
          : normaliseTavilyResult(result, query),
      )
      .filter((source): source is LiveSearchSource => source !== null)
      .slice(0, count);
    return { status: "searched", sources };
  } catch (error) {
    logger.warn(
      {
        provider: provider.name,
        query,
        err: error instanceof Error ? error.message : "unknown",
      },
      "live web search failed",
    );
    return { status: "failed", sources: [] };
  } finally {
    clearTimeout(timeout);
  }
}

function mergeDiscoveredSources(
  claim: string,
  results: readonly SingleSearchResult[],
  maximum: number,
): LiveSearchSource[] {
  const sources = new Map<
    string,
    { source: LiveSearchSource; index: number }
  >();
  let index = 0;
  for (const result of results) {
    for (const source of result.sources) {
      const key = normalizedUrlKey(source.url);
      const previous = sources.get(key);
      if (!previous) {
        sources.set(key, { source, index });
        index += 1;
        continue;
      }
      previous.source.discovered_by_queries = [
        ...new Set([
          ...previous.source.discovered_by_queries,
          ...source.discovered_by_queries,
        ]),
      ];
      const previousScore = previous.source.provider_score ?? -1;
      const newScore = source.provider_score ?? -1;
      if (newScore > previousScore) {
        previous.source.provider_score = source.provider_score;
        previous.source.provider_result_id =
          source.provider_result_id ?? previous.source.provider_result_id;
        previous.source.title = source.title;
        previous.source.description = source.description;
        previous.source.published_date =
          source.published_date ?? previous.source.published_date;
      }
    }
  }

  return rankSearchSources(
    claim,
    [...sources.values()]
      .sort((a, b) => a.index - b.index)
      .map((item) => item.source),
  )
    .slice(0, maximum)
    .map((item) => item.source);
}

/**
 * Executes at most three supplied query variants with bounded concurrency and
 * deterministically merges duplicate URLs. Search-provider scores only affect
 * acquisition priority; they are not evidence of truth or source credibility.
 */
export async function searchLiveWebMulti(
  inputQueries: readonly string[],
): Promise<LiveSearchResult> {
  const provider = configuredProvider();
  if (!provider || !liveSearchAvailable()) return missingConfiguration();
  const activeProvider: SearchProvider = provider;

  const seenQueries = new Set<string>();
  const queries = inputQueries
    .map(normalizeQuery)
    .filter((query) => {
      const key = query.toLocaleLowerCase("en-US");
      if (!query || seenQueries.has(key)) return false;
      seenQueries.add(key);
      return true;
    })
    .slice(0, MAX_DISCOVERY_QUERIES);
  if (queries.length === 0) return missingConfiguration();

  const count = positiveInteger(
    process.env["LIVE_SEARCH_MAX_RESULTS"],
    DEFAULT_MAX_RESULTS_PER_QUERY,
    MAX_RESULTS_PER_QUERY,
  );
  const maximumTotal = positiveInteger(
    process.env["LIVE_SEARCH_MAX_TOTAL_RESULTS"],
    DEFAULT_MAX_TOTAL_RESULTS,
    MAX_TOTAL_RESULTS,
  );
  const timeoutMs = positiveInteger(
    process.env["LIVE_SEARCH_TIMEOUT_MS"],
    DEFAULT_TIMEOUT_MS,
    30_000,
  );
  const concurrency = positiveInteger(
    process.env["LIVE_SEARCH_QUERY_CONCURRENCY"],
    DEFAULT_QUERY_CONCURRENCY,
    MAX_DISCOVERY_QUERIES,
  );
  const results = new Array<SingleSearchResult>(queries.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      const query = queries[index];
      if (!query) return;
      results[index] = await searchOneQuery(
        activeProvider,
        query,
        count,
        timeoutMs,
      );
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queries.length) }, () =>
      worker(),
    ),
  );
  const completed = results.filter((result) => result.status === "searched");
  const sources = mergeDiscoveredSources(queries[0]!, results, maximumTotal);
  const allFailed = completed.length === 0;
  const partiallyFailed = completed.length < results.length;

  return {
    provider: activeProvider.name,
    status: allFailed ? "failed" : "searched",
    query: queries[0]!,
    queries,
    searched_at: new Date().toISOString(),
    sources,
    note: allFailed
      ? "Live web discovery could not be completed. No source evidence was acquired."
      : sources.length === 0
        ? "Live discovery returned no source leads. That is not evidence that the claim is false."
        : partiallyFailed
          ? "Some discovery queries failed; the returned source leads will be acquired and evaluated where possible."
          : "These are discovery leads. They become provenance evidence only after source acquisition and analysis.",
  };
}

/** Backward-compatible single-query search wrapper. */
export async function searchLiveWeb(claim: string): Promise<LiveSearchResult> {
  return searchLiveWebMulti([claim]);
}
