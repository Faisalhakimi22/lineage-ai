import { describe, expect, it } from "vitest";
import {
  buildDiscoveryQueries,
  meanSourceRelevance,
  normalizedUrlKey,
  rankEvidenceSnapshots,
  rankSearchSources,
  selectSourcesForAcquisition,
} from "./source-ranking";
import type { EvidenceSnapshot } from "./types";

function evidenceSnapshot(
  id: string,
  options: {
    providerScore: number;
    claimRelevance: number;
    evidenceRelevance: number;
    status?: EvidenceSnapshot["acquisitionStatus"];
  },
): EvidenceSnapshot {
  return {
    id,
    providerResultId: id,
    originalUrl: `https://${id}.example/story`,
    finalUrl: `https://${id}.example/story`,
    canonicalUrl: null,
    title: `${id} title`,
    domain: `${id}.example`,
    publisher: null,
    author: null,
    publishedAt: null,
    modifiedAt: null,
    dateType: "unknown",
    dateConfidence: 0,
    dateEvidence: null,
    dateSource: "unknown",
    dateEvidencePassageId: null,
    text: "acquired page content",
    relevantPassages: [
      {
        id: `ev-${id}`,
        sourceId: id,
        text: "acquired evidence passage",
        kind: "claim",
        relevance: options.evidenceRelevance,
      },
    ],
    sourceType: "news",
    providerScore: options.providerScore,
    retrievalRelevance: options.providerScore,
    claimRelevance: options.claimRelevance,
    evidenceRelevance: options.evidenceRelevance,
    acquisitionStatus: options.status ?? "acquired",
    acquisitionError: null,
    extractionConfidence: 0.9,
    discoveredByQueries: [],
  };
}

describe("source discovery planning and ranking", () => {
  it("builds at most three generic deterministic queries", () => {
    const first = buildDiscoveryQueries(
      "Pope Francis was photographed wearing a white puffer jacket.",
    );
    const second = buildDiscoveryQueries(
      "Pope Francis was photographed wearing a white puffer jacket.",
    );

    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(first[0]).toBe(
      "Pope Francis was photographed wearing a white puffer jacket.",
    );
    expect(first[1]).toContain("fact check context");
    expect(first[2]).toContain("origin");
    expect(first.every((query) => query.length <= 400)).toBe(true);
  });

  it("ranks exact claim evidence ahead of a high-score but irrelevant result", () => {
    const sources = [
      {
        title: "Unrelated popular page",
        url: "https://one.example/popular",
        description: "Weather and sport results",
        domain: "one.example",
        provider_score: 0.99,
      },
      {
        title: "Claim investigation",
        url: "https://two.example/claim",
        description: "5G caused COVID-19 is the exact allegation examined.",
        domain: "two.example",
        provider_score: 0.7,
      },
    ];

    expect(
      rankSearchSources("5G caused COVID-19", sources)[0]?.source.url,
    ).toBe("https://two.example/claim");
  });

  it("deduplicates tracking URLs and caps any one domain", () => {
    const sources = Array.from({ length: 5 }, (_, index) => ({
      title: `Claim source ${index}`,
      url:
        index === 1
          ? "https://same.example/story?utm_source=second"
          : `https://same.example/story-${index}`,
      description: "The exact claim appears in this source.",
      domain: "same.example",
      provider_score: 0.9 - index / 100,
    }));
    sources[0]!.url = "https://same.example/story?utm_source=first";

    expect(normalizedUrlKey(sources[0]!.url)).toBe(
      normalizedUrlKey(sources[1]!.url),
    );
    expect(selectSourcesForAcquisition("exact claim", sources, 5)).toHaveLength(
      2,
    );
  });

  it("keeps provider retrieval score separate from acquired evidence relevance", () => {
    const providerFavorite = evidenceSnapshot("provider-favorite", {
      providerScore: 0.99,
      claimRelevance: 0.08,
      evidenceRelevance: 0.05,
    });
    const supported = evidenceSnapshot("supported", {
      providerScore: 0.2,
      claimRelevance: 0.82,
      evidenceRelevance: 0.91,
    });

    const ranked = rankEvidenceSnapshots("the submitted claim", [
      providerFavorite,
      supported,
    ]);
    expect(ranked[0]?.snapshot.id).toBe("supported");
    expect(ranked[0]?.relevance).toBeCloseTo(0.8812, 4);
    expect(providerFavorite.providerScore).toBe(0.99);
    expect(meanSourceRelevance(ranked)).toBeLessThan(0.5);
  });

  it("gives blocked pages zero evidence relevance regardless of provider rank", () => {
    const blocked = evidenceSnapshot("blocked", {
      providerScore: 1,
      claimRelevance: 1,
      evidenceRelevance: 1,
      status: "blocked",
    });
    const [ranked] = rankEvidenceSnapshots("the submitted claim", [blocked]);
    expect(ranked).toMatchObject({
      claimRelevance: 0,
      evidenceRelevance: 0,
      relevance: 0,
    });
  });
});
