import {
  compareLatestVersionToSubmittedOccurrence,
  compareSourceVersions,
  hasValidSubmittedOccurrenceEvidence,
} from "./context-comparison";
import { buildRuntimeLineageGraph, SUBMITTED_CLAIM_SOURCE_ID } from "./lineage-graph";
import { detectMutations } from "./mutation-detection";
import { assessOrigin } from "./origin-assessment";
import { findEarliestRelevantSource } from "./temporal-ordering";
import type {
  DetectedMutation,
  EvidenceSnapshot,
  InvestigationStage,
  OriginAssessment,
  ProvenanceInvestigation,
  PublicEvidenceSnapshot,
  RuntimeLineageGraph,
  SourceClaimVersion,
  SourceComparison,
  SubmittedOccurrence,
  TemporalFinding,
} from "./types";
import { extractClaimVersionsWithAid } from "./version-extraction";

export type ProvenanceLiveSearchStatus =
  | "not_attempted"
  | "not_configured"
  | "searched"
  | "failed";

export interface RunProvenanceInvestigationInput {
  claim: string;
  snapshots: EvidenceSnapshot[];
  liveSearchStatus: ProvenanceLiveSearchStatus;
  liveSearchEvidenceIds: string[];
  submittedOccurrence?: SubmittedOccurrence | null;
  /** @deprecated Claim extraction evidence only; never occurrence evidence. */
  submittedEvidenceId?: string;
  /** Unexpected orchestration failure after discovery, never a provider detail. */
  sourceAcquisitionError?: boolean;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(clamp(value) * 1000) / 1000;
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function emptyTemporal(reason: string): TemporalFinding {
  return {
    status: "insufficient_evidence",
    sourceId: null,
    date: null,
    dateType: "unknown",
    confidence: null,
    evidenceIds: [],
    reason,
  };
}

function errorTemporal(): TemporalFinding {
  return {
    ...emptyTemporal("Temporal ordering failed while processing acquired evidence."),
    status: "error",
  };
}

function blockedTemporal(): TemporalFinding {
  return {
    ...emptyTemporal(
      "Temporal ordering was blocked because no attempted source document passed acquisition integrity checks.",
    ),
    status: "blocked",
  };
}

function emptyOrigin(reason: string): OriginAssessment {
  const facet = {
    status: "insufficient_evidence" as const,
    sourceId: null,
    confidence: null,
    evidenceIds: [],
    reason,
  };
  return {
    originalEvent: { ...facet },
    earliestRelevantSource: emptyTemporal(reason),
    misinformationOrigin: { ...facet },
    likelyOriginCandidate: { ...facet },
  };
}

function errorOrigin(): OriginAssessment {
  const assessment = emptyOrigin(
    "Origin assessment failed while processing acquired evidence.",
  );
  return {
    originalEvent: { ...assessment.originalEvent, status: "error" },
    earliestRelevantSource: {
      ...assessment.earliestRelevantSource,
      status: "error",
    },
    misinformationOrigin: {
      ...assessment.misinformationOrigin,
      status: "error",
    },
    likelyOriginCandidate: {
      ...assessment.likelyOriginCandidate,
      status: "error",
    },
  };
}

function blockedOrigin(): OriginAssessment {
  const assessment = emptyOrigin(
    "Origin assessment was blocked because no attempted source document passed acquisition integrity checks.",
  );
  return {
    originalEvent: { ...assessment.originalEvent, status: "blocked" },
    earliestRelevantSource: {
      ...assessment.earliestRelevantSource,
      status: "blocked",
    },
    misinformationOrigin: {
      ...assessment.misinformationOrigin,
      status: "blocked",
    },
    likelyOriginCandidate: {
      ...assessment.likelyOriginCandidate,
      status: "blocked",
    },
  };
}

function allAcquisitionBlocked(snapshots: EvidenceSnapshot[]): boolean {
  const attempted = snapshots.filter(
    (snapshot) => snapshot.acquisitionStatus !== "not_attempted",
  );
  return (
    attempted.length > 0 &&
    attempted.every((snapshot) => snapshot.acquisitionStatus === "blocked")
  );
}

function emptyGraph(
  claim: string,
  submittedOccurrence: SubmittedOccurrence | null,
  submittedEvidenceId: string | undefined,
  status: RuntimeLineageGraph["status"],
  reason: string,
): RuntimeLineageGraph {
  const currentNode = submittedOccurrence
    ? {
        id: `node:${submittedOccurrence.id}`,
        sourceId: submittedOccurrence.id,
        kind: "submitted_occurrence" as const,
        claim: submittedOccurrence.exactText,
        url: submittedOccurrence.sourceUrl,
        date: submittedOccurrence.timestamp,
        dateConfidence: submittedOccurrence.timestamp
          ? submittedOccurrence.confidence
          : 0,
        evidenceIds: unique(submittedOccurrence.evidenceIds),
      }
    : {
        id: `node:${SUBMITTED_CLAIM_SOURCE_ID}`,
        sourceId: SUBMITTED_CLAIM_SOURCE_ID,
        kind: "submitted_claim" as const,
        claim: claim.trim(),
        url: null,
        date: null,
        dateConfidence: 0,
        evidenceIds: unique([submittedEvidenceId]),
      };
  return {
    status,
    nodes: [currentNode],
    edges: [],
    evidenceIds: submittedOccurrence
      ? unique(submittedOccurrence.evidenceIds)
      : unique([submittedEvidenceId]),
    confidence: null,
    submittedOccurrenceConnected: false,
    establishedTransitionCount: 0,
    requiredTransitionCount: 1,
    reason,
  };
}

function toPublicSnapshot(snapshot: EvidenceSnapshot): PublicEvidenceSnapshot {
  return {
    id: snapshot.id,
    providerResultId: snapshot.providerResultId,
    originalUrl: snapshot.originalUrl,
    finalUrl: snapshot.finalUrl,
    canonicalUrl: snapshot.canonicalUrl,
    title: snapshot.title,
    domain: snapshot.domain,
    publisher: snapshot.publisher,
    author: snapshot.author,
    publishedAt: snapshot.publishedAt,
    modifiedAt: snapshot.modifiedAt,
    dateType: snapshot.dateType,
    dateConfidence: snapshot.dateConfidence,
    dateEvidence: snapshot.dateEvidence,
    dateSource: snapshot.dateSource,
    dateEvidencePassageId: snapshot.dateEvidencePassageId,
    relevantPassages: snapshot.relevantPassages,
    sourceType: snapshot.sourceType,
    providerScore: snapshot.providerScore,
    retrievalRelevance: snapshot.retrievalRelevance,
    claimRelevance: snapshot.claimRelevance,
    evidenceRelevance: snapshot.evidenceRelevance,
    acquisitionStatus: snapshot.acquisitionStatus,
    acquisitionError: snapshot.acquisitionError,
    extractionConfidence: snapshot.extractionConfidence,
    discoveredByQueries: snapshot.discoveredByQueries,
  };
}

function liveSearchStage(input: RunProvenanceInvestigationInput): InvestigationStage {
  switch (input.liveSearchStatus) {
    case "searched":
      return {
        id: "live_search",
        status: "established",
        evidenceIds: unique(input.liveSearchEvidenceIds),
        confidence: 1,
        reason: "Live search completed. Search completion does not verify any returned source.",
      };
    case "failed":
      return {
        id: "live_search",
        status: "error",
        evidenceIds: unique(input.liveSearchEvidenceIds),
        confidence: null,
        reason: "Live search failed; no provenance conclusion was inferred from the failure.",
      };
    case "not_configured":
      return {
        id: "live_search",
        status: "not_attempted",
        evidenceIds: [],
        confidence: null,
        reason: "Live search was not configured for this investigation.",
      };
    default:
      return {
        id: "live_search",
        status: "not_attempted",
        evidenceIds: [],
        confidence: null,
        reason: "Live search was not attempted.",
      };
  }
}

function sourceDiscoveryStage(
  snapshots: EvidenceSnapshot[],
  liveSearchEvidenceIds: string[],
  acquisitionFailed: boolean,
): InvestigationStage {
  const discoveredEvidenceIds = unique([
    ...liveSearchEvidenceIds,
    ...snapshots.map((snapshot) => snapshot.id),
  ]);

  if (acquisitionFailed) {
    return {
      id: "source_discovery",
      status: "error",
      evidenceIds: discoveredEvidenceIds,
      confidence: null,
      reason:
        "Source leads were returned, but document acquisition failed unexpectedly. No provenance conclusion was inferred from that failure.",
    };
  }

  if (discoveredEvidenceIds.length === 0) {
    return {
      id: "source_discovery",
      status: "insufficient_evidence",
      evidenceIds: [],
      confidence: null,
      reason: "No source results were available for acquisition or inspection.",
    };
  }

  const attempted = snapshots.filter(
    (snapshot) => snapshot.acquisitionStatus !== "not_attempted",
  );
  if (
    attempted.length > 0 &&
    attempted.every((snapshot) => snapshot.acquisitionStatus === "blocked")
  ) {
    return {
      id: "source_discovery",
      status: "blocked",
      evidenceIds: discoveredEvidenceIds,
      confidence: null,
      reason:
        "Source leads were discovered, but every attempted document was blocked by an access/interstitial response.",
    };
  }

  const acquired = snapshots.filter(
    (snapshot) => snapshot.acquisitionStatus === "acquired",
  ).length;
  const partial = snapshots.filter(
    (snapshot) => snapshot.acquisitionStatus === "partial",
  ).length;
  return {
    id: "source_discovery",
    status: "established",
    evidenceIds: discoveredEvidenceIds,
    confidence:
      snapshots.length > 0
        ? round(
            snapshots.reduce(
              (sum, snapshot) =>
                sum + clamp(snapshot.retrievalRelevance ?? 0.5),
              0,
            ) / snapshots.length,
          )
        : null,
    reason: `${liveSearchEvidenceIds.length || snapshots.length} source lead${(liveSearchEvidenceIds.length || snapshots.length) === 1 ? " was" : "s were"} discovered; ${acquired} acquired and ${partial} partially acquired. Discovery alone does not establish provenance.`,
  };
}

function comparisonStage(
  comparisons: SourceComparison[],
  extractionFailed: boolean,
  comparisonFailed: boolean,
): InvestigationStage {
  if (extractionFailed || comparisonFailed) {
    return {
      id: "context_comparison",
      status: "error",
      evidenceIds: [],
      confidence: null,
      reason: "Claim-version extraction or context comparison failed; no comparison was inferred.",
    };
  }
  if (comparisons.length === 0) {
    return {
      id: "context_comparison",
      status: "insufficient_evidence",
      evidenceIds: [],
      confidence: null,
      reason: "At least two evidence-grounded source versions are required for comparison.",
    };
  }
  const established = comparisons.filter(
    (comparison) => comparison.status === "established",
  );
  const candidates = comparisons.filter(
    (comparison) => comparison.status === "candidate",
  );
  const selected =
    established.length > 0
      ? established
      : candidates.length > 0
        ? candidates
        : comparisons;
  if (established.length === 0 && candidates.length === 0) {
    return {
      id: "context_comparison",
      status: "insufficient_evidence",
      evidenceIds: unique(
        comparisons.flatMap((comparison) => comparison.evidenceIds),
      ),
      confidence: null,
      reason:
        "Every pairwise comparison failed its proposition or relationship evidence requirements.",
    };
  }
  return {
    id: "context_comparison",
    status: established.length > 0 ? "established" : "candidate",
    evidenceIds: unique(selected.flatMap((comparison) => comparison.evidenceIds)),
    confidence: round(
      selected.reduce((sum, comparison) => sum + comparison.confidence, 0) /
        selected.length,
    ),
    reason:
      established.length > 0
        ? `${established.length} evidence-grounded pairwise comparison${established.length === 1 ? " was" : "s were"} established.`
        : "Source versions were compared, but chronology or extraction confidence remains provisional.",
  };
}

function mutationStage(
  mutations: DetectedMutation[],
  failed: boolean,
): InvestigationStage {
  if (failed) {
    return {
      id: "mutation_detection",
      status: "error",
      evidenceIds: [],
      confidence: null,
      reason: "Mutation detection failed; no mutation was inferred.",
    };
  }
  if (mutations.length === 0) {
    return {
      id: "mutation_detection",
      status: "insufficient_evidence",
      evidenceIds: [],
      confidence: null,
      reason: "No pairwise semantic change had enough evidence to map to a mutation.",
    };
  }
  const established = mutations.filter((mutation) => mutation.status === "established");
  const selected = established.length > 0 ? established : mutations;
  return {
    id: "mutation_detection",
    status: established.length > 0 ? "established" : "candidate",
    evidenceIds: unique(selected.flatMap((mutation) => mutation.evidenceIds)),
    confidence: round(
      selected.reduce((sum, mutation) => sum + mutation.confidence, 0) /
        selected.length,
    ),
    reason:
      established.length > 0
        ? `${established.length} mutation${established.length === 1 ? " was" : "s were"} established from before-and-after evidence.`
        : "Evidence-backed changes were found, but their mutation labels remain candidates.",
  };
}

function originStage(
  assessment: OriginAssessment,
  failed: boolean,
): InvestigationStage {
  if (failed) {
    return {
      id: "origin_assessment",
      status: "error",
      evidenceIds: [],
      confidence: null,
      reason: "Origin assessment failed; no source was promoted to origin.",
    };
  }
  if (assessment.misinformationOrigin.status === "established") {
    return {
      id: "origin_assessment",
      status: "established",
      evidenceIds: assessment.misinformationOrigin.evidenceIds,
      confidence: assessment.misinformationOrigin.confidence,
      reason: assessment.misinformationOrigin.reason,
    };
  }
  if (assessment.likelyOriginCandidate.sourceId) {
    return {
      id: "origin_assessment",
      status: "candidate",
      evidenceIds: assessment.likelyOriginCandidate.evidenceIds,
      confidence: assessment.likelyOriginCandidate.confidence,
      reason: assessment.likelyOriginCandidate.reason,
    };
  }
  return {
    id: "origin_assessment",
    status: "insufficient_evidence",
    evidenceIds: [],
    confidence: null,
    reason: assessment.misinformationOrigin.reason,
  };
}

function sourceRelevanceScore(snapshots: EvidenceSnapshot[]): number | null {
  const values = snapshots
    .filter(
      (snapshot) =>
        snapshot.acquisitionStatus === "acquired" ||
        snapshot.acquisitionStatus === "partial",
    )
    .map((snapshot) => {
      if (snapshot.evidenceRelevance !== null) {
        return clamp(snapshot.evidenceRelevance);
      }
      if (snapshot.relevantPassages.length === 0) return null;
      return clamp(
        Math.max(...snapshot.relevantPassages.map((passage) => passage.relevance)),
      );
    })
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function lineageCompleteness(graph: RuntimeLineageGraph): number {
  if (
    graph.status !== "established" ||
    !graph.submittedOccurrenceConnected
  ) {
    return 0;
  }
  return round(
    graph.establishedTransitionCount /
      Math.max(1, graph.requiredTransitionCount),
  );
}

/**
 * Runs the deterministic analysis half of the live provenance pipeline. Each
 * stage fails closed and the function always returns all eight final stage
 * objects; `in_progress` is never emitted from this completed result.
 */
export async function runProvenanceInvestigation(
  input: RunProvenanceInvestigationInput,
): Promise<ProvenanceInvestigation> {
  const claim = input.claim.trim();
  const snapshots = Array.isArray(input.snapshots) ? input.snapshots : [];
  const acquisitionBlocked = allAcquisitionBlocked(snapshots);
  const submittedOccurrence =
    input.submittedOccurrence &&
    hasValidSubmittedOccurrenceEvidence(input.submittedOccurrence)
      ? input.submittedOccurrence
      : null;
  let publicSnapshots: PublicEvidenceSnapshot[] = [];
  let publicSnapshotMappingFailed = false;
  try {
    publicSnapshots = snapshots.map(toPublicSnapshot);
  } catch {
    publicSnapshotMappingFailed = true;
  }

  let versions: SourceClaimVersion[] = [];
  let extractionFailed = false;
  if (!acquisitionBlocked) {
    try {
      versions = await extractClaimVersionsWithAid(claim, snapshots);
    } catch {
      extractionFailed = true;
    }
  }

  let earliest = emptyTemporal(
    "No evidence-grounded source version was available for temporal ordering.",
  );
  let temporalFailed = false;
  if (acquisitionBlocked) {
    earliest = blockedTemporal();
  } else if (!extractionFailed) {
    try {
      earliest = findEarliestRelevantSource(snapshots, versions);
    } catch {
      temporalFailed = true;
      earliest = errorTemporal();
    }
  } else {
    temporalFailed = true;
    earliest = errorTemporal();
  }

  let comparisons: SourceComparison[] = [];
  let comparisonFailed = false;
  if (!acquisitionBlocked && !extractionFailed) {
    try {
      comparisons = compareSourceVersions(versions, snapshots);
      const submittedComparison = compareLatestVersionToSubmittedOccurrence(
        versions,
        snapshots,
        submittedOccurrence,
      );
      if (submittedComparison) comparisons.push(submittedComparison);
    } catch {
      comparisonFailed = true;
    }
  }

  let mutations: DetectedMutation[] = [];
  let mutationFailed = comparisonFailed || extractionFailed;
  if (!acquisitionBlocked && !mutationFailed) {
    try {
      mutations = detectMutations(comparisons);
    } catch {
      mutationFailed = true;
    }
  }

  let originAssessment = emptyOrigin(
    "No evidence-backed origin assessment was available.",
  );
  let originFailed = temporalFailed || extractionFailed;
  if (acquisitionBlocked) {
    originAssessment = blockedOrigin();
  } else if (!originFailed) {
    try {
      originAssessment = assessOrigin(snapshots, versions, earliest);
    } catch {
      originFailed = true;
      originAssessment = errorOrigin();
    }
  } else {
    originAssessment = errorOrigin();
  }

  let dynamicLineage = emptyGraph(
    claim,
    submittedOccurrence,
    input.submittedEvidenceId,
    acquisitionBlocked ? "blocked" : "insufficient_evidence",
    acquisitionBlocked
      ? "Lineage construction was blocked because no attempted source document passed acquisition integrity checks."
      : "No evidence-backed transmission path was available.",
  );
  let lineageFailed = mutationFailed;
  if (acquisitionBlocked) {
    // Preserve the blocked graph initialized above. A blocked acquisition is
    // not an internal lineage error and must not be promoted or overwritten.
  } else if (!lineageFailed) {
    try {
      dynamicLineage = buildRuntimeLineageGraph({
        claim,
        snapshots,
        versions,
        comparisons,
        mutations,
        submittedOccurrence,
        submittedEvidenceId: input.submittedEvidenceId,
      });
    } catch {
      lineageFailed = true;
      dynamicLineage = emptyGraph(
        claim,
        submittedOccurrence,
        input.submittedEvidenceId,
        "error",
        "Lineage graph construction failed; no edges were inferred.",
      );
    }
  } else {
    dynamicLineage = emptyGraph(
      claim,
      submittedOccurrence,
      input.submittedEvidenceId,
      "error",
      "Lineage graph construction was not possible because an upstream comparison stage failed.",
    );
  }

  const claimStage: InvestigationStage = {
    id: "claim_extracted",
    status: claim ? "established" : "insufficient_evidence",
    evidenceIds: unique([input.submittedEvidenceId]),
    confidence: claim ? 1 : null,
    reason: claim
      ? "A submitted claim is available for provenance analysis."
      : "No non-empty submitted claim was available.",
  };
  const searchStage = liveSearchStage(input);
  let discoveryStage: InvestigationStage;
  try {
    if (publicSnapshotMappingFailed) throw new Error("invalid source snapshot");
    discoveryStage = sourceDiscoveryStage(
      snapshots,
      input.liveSearchEvidenceIds,
      input.sourceAcquisitionError === true,
    );
  } catch {
    discoveryStage = {
      id: "source_discovery",
      status: "error",
      evidenceIds: [],
      confidence: null,
      reason: "Source discovery metadata could not be processed.",
    };
  }
  const contextStage: InvestigationStage = acquisitionBlocked
    ? {
        id: "context_comparison",
        status: "blocked",
        evidenceIds: [],
        confidence: null,
        reason:
          "Context comparison was blocked because no attempted source document passed acquisition integrity checks.",
      }
    : comparisonStage(comparisons, extractionFailed, comparisonFailed);
  const detectedMutationStage: InvestigationStage = acquisitionBlocked
    ? {
        id: "mutation_detection",
        status: "blocked",
        evidenceIds: [],
        confidence: null,
        reason:
          "Mutation detection was blocked because no evidence-grounded source versions could be acquired.",
      }
    : mutationStage(mutations, mutationFailed);
  const assessedOriginStage: InvestigationStage = acquisitionBlocked
    ? {
        id: "origin_assessment",
        status: "blocked",
        evidenceIds: [],
        confidence: null,
        reason: originAssessment.misinformationOrigin.reason,
      }
    : originStage(originAssessment, originFailed);
  const lineageStage: InvestigationStage = {
    id: "lineage",
    status: lineageFailed ? "error" : dynamicLineage.status,
    evidenceIds: dynamicLineage.evidenceIds,
    confidence: dynamicLineage.confidence,
    reason: dynamicLineage.reason,
  };
  const stages: InvestigationStage[] = [
    claimStage,
    searchStage,
    discoveryStage,
    {
      id: "earliest_source",
      status: temporalFailed ? "error" : earliest.status,
      evidenceIds: earliest.evidenceIds,
      confidence: earliest.confidence,
      reason: earliest.reason,
    },
    contextStage,
    detectedMutationStage,
    assessedOriginStage,
    lineageStage,
  ];

  const mutationConfidence =
    mutations.length > 0
      ? round(
          mutations.reduce((sum, mutation) => sum + mutation.confidence, 0) /
            mutations.length,
        )
      : null;
  const originConfidence =
    originAssessment.misinformationOrigin.confidence ??
    originAssessment.likelyOriginCandidate.confidence;
  let sourceRelevance: number | null = null;
  try {
    sourceRelevance = sourceRelevanceScore(snapshots);
  } catch {
    sourceRelevance = null;
  }

  return {
    liveInvestigation:
      input.liveSearchStatus === "searched" || snapshots.length > 0,
    submittedOccurrence,
    evidenceSnapshots: publicSnapshots,
    sourceVersions: versions,
    comparisons,
    mutations,
    originAssessment,
    dynamicLineage,
    investigationStages: stages,
    scores: {
      sourceRelevance,
      // An origin candidate is not a source-to-source provenance path. Keep
      // this measure null until the runtime graph has evidence-backed edges.
      provenanceConfidence: dynamicLineage.submittedOccurrenceConnected
        ? dynamicLineage.confidence
        : null,
      mutationConfidence,
      originConfidence,
      lineageCompleteness: lineageCompleteness(dynamicLineage),
    },
  };
}
