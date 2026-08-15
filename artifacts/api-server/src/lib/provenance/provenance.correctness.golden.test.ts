import { afterEach, describe, expect, it, vi } from "vitest";
import { lineages } from "../../data/lineages";
import {
  type AnalysisDependencies,
  runAnalysis,
} from "../analyze";
import type {
  LiveSearchResult,
  LiveSearchSource,
} from "../live-search";
import {
  compareLatestVersionToSubmittedOccurrence,
  compareSourceVersions,
} from "./context-comparison";
import { runProvenanceInvestigation } from "./investigation";
import { buildRuntimeLineageGraph } from "./lineage-graph";
import { detectMutations } from "./mutation-detection";
import type {
  ClaimType,
  CorrectionVerdict,
  EvidencePassage,
  EvidenceSnapshot,
  SourceClaimVersion,
  SourceStance,
  SubmittedOccurrence,
} from "./types";
import { normalizeClaimProposition } from "./version-extraction";

/**
 * Golden correctness fixtures exercise known real-world failure shapes without
 * pretending that the fixture URLs are live evidence. `fixture.test` is the
 * reserved test domain; only an explicit passage inside a fixture may establish
 * a relationship. Dates, similarity, and array order are deliberately unable
 * to do so.
 */

interface SnapshotInput {
  caseId: string;
  id: string;
  date: string;
  claim: string;
  publisher: string;
  title?: string;
  context?: string[];
}

function passage(
  sourceId: string,
  suffix: string,
  text: string,
  kind: EvidencePassage["kind"] = "claim",
  relevance = 0.96,
): EvidencePassage {
  return {
    id: `passage:${sourceId}:${suffix}`,
    sourceId,
    text,
    kind,
    relevance,
  };
}

function snapshot(input: SnapshotInput): EvidenceSnapshot {
  const claimPassage = passage(input.id, "claim", input.claim);
  const contextPassages = (input.context ?? []).map((text, index) =>
    passage(input.id, `provenance-${index + 1}`, text, "provenance", 0.95),
  );
  const domain = `${input.caseId}.fixture.test`;
  const url = `https://${domain}/${input.id}`;
  return {
    id: input.id,
    providerResultId: `provider:${input.id}`,
    originalUrl: url,
    finalUrl: url,
    canonicalUrl: url,
    title: input.title ?? `Controlled ${input.caseId} evidence`,
    domain,
    publisher: input.publisher,
    author: "Golden fixture",
    publishedAt: input.date,
    modifiedAt: null,
    dateType: "publication",
    dateConfidence: 0.96,
    dateEvidence: `datePublished=${input.date}`,
    dateSource: "json_ld",
    dateEvidencePassageId: null,
    text: [input.claim, ...(input.context ?? [])].join("\n"),
    relevantPassages: [claimPassage, ...contextPassages],
    sourceType: "news",
    providerScore: 0.99,
    retrievalRelevance: 0.94,
    claimRelevance: 0.93,
    evidenceRelevance: 0.92,
    acquisitionStatus: "acquired",
    acquisitionError: null,
    extractionConfidence: 0.96,
    discoveredByQueries: [input.claim],
  };
}

interface VersionOverrides {
  normalizedProposition?: string;
  narrator?: string | null;
  quotedSpeaker?: string | null;
  sourceStance?: SourceStance;
  correctionVerdict?: CorrectionVerdict;
  claimType?: ClaimType;
  subject?: string | null;
  event?: string | null;
  eventDate?: string | null;
  location?: string | null;
  actor?: string | null;
  attribution?: string | null;
  causalLanguage?: string | null;
  certainty?: SourceClaimVersion["certainty"];
  captionContext?: string | null;
  qualifiers?: string[];
}

function version(
  source: EvidenceSnapshot,
  overrides: VersionOverrides = {},
): SourceClaimVersion {
  const evidence = source.relevantPassages.find(
    (item) => item.kind === "claim",
  )!;
  return {
    id: `version:${source.id}`,
    sourceId: source.id,
    claim: evidence.text,
    normalizedProposition:
      overrides.normalizedProposition ?? normalizeClaimProposition(evidence.text),
    narrator: overrides.narrator ?? source.publisher,
    quotedSpeaker: overrides.quotedSpeaker ?? null,
    sourceStance: overrides.sourceStance ?? "asserts",
    correctionVerdict: overrides.correctionVerdict ?? "not_applicable",
    claimType: overrides.claimType ?? "claim",
    evidencePassageId: evidence.id,
    subject: overrides.subject ?? null,
    event: overrides.event ?? null,
    eventDate: overrides.eventDate ?? null,
    location: overrides.location ?? null,
    actor: overrides.actor ?? null,
    attribution: overrides.attribution ?? null,
    causalLanguage: overrides.causalLanguage ?? null,
    certainty: overrides.certainty ?? "asserted",
    captionContext: overrides.captionContext ?? null,
    qualifiers: overrides.qualifiers ?? [],
    evidenceIds: [evidence.id],
    confidence: 0.95,
    extractionMethod: "deterministic",
  };
}

function occurrenceFor(
  latest: EvidenceSnapshot,
  exactText: string,
  status: "established" | "candidate" = "established",
): SubmittedOccurrence {
  const id = `submitted-occurrence:${latest.id}`;
  const occurrencePassageId = `${id}:occurrence`;
  const occurrenceEvidence = {
    sourceId: id,
    passageId: occurrencePassageId,
    exactText,
    role: "occurrence" as const,
  };
  const latestClaim = latest.relevantPassages.find(
    (item) => item.kind === "claim",
  )!;
  const relationshipPassage =
    latest.relevantPassages.find((item) => item.kind === "provenance") ??
    latestClaim;
  return {
    id,
    claim: exactText,
    exactText,
    normalizedProposition: normalizeClaimProposition(exactText),
    evidenceType: "source_post",
    sourceUrl: "https://submission.fixture.test/post/123",
    sourceIdentifier: "post-123",
    timestamp: "2026-01-01T00:00:00.000Z",
    sourceContext: "Controlled request occurrence",
    evidenceIds: [occurrencePassageId],
    evidence: [occurrenceEvidence],
    confidence: status === "established" ? 0.95 : 0.7,
    sourceRelationship: {
      fromSourceId: latest.id,
      relationship: "reposted_from",
      status,
      confidence: status === "established" ? 0.95 : 0.7,
      reason: "The request fixture supplies an explicit repost identity.",
      evidence: [
        {
          sourceId: latest.id,
          passageId: latestClaim.id,
          exactText: latestClaim.text,
          role: "before",
        },
        {
          sourceId: latest.id,
          passageId: relationshipPassage.id,
          exactText: relationshipPassage.text,
          role: "source_reference",
        },
        occurrenceEvidence,
      ],
    },
  };
}

function graphFor(
  claim: string,
  snapshots: EvidenceSnapshot[],
  versions: SourceClaimVersion[],
  occurrence: SubmittedOccurrence | null = null,
) {
  const comparisons = compareSourceVersions(versions, snapshots);
  const occurrenceComparison = compareLatestVersionToSubmittedOccurrence(
    versions,
    snapshots,
    occurrence,
  );
  if (occurrenceComparison) comparisons.push(occurrenceComparison);
  const mutations = detectMutations(comparisons);
  const graph = buildRuntimeLineageGraph({
    claim,
    snapshots,
    versions,
    comparisons,
    mutations,
    submittedOccurrence: occurrence,
    // This proves the legacy claim-extraction id is never occurrence evidence.
    submittedEvidenceId: "submission:normalized-claim-only",
  });
  return { comparisons, mutations, graph };
}

function searchedResult(
  queries: readonly string[],
  sources: LiveSearchSource[] = [],
): LiveSearchResult {
  return {
    provider: "Tavily",
    status: "searched",
    query: queries[0] ?? null,
    queries: [...queries],
    searched_at: "2026-08-15T00:00:00.000Z",
    sources,
    note: null,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("golden provenance correctness suite", () => {
  it("Pope puffer: dates and a plausible caption shift do not manufacture transmission", () => {
    const original = snapshot({
      caseId: "pope-puffer",
      id: "pope-original",
      date: "2023-03-24",
      publisher: "Artwork Report",
      claim:
        "An AI-generated image shows Pope Francis wearing a white puffer jacket.",
    });
    const circulating = snapshot({
      caseId: "pope-puffer",
      id: "pope-circulating",
      date: "2023-03-26",
      publisher: "Viral Image Report",
      claim:
        "A photograph shows Pope Francis wearing a white puffer jacket.",
    });
    const versions = [
      version(original, {
        normalizedProposition:
          "image shows pope francis wearing a white puffer jacket",
        claimType: "caption",
        captionContext: "AI-generated artwork",
      }),
      version(circulating, {
        normalizedProposition:
          "image shows pope francis wearing a white puffer jacket",
        claimType: "caption",
        captionContext: "Presented as a genuine photograph",
      }),
    ];

    const { comparisons, mutations, graph } = graphFor(
      "Pope Francis was photographed wearing a white puffer jacket.",
      [circulating, original],
      [versions[1]!, versions[0]!],
    );

    expect(comparisons).toHaveLength(1);
    expect(comparisons[0]?.relationship.type).toBe("same_claim");
    expect(comparisons[0]?.relationship.reason).toContain(
      "not source-to-source transmission",
    );
    expect(mutations).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.submittedOccurrenceConnected).toBe(false);
    expect(graph.establishedTransitionCount).toBe(0);
  });

  it("Pelosi quotation: headline, narrator, and quoted speaker differences are not mutations", () => {
    const headline = snapshot({
      caseId: "pelosi-quotation",
      id: "pelosi-headline",
      date: "2010-03-09",
      publisher: "Headline Desk",
      claim: "Pelosi: Pass health reform so you can find out what is in it.",
    });
    const transcript = snapshot({
      caseId: "pelosi-quotation",
      id: "pelosi-transcript",
      date: "2010-03-10",
      publisher: "Speech Transcript",
      claim:
        'Nancy Pelosi said, "We have to pass the bill so that you can find out what is in it."',
    });
    const proposition =
      "we have to pass the bill so that you can find out what is in it";
    const versions = [
      version(headline, {
        normalizedProposition: proposition,
        narrator: "Headline Desk",
        quotedSpeaker: null,
        sourceStance: "reports",
        claimType: "headline",
      }),
      version(transcript, {
        normalizedProposition: proposition,
        narrator: "Speech Transcript",
        quotedSpeaker: "Nancy Pelosi",
        sourceStance: "quotes",
        claimType: "quotation",
      }),
    ];

    const { comparisons, mutations, graph } = graphFor(
      proposition,
      [headline, transcript],
      versions,
    );

    expect(comparisons[0]?.changes).toEqual([]);
    expect(comparisons[0]?.relationship.type).toBe("same_claim");
    expect(mutations).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.status).toBe("insufficient_evidence");
  });

  it("Maui directed-energy: an introduced cause remains a candidate even with explicit citation", () => {
    const report = snapshot({
      caseId: "maui-directed-energy",
      id: "maui-report",
      date: "2023-08-10",
      publisher: "Maui Incident Report",
      claim: "The Maui fires occurred; their cause had not been established.",
    });
    const later = snapshot({
      caseId: "maui-directed-energy",
      id: "maui-later",
      date: "2023-08-12",
      publisher: "Viral Post Archive",
      claim:
        "The Maui fires occurred because a directed-energy weapon caused them.",
      context: [
        "According to Maui Incident Report, this post supplies a directed-energy explanation.",
      ],
    });
    const versions = [
      version(report, {
        normalizedProposition: "the maui fires occurred cause unknown",
        causalLanguage: null,
      }),
      version(later, {
        normalizedProposition:
          "the maui fires occurred because a directed energy weapon caused them",
        causalLanguage: "because a directed-energy weapon caused them",
      }),
    ];
    const occurrence = occurrenceFor(later, later.relevantPassages[0]!.text, "candidate");

    const { comparisons, mutations, graph } = graphFor(
      later.relevantPassages[0]!.text,
      [later, report],
      [versions[1]!, versions[0]!],
      occurrence,
    );

    expect(comparisons[0]?.relationship).toMatchObject({
      type: "quoted_from",
      status: "established",
    });
    expect(comparisons[0]?.changes.map((change) => change.type)).toContain(
      "cause_introduced",
    );
    expect(mutations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mutationType: "fabricated_cause",
          status: "candidate",
        }),
      ]),
    );
    expect(
      mutations.find((item) => item.mutationType === "fabricated_cause")
        ?.evidence,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: report.id, role: "before" }),
        expect.objectContaining({ sourceId: later.id, role: "after" }),
        expect.objectContaining({ role: "source_reference" }),
      ]),
    );
    expect(graph.edges.every((edge) => edge.status === "candidate")).toBe(true);
    expect(graph.submittedOccurrenceConnected).toBe(false);
    expect(graph.establishedTransitionCount).toBe(0);
    expect(graph.status).toBe("candidate");
  });

  it("Japan tsunami: explicit same-media evidence can establish reuse, but a disconnected claim stays incomplete", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const archive = snapshot({
      caseId: "japan-tsunami",
      id: "japan-2011",
      date: "2011-03-12",
      publisher: "Japan Video Archive",
      claim: "A video shows the Japan tsunami on 2011-03-11.",
    });
    const recirculation = snapshot({
      caseId: "japan-tsunami",
      id: "japan-2024",
      date: "2024-01-02",
      publisher: "Reuse Investigation",
      claim: "The same video shows the Japan tsunami on 2024-01-01.",
      context: [
        "This same video was originally published by Japan Video Archive and recirculated with the 2024 caption.",
      ],
    });

    const result = await runProvenanceInvestigation({
      claim: "A video shows the 2024 Japan tsunami.",
      snapshots: [recirculation, archive],
      liveSearchStatus: "searched",
      liveSearchEvidenceIds: ["search:japan"],
      submittedEvidenceId: "submission:normalized-claim-only",
    });

    const reuse = result.mutations.find(
      (mutation) => mutation.mutationType === "recycled_old_media",
    );
    expect(result.sourceVersions).toHaveLength(2);
    expect(
      result.comparisons.find(
        (comparison) =>
          comparison.fromSourceId === archive.id &&
          comparison.toSourceId === recirculation.id,
      )?.relationship,
    ).toMatchObject({ type: "same_media", status: "established" });
    expect(reuse).toMatchObject({ status: "established" });
    expect(reuse?.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: archive.id, role: "before" }),
        expect.objectContaining({ sourceId: recirculation.id, role: "after" }),
        expect.objectContaining({ role: "source_reference" }),
      ]),
    );
    expect(result.dynamicLineage.edges.length).toBeGreaterThan(0);
    expect(result.dynamicLineage.submittedOccurrenceConnected).toBe(false);
    expect(result.dynamicLineage.establishedTransitionCount).toBe(0);
    expect(result.scores.lineageCompleteness).toBe(0);
    expect(
      result.dynamicLineage.edges.some(
        (edge) => edge.toSourceId === "submitted-claim",
      ),
    ).toBe(false);

    // Even when request-specific evidence establishes the final repost, the
    // parallel candidate out-of-date label on the same A -> B transition keeps
    // the graph provisional. Established edge count alone must never render
    // this as 100% complete.
    const occurrence = occurrenceFor(
      recirculation,
      recirculation.relevantPassages[0]!.text,
    );
    const withOccurrence = await runProvenanceInvestigation({
      claim: occurrence.claim,
      snapshots: [recirculation, archive],
      liveSearchStatus: "searched",
      liveSearchEvidenceIds: ["search:japan-with-occurrence"],
      submittedOccurrence: occurrence,
    });
    expect(withOccurrence.dynamicLineage.submittedOccurrenceConnected).toBe(
      true,
    );
    expect(withOccurrence.dynamicLineage.establishedTransitionCount).toBe(
      withOccurrence.dynamicLineage.requiredTransitionCount,
    );
    expect(
      withOccurrence.dynamicLineage.edges.some(
        (edge) => edge.status === "candidate",
      ),
    ).toBe(true);
    expect(withOccurrence.dynamicLineage.status).toBe("candidate");
    expect(withOccurrence.scores.lineageCompleteness).toBe(0);
  });

  it("Trump animals: supported context loss is a mutation only when an explicit source relationship exists", () => {
    const transcript = snapshot({
      caseId: "trump-animals",
      id: "trump-transcript",
      date: "2018-05-16",
      publisher: "Roundtable Transcript",
      claim: "Trump described MS-13 gang members as animals.",
    });
    const later = snapshot({
      caseId: "trump-animals",
      id: "trump-later",
      date: "2018-05-17",
      publisher: "Later Report",
      claim: "Trump described immigrants as animals.",
      context: [
        "As reported by Roundtable Transcript, Trump described immigrants as animals.",
      ],
    });
    const versions = [
      version(transcript, {
        normalizedProposition: "trump described people as animals",
        qualifiers: ["MS-13 gang members"],
      }),
      version(later, {
        normalizedProposition: "trump described people as animals",
        qualifiers: [],
      }),
    ];

    const { comparisons, mutations, graph } = graphFor(
      later.relevantPassages[0]!.text,
      [transcript, later],
      versions,
    );

    expect(comparisons[0]?.relationship).toMatchObject({
      type: "quoted_from",
      status: "established",
    });
    expect(comparisons[0]?.changes.map((change) => change.type)).toEqual([
      "context_removed",
    ]);
    expect(mutations).toEqual([
      expect.objectContaining({
        mutationType: "stripped_context",
        status: "established",
      }),
    ]);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]?.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: transcript.id, role: "before" }),
        expect.objectContaining({ sourceId: later.id, role: "after" }),
        expect.objectContaining({ role: "source_reference" }),
      ]),
    );
    expect(graph.submittedOccurrenceConnected).toBe(false);
    expect(graph.status).toBe("candidate");
  });

  it("5G/COVID: fact-check stance versus claim wording does not create a mutation or origin", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const factCheck = snapshot({
      caseId: "5g-covid",
      id: "5g-fact-check",
      date: "2020-04-05",
      publisher: "Fact Check",
      claim: "Fact-check claim: 5G caused COVID-19. This claim is false.",
    });
    const research = snapshot({
      caseId: "5g-covid",
      id: "5g-research",
      date: "2020-05-01",
      publisher: "Research Review",
      claim: "Researchers found no evidence that 5G caused COVID-19.",
    });

    const result = await runProvenanceInvestigation({
      claim: "5G caused COVID-19.",
      snapshots: [research, factCheck],
      liveSearchStatus: "searched",
      liveSearchEvidenceIds: ["search:5g-covid"],
      submittedEvidenceId: "submission:normalized-claim-only",
    });

    expect(result.sourceVersions.length).toBeGreaterThan(0);
    expect(
      result.sourceVersions.every((item) => item.evidencePassageId.length > 0),
    ).toBe(true);
    expect(result.mutations).toEqual([]);
    expect(result.dynamicLineage.edges).toEqual([]);
    expect(result.originAssessment.misinformationOrigin.status).toBe(
      "insufficient_evidence",
    );
    expect(
      result.investigationStages.find(
        (stage) => stage.id === "mutation_detection",
      )?.status,
    ).toBe("insufficient_evidence");
    expect(result.scores.lineageCompleteness).toBe(0);
  });

  it("Spain blackout: curated independent strands stay branched and do not promote live stages", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const dependencies: Partial<AnalysisDependencies> = {
      lineageCandidates: async () => lineages,
      search: async (queries) => searchedResult(queries),
      acquire: async () => [],
    };

    const result = await runAnalysis(
      "Spain destroyed its own power plants and blamed Russia",
      "text",
      { dependencies },
    );
    const spain = lineages.find(
      (lineage) => lineage.id === "spain-portugal-blackout",
    )!;

    expect(result.knownRecordMatch).toMatchObject({
      matched: true,
      lineageId: "spain-portugal-blackout",
      eligibleAsVerifiedFastPath: true,
    });
    expect(result.knownRecordStages.length).toBeGreaterThan(0);
    expect(
      result.investigationStages.flatMap((stage) => stage.evidenceIds),
    ).not.toEqual(expect.arrayContaining([expect.stringMatching(/^known:/)]));
    expect(
      result.knownRecordStages.find((stage) => stage.id === "lineage")?.status,
    ).toBe("insufficient_evidence");
    expect(result.knownRecordScores.lineageCompleteness).toBe(0);
    expect(result.dynamicLineage.edges).toEqual([]);
    expect(result.lineageCompleteness).toBe(0);
    expect(
      spain.curated_relationships.some(
        (relationship) =>
          relationship.from_node_id === "hop-2" &&
          relationship.to_node_id === "hop-3",
      ),
    ).toBe(false);
    expect(
      spain.curated_relationships.filter(
        (relationship) => relationship.from_node_id === "hop-1",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          to_node_id: "hop-2",
          relationship: "related_claim",
        }),
        expect.objectContaining({
          to_node_id: "hop-3",
          relationship: "related_claim",
        }),
      ]),
    );
    expect(result.trace_status).not.toBe("TRACED");
  });

  it("unknown Sahara pyramid: discovery can succeed while every lineage edge remains absent", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const unknown = snapshot({
      caseId: "sahara-pyramid",
      id: "sahara-report",
      date: "2026-08-01",
      publisher: "Archaeology News",
      claim:
        "A newly discovered pyramid beneath the Sahara contains a glass chamber.",
    });

    const result = await runProvenanceInvestigation({
      claim:
        "A newly discovered pyramid beneath the Sahara contains a glass chamber.",
      snapshots: [unknown],
      liveSearchStatus: "searched",
      liveSearchEvidenceIds: ["search:sahara"],
      submittedEvidenceId: "submission:normalized-claim-only",
    });

    expect(result.liveInvestigation).toBe(true);
    expect(result.sourceVersions).toHaveLength(1);
    expect(result.dynamicLineage.edges).toEqual([]);
    expect(result.dynamicLineage.submittedOccurrenceConnected).toBe(false);
    expect(result.dynamicLineage.status).toBe("insufficient_evidence");
    expect(result.originAssessment.misinformationOrigin.status).toBe(
      "insufficient_evidence",
    );
    expect(result.scores.provenanceConfidence).toBeNull();
    expect(result.scores.lineageCompleteness).toBe(0);
  });

  it("hard invariant: a normalized claim id cannot authorize an occurrence edge", () => {
    const source = snapshot({
      caseId: "occurrence-invariant",
      id: "source",
      date: "2026-01-01",
      publisher: "Source Publisher",
      claim: "The event happened.",
    });
    const sourceVersion = version(source, {
      normalizedProposition: "the event happened",
    });
    const graph = buildRuntimeLineageGraph({
      claim: "The event happened.",
      snapshots: [source],
      versions: [sourceVersion],
      comparisons: [],
      mutations: [],
      submittedEvidenceId: "submission:lexically-identical",
    });

    expect(graph.nodes.some((node) => node.kind === "submitted_occurrence")).toBe(
      false,
    );
    expect(
      graph.edges.some((edge) => edge.toSourceId === "submitted-claim"),
    ).toBe(false);
    expect(graph.submittedOccurrenceConnected).toBe(false);
    expect(graph.establishedTransitionCount).toBe(0);
  });
});
