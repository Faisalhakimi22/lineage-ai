import { describe, expect, it } from "vitest";
import type { LLMProvider } from "../llm";
import {
  compareLatestVersionToSubmittedOccurrence,
  compareSourceVersions,
} from "./context-comparison";
import { runProvenanceInvestigation } from "./investigation";
import { buildRuntimeLineageGraph } from "./lineage-graph";
import { detectMutations } from "./mutation-detection";
import { assessOrigin } from "./origin-assessment";
import { findEarliestRelevantSource } from "./temporal-ordering";
import type {
  EvidencePassage,
  EvidenceSnapshot,
  SourceClaimVersion,
  SubmittedOccurrence,
} from "./types";
import {
  extractClaimVersions,
  extractClaimVersionsWithAid,
} from "./version-extraction";

function passage(
  id: string,
  sourceId: string,
  text: string,
  kind: EvidencePassage["kind"] = "claim",
  relevance = 0.95,
): EvidencePassage {
  return { id, sourceId, text, kind, relevance };
}

function snapshot(
  id: string,
  publishedAt: string | null,
  passages: EvidencePassage[],
  overrides: Partial<EvidenceSnapshot> = {},
): EvidenceSnapshot {
  return {
    id,
    providerResultId: `provider:${id}`,
    originalUrl: `https://example.test/${id}`,
    finalUrl: `https://example.test/${id}`,
    canonicalUrl: `https://example.test/${id}`,
    title: `Source ${id}`,
    domain: "example.test",
    publisher: "Example",
    author: null,
    publishedAt,
    modifiedAt: null,
    dateType: publishedAt ? "publication" : "unknown",
    dateConfidence: publishedAt ? 0.95 : 0,
    dateEvidence: publishedAt,
    dateSource: publishedAt ? "json_ld" : "unknown",
    dateEvidencePassageId: null,
    text: passages.map((item) => item.text).join("\n"),
    relevantPassages: passages,
    sourceType: "news",
    providerScore: 0.9,
    retrievalRelevance: 0.9,
    claimRelevance: 0.95,
    evidenceRelevance: 0.95,
    acquisitionStatus: "acquired",
    acquisitionError: null,
    extractionConfidence: 0.95,
    discoveredByQueries: ["test claim"],
    ...overrides,
  };
}

function version(
  id: string,
  sourceId: string,
  evidenceId: string,
  overrides: Partial<SourceClaimVersion> = {},
): SourceClaimVersion {
  return {
    id,
    sourceId,
    claim: "A sourced claim.",
    normalizedProposition: "a sourced claim",
    narrator: "Example",
    quotedSpeaker: null,
    sourceStance: "asserts",
    correctionVerdict: "not_applicable",
    claimType: "claim",
    evidencePassageId: evidenceId,
    subject: "A sourced claim",
    event: "was reported",
    eventDate: null,
    location: null,
    actor: null,
    attribution: null,
    causalLanguage: null,
    certainty: "asserted",
    captionContext: null,
    qualifiers: [],
    evidenceIds: [evidenceId],
    confidence: 0.95,
    extractionMethod: "deterministic",
    ...overrides,
  };
}

describe("deterministic provenance analysis", () => {
  it("selects A as the earliest relevant source from A/B/C dates without calling it origin", () => {
    const snapshots = [
      snapshot("source-c", "2023-03-28", [passage("p-c", "source-c", "The claim was reported.")]),
      snapshot("source-a", "2023-03-24", [passage("p-a", "source-a", "The claim was reported.")]),
      snapshot("source-b", "2023-03-26", [passage("p-b", "source-b", "The claim was reported.")]),
    ];
    const versions = [
      version("v-c", "source-c", "p-c"),
      version("v-a", "source-a", "p-a"),
      version("v-b", "source-b", "p-b"),
    ];

    const finding = findEarliestRelevantSource(snapshots, versions);

    expect(finding.status).toBe("established");
    expect(finding.sourceId).toBe("source-a");
    expect(finding.date).toBe("2023-03-24");
    expect(finding.reason).toContain("does not by itself establish origin");

    const origin = assessOrigin(snapshots, versions, finding);
    expect(origin.earliestRelevantSource.sourceId).toBe("source-a");
    expect(origin.misinformationOrigin.status).toBe("insufficient_evidence");
    expect(origin.likelyOriginCandidate.status).toBe("candidate");
  });

  it("does not turn a date-ordered cause difference into a mutation without transmission evidence", () => {
    const beforeSnapshot = snapshot(
      "before",
      "2023-03-24",
      [passage("before-claim", "before", "A blackout occurred.")],
    );
    const afterSnapshot = snapshot(
      "after",
      "2023-03-26",
      [passage("after-claim", "after", "A blackout occurred because of sanctions.")],
    );
    const snapshots = [beforeSnapshot, afterSnapshot];
    const versions = [
      version("before-version", "before", "before-claim", {
        claim: "A blackout occurred.",
        normalizedProposition: "a blackout occurred",
        subject: "A blackout",
        causalLanguage: null,
      }),
      version("after-version", "after", "after-claim", {
        claim: "A blackout occurred because of sanctions.",
        normalizedProposition: "a blackout occurred because of sanctions",
        subject: "A blackout",
        causalLanguage: "because of sanctions",
      }),
    ];

    const comparisons = compareSourceVersions(versions, snapshots);
    const cause = comparisons[0]?.changes.find(
      (change) => change.type === "cause_introduced",
    );
    expect(cause?.evidenceIds).toEqual(
      expect.arrayContaining(["before-claim", "after-claim"]),
    );

    expect(detectMutations(comparisons)).toEqual([]);

    const relationshipProof = passage(
      "relationship-proof",
      "after",
      "This report was derived from https://example.test/before and adds the sanctions explanation.",
      "provenance",
      0.98,
    );
    const relatedComparisons = compareSourceVersions(versions, [
      beforeSnapshot,
      snapshot("after", "2023-03-26", [
        passage(
          "after-claim",
          "after",
          "A blackout occurred because of sanctions.",
        ),
        relationshipProof,
      ]),
    ]);
    const mutations = detectMutations(relatedComparisons);
    expect(mutations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mutationType: "fabricated_cause",
          status: "candidate",
          evidenceIds: expect.arrayContaining(["before-claim", "after-claim"]),
        }),
      ]),
    );

    const ungroundedVersions = [versions[0]!, { ...versions[1]!, evidenceIds: ["before-claim"] }];
    expect(
      detectMutations(
        compareSourceVersions(ungroundedVersions, [
          beforeSnapshot,
          snapshot("after", "2023-03-26", [
            passage("after-claim", "after", "A blackout occurred because of sanctions."),
            relationshipProof,
          ]),
        ]),
      ).some((mutation) => mutation.mutationType === "fabricated_cause"),
    ).toBe(false);
  });

  it("does not report a mutation for wording differences when semantic fields are unchanged", () => {
    const snapshots = [
      snapshot("first", "2023-03-24", [passage("first-claim", "first", "Pope Francis wore a white coat.")]),
      snapshot("second", "2023-03-26", [passage("second-claim", "second", "Pope Francis was wearing a white coat.")]),
    ];
    const versions = [
      version("first-version", "first", "first-claim", {
        claim: "Pope Francis wore a white coat.",
        subject: "Pope Francis",
        event: "wore a white coat",
      }),
      version("second-version", "second", "second-claim", {
        claim: "Pope Francis was wearing a white coat.",
        subject: "Pope Francis",
        event: "was wearing a white coat",
      }),
    ];

    const comparison = compareSourceVersions(versions, snapshots)[0]!;
    expect(comparison.status).toBe("established");
    expect(comparison.changes).toEqual([]);
    expect(detectMutations([comparison])).toEqual([]);
  });

  it("does not interpret headline, pronoun, narrator, or fact-check framing as a Pelosi mutation", () => {
    const snapshots = [
      snapshot("headline", "2010-03-09", [
        passage(
          "headline-passage",
          "headline",
          "Pelosi: Pass Health Reform So You Can Find Out What's In It",
        ),
      ]),
      snapshot("quotation", "2017-03-18", [
        passage(
          "quotation-passage",
          "quotation",
          'Nancy Pelosi said, "We have to pass the bill so that you can find out what is in it."',
        ),
      ]),
      snapshot("fact-check", "2017-06-22", [
        passage(
          "fact-check-passage",
          "fact-check",
          "Fact check claim: House Minority Leader Nancy Pelosi said the bill had to pass before people could find out what was in it.",
        ),
      ]),
    ];
    const versions = [
      version("headline-version", "headline", "headline-passage", {
        claim: "Pelosi: Pass Health Reform So You Can Find Out What's In It",
        normalizedProposition: "pass health reform so you can find out what is in it",
        narrator: "US News",
        quotedSpeaker: null,
        sourceStance: "asserts",
        claimType: "headline",
        subject: "Pelosi: Pass Health Reform So You",
      }),
      version("quotation-version", "quotation", "quotation-passage", {
        claim:
          'Nancy Pelosi said, "We have to pass the bill so that you can find out what is in it."',
        normalizedProposition:
          "we have to pass the bill so that you can find out what is in it",
        narrator: "Pelosi archive",
        quotedSpeaker: "Nancy Pelosi",
        sourceStance: "quotes",
        claimType: "quotation",
        subject: "Nancy Pelosi",
      }),
      version("fact-check-version", "fact-check", "fact-check-passage", {
        claim:
          "Fact check claim: House Minority Leader Nancy Pelosi said the bill had to pass before people could find out what was in it.",
        normalizedProposition:
          "the bill had to pass before people could find out what was in it",
        narrator: "Snopes",
        quotedSpeaker: null,
        sourceStance: "reports",
        claimType: "fact_check_framing",
        subject: "House Minority Leader Nancy Pelosi",
      }),
    ];

    const comparisons = compareSourceVersions(versions, snapshots);
    expect(
      comparisons.flatMap((comparison) => comparison.changes).some(
        (change) =>
          change.type === "subject_changed" ||
          change.type === "attribution_changed" ||
          change.type === "quotation_changed",
      ),
    ).toBe(false);
    expect(detectMutations(comparisons)).toEqual([]);
  });

  it("preserves named calendar dates without timezone rollback", () => {
    const source = snapshot("dated", "2023-05-22", [
      passage(
        "dated-claim",
        "dated",
        "An explosion occurred near the Pentagon on May 22, 2023.",
      ),
    ]);
    const extracted = extractClaimVersions(
      "An explosion occurred near the Pentagon on May 22, 2023.",
      [source],
    );
    expect(extracted[0]?.eventDate).toBe("2023-05-22");
  });

  it("does not infer recycled media from dates alone", () => {
    const withoutExplicitReuse = [
      snapshot("old", "2020-01-03", [passage("old-claim", "old", "A 2020 photo shows an event in Lahore.")]),
      snapshot("new", "2023-03-26", [passage("new-claim", "new", "A 2023 photo shows an event in Madrid.")]),
    ];
    const versions = [
      version("old-version", "old", "old-claim", {
        claim: "A 2020 photo shows an event in Lahore.",
        eventDate: "2020-01-01",
        captionContext: "A photo shows an event in Lahore.",
      }),
      version("new-version", "new", "new-claim", {
        claim: "A 2023 photo shows an event in Madrid.",
        eventDate: "2023-01-01",
        captionContext: "A photo shows an event in Madrid.",
      }),
    ];

    const dateOnlyChanges = compareSourceVersions(versions, withoutExplicitReuse)[0]!.changes;
    expect(dateOnlyChanges.some((change) => change.type === "old_media_reused")).toBe(false);

    const explicit = passage(
      "reuse-proof",
      "new",
      "The same photo from https://example.test/old was originally posted in 2020 and recirculated with a new 2023 caption.",
      "provenance",
      0.98,
    );
    const withExplicitReuse = [
      withoutExplicitReuse[0]!,
      snapshot("new", "2023-03-26", [
        passage("new-claim", "new", "A 2023 photo shows an event in Madrid."),
        explicit,
      ]),
    ];
    const changes = compareSourceVersions(versions, withExplicitReuse)[0]!.changes;
    const recycled = changes.find((change) => change.type === "old_media_reused");
    expect(recycled?.evidenceIds).toEqual(
      expect.arrayContaining(["old-claim", "new-claim"]),
    );
    const mutations = detectMutations(
      compareSourceVersions(versions, withExplicitReuse),
    );
    expect(mutations[0]?.evidenceIds).toContain("reuse-proof");
  });

  it("never turns failed or low-confidence partial snippet fallbacks into source versions", () => {
    const claimPassage = passage("snippet", "failed", "Pope Francis wore a white coat.");
    const failed = snapshot("failed", null, [claimPassage], {
      acquisitionStatus: "failed",
      extractionConfidence: 0.25,
    });
    const weakPartial = snapshot("partial", null, [
      { ...claimPassage, id: "partial-snippet", sourceId: "partial" },
    ], {
      acquisitionStatus: "partial",
      extractionConfidence: 0.25,
    });

    expect(
      extractClaimVersions("Pope Francis wore a white coat.", [failed, weakPartial]),
    ).toEqual([]);
  });

  it("does not promote an acquired but irrelevant declarative passage into a claim version", () => {
    const irrelevant = snapshot("irrelevant", "2026-01-01", [
      passage(
        "irrelevant-claim",
        "irrelevant",
        "Karachi libraries will extend their opening hours next month.",
        "claim",
        0.95,
      ),
    ]);

    expect(
      extractClaimVersions(
        "A blue whale was seen flying over Karachi yesterday.",
        [irrelevant],
      ),
    ).toEqual([]);
  });

  it("normalises explicit media context instead of treating paraphrasing as a caption mutation", () => {
    const sources = [
      snapshot("caption-a", "2023-03-24", [
        passage(
          "caption-a-claim",
          "caption-a",
          "A real photograph shows Pope Francis in a white puffer jacket.",
        ),
      ]),
      snapshot("caption-b", "2023-03-26", [
        passage(
          "caption-b-claim",
          "caption-b",
          "An authentic photo depicts Pope Francis wearing a white puffer jacket.",
        ),
      ]),
    ];
    const versions = extractClaimVersions(
      "Pope Francis was photographed wearing a white puffer jacket.",
      sources,
    );

    expect(versions).toHaveLength(2);
    expect(versions[0]?.captionContext).toBe("Presented as a genuine photograph");
    expect(versions[1]?.captionContext).toBe("Presented as a genuine photograph");
    expect(
      compareSourceVersions(versions, sources)[0]?.changes.some(
        (change) => change.type === "caption_changed",
      ),
    ).toBe(false);
  });

  it("lets an optional model select evidence but never author a source version", async () => {
    const source = snapshot("semantic-source", "2025-04-30", [
      passage(
        "semantic-passage",
        "semantic-source",
        "Sanctions on Russia were blamed for the Spain power blackout.",
        "claim",
        0.4,
      ),
    ]);
    const provider: LLMProvider = {
      name: "controlled-test-provider",
      available: true,
      async complete() {
        return JSON.stringify({
          selections: [
            {
              sourceId: "semantic-source",
              passageId: "semantic-passage",
              confidence: 0.92,
              // Unknown output fields are stripped by the schema and cannot
              // replace the locally grounded claim text below.
              claim: "Invented model wording",
            },
          ],
        });
      },
    };

    expect(
      extractClaimVersions(
        "The Spain blackout was caused by Russia sanctions.",
        [source],
      ),
    ).toEqual([]);
    const versions = await extractClaimVersionsWithAid(
      "The Spain blackout was caused by Russia sanctions.",
      [source],
      { provider },
    );

    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      sourceId: "semantic-source",
      claim: "Sanctions on Russia were blamed for the Spain power blackout.",
      evidenceIds: ["semantic-passage"],
      extractionMethod: "llm_assisted",
    });
    expect(versions[0]?.claim).not.toContain("Invented");
  });

  it("requires an explicit relationship comparison and leaves a text-only submission unconnected", () => {
    const snapshots = [
      snapshot("before", "2023-03-24", [passage("p-before", "before", "The event may have happened.")]),
      snapshot("after", "2023-03-26", [
        passage("p-after", "after", "The event happened."),
        passage(
          "relationship",
          "after",
          "This report was derived from https://example.test/before.",
          "provenance",
        ),
      ]),
    ];
    const versions = [
      version("v-before", "before", "p-before", { certainty: "possibility" }),
      version("v-after", "after", "p-after", { certainty: "asserted" }),
    ];
    const comparisons = compareSourceVersions(versions, snapshots);
    const mutations = detectMutations(comparisons);
    expect(mutations).toHaveLength(1);

    const injectedMutationOnly = buildRuntimeLineageGraph({
      claim: "The event happened.",
      snapshots,
      versions,
      mutations,
      submittedEvidenceId: "submitted-input",
    });
    expect(injectedMutationOnly.edges).toEqual([]);

    const graph = buildRuntimeLineageGraph({
      claim: "The event happened.",
      snapshots: [...snapshots].reverse(),
      versions: [...versions].reverse(),
      comparisons,
      mutations,
      submittedEvidenceId: "submitted-input",
    });

    expect(graph.edges).toHaveLength(1);
    expect(graph.nodes.map((node) => node.sourceId)).toEqual([
      "before",
      "after",
      "submitted-claim",
    ]);
    expect(graph.edges[0]).toMatchObject({ fromSourceId: "before", toSourceId: "after" });
    expect(graph.edges.some((edge) => edge.toSourceId === "submitted-claim")).toBe(false);
    expect(graph.status).toBe("candidate");
    expect(graph.submittedOccurrenceConnected).toBe(false);
    expect(graph.establishedTransitionCount).toBe(0);
    expect(graph.reason).toContain("no established path reaches a submitted occurrence");
  });

  it("never creates an occurrence edge without request-specific occurrence and relationship evidence", () => {
    const live = snapshot("live", "2023-03-26", [
      passage("live-claim", "live", "The event happened."),
    ]);
    const liveVersion = version("live-version", "live", "live-claim", {
      claim: "The event happened.",
      normalizedProposition: "the event happened",
    });

    const graph = buildRuntimeLineageGraph({
      claim: "The event happened.",
      snapshots: [live],
      versions: [liveVersion],
      comparisons: [
        {
          id: "forged-text-comparison",
          fromSourceId: "live",
          toSourceId: "submitted-claim",
          changes: [],
          evidenceIds: ["live-claim", "submission:text:hash"],
          confidence: 1,
          status: "established",
          relationship: {
            type: "reposted_from",
            status: "established",
            confidence: 1,
            evidence: [
              {
                sourceId: "live",
                passageId: "live-claim",
                exactText: "The event happened.",
                role: "before",
              },
              {
                sourceId: "submitted-claim",
                passageId: "submission:text:hash",
                exactText: "The event happened.",
                role: "occurrence",
              },
              {
                sourceId: "submitted-claim",
                passageId: "submission:text:hash",
                exactText: "Reposted from live.",
                role: "relationship",
              },
            ],
            reason: "Forged from normalized text.",
          },
          reason: "Forged from normalized text.",
        },
      ],
      mutations: [],
      submittedEvidenceId: "submission:text:hash",
    });

    expect(graph.edges).toEqual([]);
    expect(graph.nodes.at(-1)?.kind).toBe("submitted_claim");
    expect(graph.submittedOccurrenceConnected).toBe(false);
  });

  it("connects a validated source-post occurrence only through exact relationship evidence", () => {
    const before = snapshot("before", "2023-03-24", [
      passage("before-claim", "before", "The event may have happened."),
    ]);
    const after = snapshot("after", "2023-03-26", [
      passage("after-claim", "after", "The event happened."),
      passage(
        "after-relation",
        "after",
        "This report was derived from https://example.test/before.",
        "provenance",
      ),
    ]);
    const versions = [
      version("before-version", "before", "before-claim", {
        normalizedProposition: "the event happened",
        certainty: "possibility",
      }),
      version("after-version", "after", "after-claim", {
        normalizedProposition: "the event happened",
        certainty: "asserted",
      }),
    ];
    const occurrence: SubmittedOccurrence = {
      id: "submitted-occurrence:post-42",
      claim: "The event happened.",
      exactText: "The event happened.",
      normalizedProposition: "the event happened",
      evidenceType: "source_post",
      sourceUrl: "https://social.example/post/42",
      sourceIdentifier: "post-42",
      timestamp: "2023-03-28T10:00:00Z",
      sourceContext: "Public post with an explicit repost reference.",
      evidenceIds: ["occurrence-text", "occurrence-relationship"],
      evidence: [
        {
          sourceId: "submitted-occurrence:post-42",
          passageId: "occurrence-text",
          exactText: "The event happened.",
          role: "occurrence",
        },
      ],
      confidence: 0.95,
      sourceRelationship: {
        fromSourceId: "after",
        relationship: "reposted_from",
        status: "established",
        confidence: 0.95,
        evidence: [
          {
            sourceId: "after",
            passageId: "after-claim",
            exactText: "The event happened.",
            role: "before",
          },
          {
            sourceId: "submitted-occurrence:post-42",
            passageId: "occurrence-relationship",
            exactText: "Reposted from https://example.test/after.",
            role: "relationship",
          },
          {
            sourceId: "submitted-occurrence:post-42",
            passageId: "occurrence-text",
            exactText: "The event happened.",
            role: "occurrence",
          },
        ],
        reason: "The submitted post explicitly identifies the acquired source URL.",
      },
    };
    const comparisons = compareSourceVersions(versions, [before, after]);
    const occurrenceComparison = compareLatestVersionToSubmittedOccurrence(
      versions,
      [before, after],
      occurrence,
    );
    expect(occurrenceComparison?.status).toBe("established");
    comparisons.push(occurrenceComparison!);
    const mutations = detectMutations(comparisons);
    const graph = buildRuntimeLineageGraph({
      claim: occurrence.claim,
      snapshots: [before, after],
      versions,
      comparisons,
      mutations,
      submittedOccurrence: occurrence,
    });

    expect(graph.nodes.at(-1)?.kind).toBe("submitted_occurrence");
    expect(
      graph.edges.some(
        (edge) =>
          edge.fromSourceId === "after" &&
          edge.toSourceId === occurrence.id &&
          edge.relationship === "reposted_from",
      ),
    ).toBe(true);
    expect(graph.submittedOccurrenceConnected).toBe(true);
    expect(graph.status).toBe("established");
    expect(graph.establishedTransitionCount).toBe(2);
    expect(graph.requiredTransitionCount).toBe(2);
  });

  it("always returns eight final stages and strips internal source text", async () => {
    const source = snapshot("one", "2023-03-24", [
      passage("one-claim", "one", "The event was reported."),
    ]);
    const result = await runProvenanceInvestigation({
      claim: "The event was reported.",
      snapshots: [source],
      liveSearchStatus: "searched",
      liveSearchEvidenceIds: ["search-run"],
      submittedEvidenceId: "submitted-input",
    });

    expect(result.investigationStages).toHaveLength(8);
    expect(result.investigationStages.map((stage) => stage.id)).toEqual([
      "claim_extracted",
      "live_search",
      "source_discovery",
      "earliest_source",
      "context_comparison",
      "mutation_detection",
      "origin_assessment",
      "lineage",
    ]);
    expect(result.investigationStages.some((stage) => stage.status === "in_progress")).toBe(false);
    expect(result.evidenceSnapshots[0]).not.toHaveProperty("text");
    expect(result.dynamicLineage.nodes.find((node) => node.kind === "submitted_claim")?.evidenceIds).toEqual([
      "submitted-input",
    ]);
    expect(result.submittedOccurrence).toBeNull();
  });

  it("propagates all-blocked acquisition as blocked rather than candidate or error", async () => {
    const blocked = snapshot("blocked", null, [], {
      acquisitionStatus: "blocked",
      acquisitionError: "challenge page",
      extractionConfidence: 0,
      evidenceRelevance: null,
    });
    const result = await runProvenanceInvestigation({
      claim: "A submitted claim.",
      snapshots: [blocked],
      liveSearchStatus: "searched",
      liveSearchEvidenceIds: ["search-run"],
    });
    for (const stageId of [
      "source_discovery",
      "earliest_source",
      "context_comparison",
      "mutation_detection",
      "origin_assessment",
      "lineage",
    ] as const) {
      expect(
        result.investigationStages.find((stage) => stage.id === stageId)?.status,
      ).toBe("blocked");
    }
    expect(result.dynamicLineage.status).toBe("blocked");
    expect(result.scores.lineageCompleteness).toBe(0);
  });

  it("fails closed by stage when an acquired snapshot cannot be processed", async () => {
    const broken = snapshot("broken", "2023-03-24", []);
    Object.defineProperty(broken, "relevantPassages", {
      get() {
        throw new Error("sensitive parser detail");
      },
    });

    const result = await runProvenanceInvestigation({
      claim: "A submitted claim.",
      snapshots: [broken],
      liveSearchStatus: "searched",
      liveSearchEvidenceIds: ["search-run"],
    });

    expect(result.investigationStages).toHaveLength(8);
    expect(result.investigationStages.find((stage) => stage.id === "source_discovery")?.status).toBe("error");
    expect(result.investigationStages.find((stage) => stage.id === "context_comparison")?.status).toBe("error");
    expect(result.investigationStages.find((stage) => stage.id === "lineage")?.status).toBe("error");
    expect(JSON.stringify(result)).not.toContain("sensitive parser detail");
  });
});
