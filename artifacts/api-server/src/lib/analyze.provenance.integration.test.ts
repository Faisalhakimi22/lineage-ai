import { describe, expect, it } from "vitest";
import { lineages } from "../data/lineages";
import {
  type AnalysisDependencies,
  runAnalysis,
} from "./analyze";
import type {
  LiveSearchResult,
  LiveSearchSource,
} from "./live-search";
import type {
  EvidencePassage,
  EvidenceSnapshot,
  EvidenceSourceType,
} from "./provenance/types";

interface SnapshotFixture {
  id: string;
  url: string;
  publishedAt: string;
  claim: string;
  providerResultId?: string;
  title?: string;
  domain?: string;
  publisher?: string;
  author?: string;
  sourceType?: EvidenceSourceType;
  context?: string;
}

function sourceLead(
  id: string,
  url: string,
  description: string,
  publishedDate: string,
): LiveSearchSource {
  return {
    title: `Search result ${id}`,
    url,
    description,
    publisher: "Fixture publisher",
    published_date: publishedDate,
    provider_result_id: id,
    provider_score: 0.91,
    domain: new URL(url).hostname,
    discovered_by_queries: [description],
  };
}

function searchedResult(
  queries: readonly string[],
  sources: readonly LiveSearchSource[],
): LiveSearchResult {
  return {
    provider: "Tavily",
    status: "searched",
    query: queries[0] ?? null,
    queries: [...queries],
    searched_at: "2026-08-15T00:00:00.000Z",
    sources: [...sources],
    note: null,
  };
}

function snapshot(fixture: SnapshotFixture): EvidenceSnapshot {
  const claimPassage: EvidencePassage = {
    id: `passage:${fixture.id}:claim`,
    sourceId: fixture.id,
    text: fixture.claim,
    kind: "claim",
    relevance: 0.96,
  };
  const relevantPassages: EvidencePassage[] = [claimPassage];

  if (fixture.context) {
    relevantPassages.push({
      id: `passage:${fixture.id}:context`,
      sourceId: fixture.id,
      text: fixture.context,
      kind: "provenance",
      relevance: 0.94,
    });
  }

  return {
    id: fixture.id,
    providerResultId: fixture.providerResultId ?? `provider-${fixture.id}`,
    originalUrl: fixture.url,
    finalUrl: `${fixture.url}?resolved=1`,
    canonicalUrl: fixture.url,
    title: fixture.title ?? `Acquired article ${fixture.id}`,
    domain: fixture.domain ?? new URL(fixture.url).hostname,
    publisher: fixture.publisher ?? "Fixture News",
    author: fixture.author ?? "Evidence Reporter",
    publishedAt: fixture.publishedAt,
    modifiedAt: null,
    dateType: "publication",
    dateConfidence: 0.95,
    dateEvidence: `JSON-LD datePublished=${fixture.publishedAt}`,
    dateSource: "json_ld",
    dateEvidencePassageId: null,
    text: [fixture.claim, fixture.context].filter(Boolean).join(" "),
    relevantPassages,
    sourceType: fixture.sourceType ?? "news",
    providerScore: 0.91,
    retrievalRelevance: 0.9,
    claimRelevance: 0.96,
    evidenceRelevance: 0.96,
    acquisitionStatus: "acquired",
    acquisitionError: null,
    extractionConfidence: 0.96,
    discoveredByQueries: [fixture.claim],
  };
}

function controlledDependencies(
  sources: readonly LiveSearchSource[],
  snapshots: readonly EvidenceSnapshot[],
): Partial<AnalysisDependencies> {
  return {
    lineageCandidates: async () => lineages,
    search: async (queries) => searchedResult(queries, sources),
    acquire: async () => [...snapshots],
  };
}

function stage(
  result: Awaited<ReturnType<typeof runAnalysis>>,
  id: (typeof result.investigationStages)[number]["id"],
) {
  const found = result.investigationStages.find((item) => item.id === id);
  expect(found, `missing ${id} investigation stage`).toBeDefined();
  return found!;
}

describe("runAnalysis live-provenance integration", () => {
  it("keeps the exact Spain alias on the verified known-case fast path with linked stage evidence", async () => {
    const result = await runAnalysis(
      "Spain destroyed its own power plants and blamed Russia",
      "text",
      { dependencies: controlledDependencies([], []) },
    );

    expect(result.trace_status).toBe("PARTIALLY_TRACED");
    expect(result.lineage?.id).toBe("spain-portugal-blackout");
    expect(result.knownRecordMatch).toMatchObject({
      matched: true,
      lineageId: "spain-portugal-blackout",
      datasetProvenance: "externally_verified",
      eligibleAsVerifiedFastPath: true,
    });

    for (const id of [
      "earliest_source",
      "context_comparison",
      "mutation_detection",
      "origin_assessment",
    ] as const) {
      const knownStage = result.knownRecordStages.find((item) => item.id === id)!;
      expect(knownStage.status).toBe("established");
      expect(knownStage.evidenceIds.length).toBeGreaterThan(0);
      expect(knownStage.evidenceIds.every((evidenceId) => evidenceId.startsWith("known:"))).toBe(true);
      expect(knownStage.reason).toContain("known-record fast path");
    }

    expect(
      result.knownRecordStages.find((item) => item.id === "lineage")?.status,
    ).toBe("insufficient_evidence");
    expect(result.knownRecordScores.lineageCompleteness).toBe(0);
    expect(stage(result, "lineage").status).toBe("insufficient_evidence");

    // The linked curated record and runtime graph remain separate surfaces.
    expect(result.dynamicLineage.edges).toEqual([]);
  });

  it("preserves acquired evidence for an exact illustrative 5G match without inventing live provenance", async () => {
    const claim =
      "5G cell towers emit radiation levels proven to cause serious long-term health problems.";
    const lead = sourceLead(
      "5g-review",
      "https://evidence.example/reviews/5g-health",
      claim,
      "2022-03-10",
    );
    const acquired = snapshot({
      id: "source:5g-review",
      providerResultId: lead.provider_result_id ?? undefined,
      url: lead.url,
      publishedAt: "2022-03-10",
      claim,
      sourceType: "academic",
    });

    const result = await runAnalysis(claim, "text", {
      dependencies: controlledDependencies([lead], [acquired]),
    });

    expect(result.trace_status).toBe("UNTRACED");
    expect(result.lineage).toBeNull();
    expect(result.knownRecordMatch).toMatchObject({
      matched: true,
      lineageId: "5g-towers-health-risk",
      datasetProvenance: "illustrative",
      eligibleAsVerifiedFastPath: false,
    });
    expect(result.live_search.sources[0]).toMatchObject({
      provider_result_id: "5g-review",
      provider_score: 0.91,
      url: lead.url,
    });
    expect(result.evidenceSnapshots).toHaveLength(1);
    expect(result.evidenceSnapshots[0]).toMatchObject({
      id: acquired.id,
      providerResultId: "5g-review",
      acquisitionStatus: "acquired",
      publishedAt: "2022-03-10",
      dateType: "publication",
      dateConfidence: 0.95,
    });
    expect(result.sourceVersions).toHaveLength(1);
    expect(result.comparisons).toEqual([]);
    expect(result.mutations).toEqual([]);
    expect(result.originAssessment.misinformationOrigin.status).toBe(
      "insufficient_evidence",
    );
    expect(stage(result, "mutation_detection").status).toBe(
      "insufficient_evidence",
    );
    expect(stage(result, "origin_assessment").status).not.toBe("established");
    expect(stage(result, "lineage").status).toBe("insufficient_evidence");
    expect(result.dynamicLineage.edges).toEqual([]);
    expect(result.provenanceConfidence).toBeNull();
    expect(result.lineageCompleteness).toBe(0);
  });

  it("acquires and compares dated Pope puffer-jacket versions without connecting unsupported lineage edges", async () => {
    const submittedClaim =
      "Pope Francis was photographed wearing a white puffer jacket.";
    const originalLead = sourceLead(
      "pope-artwork",
      "https://report.example/2023/03/24/pope-ai-artwork",
      "An AI-generated image shows Pope Francis wearing a white puffer jacket.",
      "2023-03-24",
    );
    const viralLead = sourceLead(
      "pope-photo",
      "https://news.example/2023/03/26/pope-puffer-photo",
      "A photograph shows Pope Francis wearing a white puffer jacket.",
      "2023-03-26",
    );
    const originalSnapshot = snapshot({
      id: "source:pope-artwork",
      providerResultId: "pope-artwork",
      url: originalLead.url,
      publishedAt: "2023-03-24",
      claim:
        "An AI-generated image shows Pope Francis wearing a white puffer jacket.",
      title: "How the Pope puffer artwork first appeared",
      publisher: "Origin Report",
      author: "A. Reporter",
      sourceType: "news",
      context:
        "The AI-generated image was originally posted as AI artwork before it circulated as a real photograph.",
    });
    const viralSnapshot = snapshot({
      id: "source:pope-photo",
      providerResultId: "pope-photo",
      url: viralLead.url,
      publishedAt: "2023-03-26",
      claim: "A photograph shows Pope Francis wearing a white puffer jacket.",
      title: "Pope Francis in a white puffer jacket",
      publisher: "Viral News",
      author: "B. Reporter",
      sourceType: "news",
    });

    const result = await runAnalysis(submittedClaim, "text", {
      dependencies: controlledDependencies(
        [originalLead, viralLead],
        [viralSnapshot, originalSnapshot],
      ),
    });

    expect(result.liveInvestigation).toBe(true);
    expect(result.evidenceSnapshots).toHaveLength(2);
    expect(result.evidenceSnapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "source:pope-artwork",
          providerResultId: "pope-artwork",
          originalUrl: originalLead.url,
          finalUrl: `${originalLead.url}?resolved=1`,
          canonicalUrl: originalLead.url,
          publisher: "Origin Report",
          author: "A. Reporter",
          publishedAt: "2023-03-24",
          dateType: "publication",
          dateConfidence: 0.95,
          acquisitionStatus: "acquired",
        }),
      ]),
    );
    expect(result.evidenceSnapshots[0]).not.toHaveProperty("text");
    expect(result.sourceVersions).toHaveLength(2);
    expect(result.comparisons).toHaveLength(1);
    expect(result.comparisons[0]).toMatchObject({
      fromSourceId: "source:pope-artwork",
      toSourceId: "source:pope-photo",
      status: "established",
    });
    expect(stage(result, "context_comparison").status).toBe("established");

    // The detector is allowed to decline a label. If it emits one, both
    // source passages must support it and the graph edge must be identical to
    // that evidence-backed source-to-source relationship.
    for (const mutation of result.mutations) {
      expect(mutation.evidenceIds.length).toBeGreaterThanOrEqual(2);
      expect(mutation.fromSourceId).toBe("source:pope-artwork");
      expect(mutation.toSourceId).toBe("source:pope-photo");
      expect(result.dynamicLineage.edges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fromSourceId: mutation.fromSourceId,
            toSourceId: mutation.toSourceId,
            mutationType: mutation.mutationType,
            evidenceIds: mutation.evidenceIds,
          }),
        ]),
      );
    }
    expect(
      result.dynamicLineage.edges.some(
        (edge) => edge.toSourceId === "submitted-claim",
      ),
    ).toBe(false);
    expect(stage(result, "lineage").status).not.toBe("established");
  });

  it("reports a successful search for an unknown claim while leaving lineage insufficient", async () => {
    const claim = "The Northbridge city library will open two weeks early.";
    const lead = sourceLead(
      "library-announcement",
      "https://local.example/city-library-opening",
      claim,
      "2026-08-01",
    );
    const acquired = snapshot({
      id: "source:library-announcement",
      providerResultId: "library-announcement",
      url: lead.url,
      publishedAt: "2026-08-01",
      claim,
      sourceType: "news",
    });

    const result = await runAnalysis(claim, "text", {
      dependencies: controlledDependencies([lead], [acquired]),
    });

    expect(result.knownRecordMatch.matched).toBe(false);
    expect(result.trace_status).toBe("UNTRACED");
    expect(result.lineage).toBeNull();
    expect(result.live_search.status).toBe("searched");
    expect(stage(result, "live_search").status).toBe("established");
    expect(stage(result, "source_discovery").status).toBe("established");
    expect(result.evidenceSnapshots).toHaveLength(1);
    expect(result.sourceVersions).toHaveLength(1);
    expect(result.mutations).toEqual([]);
    expect(result.originAssessment.misinformationOrigin.status).toBe(
      "insufficient_evidence",
    );
    expect(stage(result, "lineage").status).toBe("insufficient_evidence");
    expect(result.dynamicLineage.edges).toEqual([]);
    expect(result.lineageCompleteness).toBe(0);
  });
});
