import type {
  KnownRecordMatch,
  KnownRecordScores,
  Lineage,
  ProvenanceRelationshipType,
  Source,
} from "@workspace/api-zod";
import type {
  InvestigationStage,
  InvestigationStageId,
  RuntimeMutationType,
} from "./types";

/**
 * This intentionally matches the current library matcher trace threshold.
 * Callers may pass a different threshold explicitly if the matcher policy
 * changes; the provenance helper never weakens the submitted-match gate.
 */
export const KNOWN_RECORD_MATCH_THRESHOLD = 0.62;

const KNOWN_STAGE_IDS: InvestigationStageId[] = [
  "earliest_source",
  "context_comparison",
  "mutation_detection",
  "origin_assessment",
  "lineage",
];

const TRANSMISSION_RELATIONSHIPS = new Set<ProvenanceRelationshipType>([
  "derived_from",
  "reposted_from",
  "quoted_from",
  "corrected_by",
  "same_media",
]);

const IDENTITY_RELATIONSHIPS = new Set<ProvenanceRelationshipType>([
  "same_claim",
  "same_event",
]);

const SUPPORTED_MUTATIONS = new Set<RuntimeMutationType>([
  "stripped_context",
  "exaggeration",
  "fabricated_cause",
  "recycled_old_media",
  "misattribution",
  "edited_media",
  "false_caption",
  "selective_evidence",
  "translation_distortion",
  "out_of_date_information",
  "false_quotation",
  "context_shift",
]);

interface CitedSource {
  id: string;
  source: Source;
}

interface KnownStageEvidence {
  evidenceIds: string[];
  reason: string;
}

function boundedSimilarity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(1, value)) * 1_000) / 1_000;
}

function nonblank(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isStrictDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month! - 1 &&
    parsed.getUTCDate() === day
  );
}

/** A linked citation must identify a specific HTTP(S) item, not a home page. */
function isUsableLinkedCitation(source: Source): boolean {
  if (
    source.availability !== "linked" ||
    !nonblank(source.publisher) ||
    !nonblank(source.evidence_description) ||
    !source.url
  ) {
    return false;
  }

  try {
    const parsed = new URL(source.url);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return false;
    }

    return (
      (parsed.pathname !== "" && parsed.pathname !== "/") ||
      parsed.search.length > 1
    );
  } catch {
    return false;
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function originCitations(lineage: Lineage): CitedSource[] {
  return lineage.origin.sources
    .map((source, index) => ({
      id: `known:${lineage.id}:origin:source:${index}`,
      source,
    }))
    .filter(({ source }) => isUsableLinkedCitation(source));
}

function hopCitations(lineage: Lineage, hopIndex: number): CitedSource[] {
  const hop = lineage.mutation_chain[hopIndex];
  if (!hop) return [];

  return hop.sources
    .map((source, sourceIndex) => ({
      id: `known:${lineage.id}:hop:${hop.hop}:source:${sourceIndex}`,
      source,
    }))
    .filter(({ source }) => isUsableLinkedCitation(source));
}

function evidenceForKnownStages(
  lineage: Lineage,
): Partial<Record<InvestigationStageId, KnownStageEvidence>> {
  const originSources = originCitations(lineage);
  const primaryOriginSources = originSources.filter(
    ({ source }) => source.is_primary,
  );
  const hasDatedOrigin = isStrictDate(lineage.origin.date);
  const originDateEvidenceId = `known:${lineage.id}:origin:date`;

  const evidence: Partial<Record<InvestigationStageId, KnownStageEvidence>> = {};

  if (hasDatedOrigin && originSources.length > 0) {
    evidence.earliest_source = {
      evidenceIds: [originDateEvidenceId, ...originSources.map(({ id }) => id)],
      reason:
        "Established by the externally verified known-record fast path from a dated, linked origin citation; this is curated evidence, not a live-source reconstruction.",
    };
  }

  const comparableHops = lineage.mutation_chain
    .map((hop, index) => ({ hop, index, sources: hopCitations(lineage, index) }))
    .filter(
      ({ hop, sources }) =>
        hop.type !== "original_event" &&
        nonblank(hop.previously) &&
        nonblank(hop.now) &&
        nonblank(hop.what_changed) &&
        sources.length > 0,
    );

  if (comparableHops.length > 0) {
    evidence.context_comparison = {
      evidenceIds: unique(
        comparableHops.flatMap(({ sources }) => sources.map(({ id }) => id)),
      ),
      reason:
        "Established by the externally verified known-record fast path from a cited before/after record; this is curated evidence, not a live-source reconstruction.",
    };
  }

  const supportedMutationHops = comparableHops.filter(({ hop }) =>
    SUPPORTED_MUTATIONS.has(hop.type as RuntimeMutationType),
  );

  if (supportedMutationHops.length > 0) {
    evidence.mutation_detection = {
      evidenceIds: unique(
        supportedMutationHops.flatMap(({ sources }) =>
          sources.map(({ id }) => id),
        ),
      ),
      reason:
        "Established by the externally verified known-record fast path from a supported mutation with linked evidence; this is curated evidence, not a live-source reconstruction.",
    };
  }

  if (
    hasDatedOrigin &&
    nonblank(lineage.origin.source) &&
    nonblank(lineage.origin.what_actually_happened) &&
    primaryOriginSources.length > 0
  ) {
    evidence.origin_assessment = {
      evidenceIds: [
        originDateEvidenceId,
        ...primaryOriginSources.map(({ id }) => id),
      ],
      reason:
        "Established by the externally verified known-record fast path from a dated, linked primary-origin citation; this is curated evidence, not a live-source reconstruction.",
    };
  }

  const completeRelationshipPath = curatedRelationshipCompleteness(lineage);

  if (
    evidence.origin_assessment &&
    completeRelationshipPath.complete &&
    nonblank(lineage.canonical_claim)
  ) {
    evidence.lineage = {
      evidenceIds: unique([
        ...evidence.origin_assessment.evidenceIds,
        ...completeRelationshipPath.evidenceIds,
      ]),
      reason:
        "Established within the externally verified known-case record because explicit evidence-supported transmission relationships form a directed path. This remains curated evidence, not a live-source reconstruction or a connection to the submitted occurrence.",
    };
  }

  return evidence;
}

function curatedRelationshipCompleteness(lineage: Lineage): {
  complete: boolean;
  completeness: number;
  evidenceIds: string[];
  transmissionConfidences: number[];
} {
  const requiredTargets = new Set(
    lineage.mutation_chain
      .filter((hop) => hop.type !== "original_event")
      .map((hop) => `hop-${hop.hop}`),
  );
  if (requiredTargets.size === 0) {
    return {
      complete: false,
      completeness: 0,
      evidenceIds: [],
      transmissionConfidences: [],
    };
  }

  const eligible = lineage.curated_relationships.filter(
    (relationship) =>
      relationship.status === "established" &&
      (TRANSMISSION_RELATIONSHIPS.has(relationship.relationship) ||
        IDENTITY_RELATIONSHIPS.has(relationship.relationship)) &&
      relationship.sources.some(isUsableLinkedCitation),
  );
  const reachable = new Set<string>(["origin"]);
  const establishedTransmissionTargets = new Set<string>();
  const evidenceIds: string[] = [];
  const transmissionConfidences: number[] = [];

  for (let pass = 0; pass < lineage.mutation_chain.length + 1; pass += 1) {
    let changed = false;
    for (const relationship of eligible) {
      if (
        !reachable.has(relationship.from_node_id) ||
        reachable.has(relationship.to_node_id)
      ) {
        continue;
      }
      reachable.add(relationship.to_node_id);
      changed = true;
      if (TRANSMISSION_RELATIONSHIPS.has(relationship.relationship)) {
        establishedTransmissionTargets.add(relationship.to_node_id);
        transmissionConfidences.push(relationship.confidence);
      }
      relationship.sources.forEach((_source, sourceIndex) => {
        evidenceIds.push(
          `known:${lineage.id}:relationship:${relationship.id}:source:${sourceIndex}`,
        );
      });
    }
    if (!changed) break;
  }

  const establishedRequired = [...requiredTargets].filter(
    (target) =>
      reachable.has(target) && establishedTransmissionTargets.has(target),
  ).length;
  const completeness = establishedRequired / requiredTargets.size;
  return {
    complete: completeness === 1,
    completeness,
    evidenceIds: unique(evidenceIds),
    transmissionConfidences,
  };
}

/**
 * Build the API-facing match marker without conflating wording similarity with
 * either truth or live provenance. Illustrative records can match wording, but
 * are never eligible for the verified fast path.
 */
export function buildKnownRecordMatch(
  lineage: Lineage | null,
  submittedSimilarity: number,
  minimumSimilarity = KNOWN_RECORD_MATCH_THRESHOLD,
): KnownRecordMatch {
  const similarity = boundedSimilarity(submittedSimilarity);
  const matched = lineage !== null && similarity >= minimumSimilarity;

  return {
    matched,
    lineageId: matched ? lineage.id : null,
    datasetProvenance: matched ? lineage.dataset_provenance : null,
    similarity,
    eligibleAsVerifiedFastPath:
      matched && lineage.dataset_provenance === "externally_verified",
  };
}

/**
 * Build the curated evidence stages without modifying any live investigation
 * stage.  A wording match admits this path, but only assertion-specific linked
 * citations establish a curated stage.
 */
export function buildVerifiedKnownRecordStages(
  lineage: Lineage | null,
  submittedSimilarity: number,
  minimumSimilarity = KNOWN_RECORD_MATCH_THRESHOLD,
): InvestigationStage[] {
  const match = buildKnownRecordMatch(
    lineage,
    submittedSimilarity,
    minimumSimilarity,
  );
  if (!lineage || !match.eligibleAsVerifiedFastPath) return [];

  const establishedEvidence = evidenceForKnownStages(lineage);
  return KNOWN_STAGE_IDS.map((id) => {
    const support = establishedEvidence[id];
    if (support) {
      return {
        id,
        status: "established",
        evidenceIds: support.evidenceIds,
        confidence: 1,
        reason: support.reason,
      };
    }
    return {
      id,
      status: "insufficient_evidence",
      evidenceIds: [],
      confidence: null,
      reason:
        id === "lineage"
          ? "The curated record does not contain a complete directed path of explicit established transmission relationships. Related evidence and array order do not establish lineage."
          : `The curated record does not contain enough linked, assertion-specific evidence to establish ${id.replace(/_/g, " ")}.`,
    };
  });
}

export function buildVerifiedKnownRecordScores(
  lineage: Lineage | null,
  submittedSimilarity: number,
  minimumSimilarity = KNOWN_RECORD_MATCH_THRESHOLD,
): KnownRecordScores {
  const stages = buildVerifiedKnownRecordStages(
    lineage,
    submittedSimilarity,
    minimumSimilarity,
  );
  if (!lineage || stages.length === 0) {
    return {
      provenanceConfidence: null,
      mutationConfidence: null,
      originConfidence: null,
      lineageCompleteness: 0,
    };
  }

  const relationshipPath = curatedRelationshipCompleteness(lineage);
  const mutationRelations = lineage.curated_relationships.filter(
    (relationship) =>
      relationship.status === "established" &&
      relationship.mutation_type !== null &&
      relationship.sources.some(isUsableLinkedCitation),
  );
  const mutationConfidence =
    mutationRelations.length > 0
      ? Math.max(...mutationRelations.map((item) => item.confidence))
      : null;
  const originEstablished =
    stages.find((stage) => stage.id === "origin_assessment")?.status ===
    "established";
  const provenanceConfidence =
    relationshipPath.transmissionConfidences.length > 0
      ? relationshipPath.transmissionConfidences.reduce(
          (sum, confidence) => sum + confidence,
          0,
        ) / relationshipPath.transmissionConfidences.length
      : null;

  return {
    provenanceConfidence,
    mutationConfidence,
    originConfidence: originEstablished ? 1 : null,
    lineageCompleteness: relationshipPath.completeness,
  };
}

/**
 * Add assertion-specific evidence from a verified curated record to the five
 * provenance stages. Claim extraction, live search and source discovery are
 * always left untouched: a known-record match is a separate fast path and is
 * never represented as a live reconstruction.
 *
 * Existing live-established stages also remain authoritative. This helper only
 * promotes a stage that the live investigation did not itself establish.
 */
export function mergeVerifiedKnownRecordStages(
  _lineage: Lineage,
  _submittedSimilarity: number,
  stages: InvestigationStage[],
  _minimumSimilarity = KNOWN_RECORD_MATCH_THRESHOLD,
): InvestigationStage[] {
  // Retained as a compatibility helper for saved-result migrations only. Live
  // stages are no longer promoted by curated evidence.
  return stages.map((stage) => ({
    ...stage,
    evidenceIds: [...stage.evidenceIds],
  }));
}
