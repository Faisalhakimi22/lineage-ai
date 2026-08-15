import { afterEach, describe, expect, it, vi } from "vitest";
import { searchLiveWeb, searchLiveWebMulti } from "./live-search";

const originalKey = process.env["BRAVE_SEARCH_API_KEY"];
const originalTavilyKey = process.env["TAVILY_API_KEY"];
const originalTestSwitch = process.env["LIVE_SEARCH_IN_TEST"];
const originalFetch = globalThis.fetch;

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env["BRAVE_SEARCH_API_KEY"];
  } else {
    process.env["BRAVE_SEARCH_API_KEY"] = originalKey;
  }
  if (originalTavilyKey === undefined) {
    delete process.env["TAVILY_API_KEY"];
  } else {
    process.env["TAVILY_API_KEY"] = originalTavilyKey;
  }
  if (originalTestSwitch === undefined) {
    delete process.env["LIVE_SEARCH_IN_TEST"];
  } else {
    process.env["LIVE_SEARCH_IN_TEST"] = originalTestSwitch;
  }
  globalThis.fetch = originalFetch;
});

describe("live web search", () => {
  it("does not make an external request until a provider key is configured", async () => {
    delete process.env["BRAVE_SEARCH_API_KEY"];
    delete process.env["TAVILY_API_KEY"];
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const result = await searchLiveWeb(
      "A current claim that should stay local",
    );

    expect(result.status).toBe("not_configured");
    expect(result.sources).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns only safe, linkable search leads and exposes the outgoing query", async () => {
    process.env["BRAVE_SEARCH_API_KEY"] = "test-key";
    process.env["LIVE_SEARCH_IN_TEST"] = "on";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: "Official update",
                url: "https://example.org/update",
                description: "A source snippet",
                age: "3 hours ago",
                profile: { long_name: "Example Organisation" },
              },
              {
                title: "Unsafe URL",
                url: "javascript:alert(1)",
                description: "must not be returned",
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock;

    const result = await searchLiveWeb("A new fact needs a source");

    expect(result.status).toBe("searched");
    expect(result.query).toBe("A new fact needs a source");
    expect(result.sources).toEqual([
      {
        title: "Official update",
        url: "https://example.org/update",
        description: "A source snippet",
        publisher: "Example Organisation",
        published_date: "3 hours ago",
        provider_result_id: null,
        provider_score: null,
        domain: "example.org",
        discovered_by_queries: ["A new fact needs a source"],
      },
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps the local analysis usable when the provider fails", async () => {
    process.env["BRAVE_SEARCH_API_KEY"] = "test-key";
    process.env["LIVE_SEARCH_IN_TEST"] = "on";
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await searchLiveWeb("An unavailable search provider");

    expect(result.status).toBe("failed");
    expect(result.sources).toEqual([]);
    expect(result.note).toContain("could not be completed");
  });

  it("uses Tavily when it is the configured live-search provider", async () => {
    delete process.env["BRAVE_SEARCH_API_KEY"];
    process.env["TAVILY_API_KEY"] = "tvly-test-key";
    process.env["LIVE_SEARCH_IN_TEST"] = "on";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: "tavily-result-1",
              title: "Fresh source",
              url: "https://example.org/fresh",
              content: "A current source snippet",
              published_date: "2026-08-14",
              score: 0.91,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock;

    const result = await searchLiveWeb("A current claim");

    expect(result.provider).toBe("Tavily");
    expect(result.sources[0]?.description).toBe("A current source snippet");
    expect(result.sources[0]).toMatchObject({
      provider_result_id: "tavily-result-1",
      provider_score: 0.91,
      domain: "example.org",
      discovered_by_queries: ["A current claim"],
    });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });

  it("merges deterministic multi-query results without discarding discovery provenance", async () => {
    delete process.env["BRAVE_SEARCH_API_KEY"];
    process.env["TAVILY_API_KEY"] = "tvly-test-key";
    process.env["LIVE_SEARCH_IN_TEST"] = "on";
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { query: string };
      return new Response(
        JSON.stringify({
          results: [
            {
              id: `id-${request.query}`,
              title: "Shared source",
              url: "https://example.org/article?utm_source=test",
              content: `Evidence returned for ${request.query}`,
              score: request.query === "claim wording" ? 0.7 : 0.9,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    globalThis.fetch = fetchMock;

    const result = await searchLiveWebMulti([
      "claim wording",
      '"claim wording" context',
      '"claim wording" origin first posted',
      "a fourth query must not run",
    ]);

    expect(result.queries).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      provider_score: 0.9,
      domain: "example.org",
      discovered_by_queries: result.queries,
    });
  });
});
