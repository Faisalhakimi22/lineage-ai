export type InvestigationStageStatus =
  | "not_attempted"
  | "in_progress"
  | "established"
  | "candidate"
  | "insufficient_evidence"
  | "blocked"
  | "error";

export type InvestigationStageId =
  | "claim_extracted"
  | "live_search"
  | "source_discovery"
  | "earliest_source"
  | "context_comparison"
  | "mutation_detection"
  | "origin_assessment"
  | "lineage";

export interface InvestigationStage {
  id: InvestigationStageId;
  status: InvestigationStageStatus;
  evidenceIds: string[];
  confidence: number | null;
  reason: string;
}

export type AcquisitionStatus =
  | "not_attempted"
  | "acquired"
  | "partial"
  | "failed"
  | "blocked"
  | "unsupported";

export type EvidenceDateType =
  | "publication"
  | "modified"
  | "event"
  | "upload"
  | "crawl_index"
  | "referenced_historical"
  | "unknown";

export type EvidenceDateSource =
  | "json_ld"
  | "opengraph"
  | "html_metadata"
  | "article_metadata"
  | "visible_text"
  | "provider"
  | "unknown";

export type EvidenceSourceType =
  | "primary"
  | "official"
  | "academic"
  | "fact_check"
  | "news"
  | "social"
  | "reference"
  | "other";

export interface EvidencePassage {
  id: string;
  sourceId: string;
  text: string;
  kind: "claim" | "context" | "date" | "provenance" | "metadata";
  relevance: number;
}

/**
 * Stable internal representation of one acquired source. `text` is deliberately
 * internal-only; the API exposes bounded relevant passages instead.
 */
export interface EvidenceSnapshot {
  id: string;
  providerResultId: string | null;
  originalUrl: string;
  finalUrl: string | null;
  canonicalUrl: string | null;
  title: string;
  domain: string;
  publisher: string | null;
  author: string | null;
  publishedAt: string | null;
  modifiedAt: string | null;
  dateType: EvidenceDateType;
  dateConfidence: number;
  dateEvidence: string | null;
  dateSource: EvidenceDateSource;
  dateEvidencePassageId: string | null;
  text: string;
  relevantPassages: EvidencePassage[];
  sourceType: EvidenceSourceType;
  providerScore: number | null;
  retrievalRelevance: number | null;
  claimRelevance: number | null;
  evidenceRelevance: number | null;
  acquisitionStatus: AcquisitionStatus;
  acquisitionError: string | null;
  extractionConfidence: number;
  discoveredByQueries: string[];
}

export type PublicEvidenceSnapshot = Omit<EvidenceSnapshot, "text">;

export type ClaimCertainty =
  | "possibility"
  | "uncertain"
  | "probable"
  | "asserted"
  | "confirmed"
  | "unknown";

export type SourceStance =
  | "asserts"
  | "reports"
  | "quotes"
  | "questions"
  | "corrects"
  | "rejects"
  | "neutral"
  | "unknown";

export type CorrectionVerdict =
  | "true"
  | "false"
  | "misleading"
  | "mixed"
  | "unverified"
  | "not_applicable";

export type ClaimType =
  | "claim"
  | "quotation"
  | "headline"
  | "caption"
  | "correction"
  | "fact_check_framing"
  | "unknown";

export interface SourceClaimVersion {
  id: string;
  sourceId: string;
  claim: string;
  /** Proposition represented by the passage, excluding narrator/verdict framing. */
  normalizedProposition: string;
  /** The publisher or passage narrator. This is not the grammatical subject. */
  narrator: string | null;
  /** Speaker of a directly attributed quotation, when the passage identifies one. */
  quotedSpeaker: string | null;
  sourceStance: SourceStance;
  correctionVerdict: CorrectionVerdict;
  claimType: ClaimType;
  /** The exact acquired passage from which all version fields were derived. */
  evidencePassageId: string;
  subject: string | null;
  event: string | null;
  eventDate: string | null;
  location: string | null;
  actor: string | null;
  attribution: string | null;
  causalLanguage: string | null;
  certainty: ClaimCertainty;
  captionContext: string | null;
  qualifiers: string[];
  evidenceIds: string[];
  confidence: number;
  extractionMethod: "deterministic" | "llm_assisted";
}

export type ComparisonChangeType =
  | "context_removed"
  | "context_added"
  | "cause_introduced"
  | "cause_removed"
  | "attribution_changed"
  | "date_changed"
  | "location_changed"
  | "certainty_strengthened"
  | "certainty_weakened"
  | "quotation_changed"
  | "caption_changed"
  | "old_media_reused"
  | "subject_changed"
  | "selective_evidence";

export interface ComparisonChange {
  type: ComparisonChangeType;
  before: string | null;
  after: string | null;
  explanation: string;
  evidenceIds: string[];
  confidence: number;
}

export type ProvenanceRelationshipType =
  | "temporal_order"
  | "same_claim"
  | "same_event"
  | "related_claim"
  | "derived_from"
  | "reposted_from"
  | "quoted_from"
  | "corrected_by"
  | "same_media";

export type LineageEdgeStatus =
  | "established"
  | "candidate"
  | "insufficient_evidence";

export type LineageEdgeEvidenceRole =
  | "relationship"
  | "before"
  | "after"
  | "occurrence"
  | "media_identity"
  | "source_reference";

export interface LineageEdgeEvidence {
  sourceId: string;
  passageId: string;
  exactText: string;
  role: LineageEdgeEvidenceRole;
}

export interface ProvenanceRelationshipAssessment {
  type: ProvenanceRelationshipType;
  status: LineageEdgeStatus;
  confidence: number;
  evidence: LineageEdgeEvidence[];
  reason: string;
}

export interface SourceComparison {
  id: string;
  fromSourceId: string;
  toSourceId: string;
  changes: ComparisonChange[];
  evidenceIds: string[];
  confidence: number;
  status: InvestigationStageStatus;
  relationship: ProvenanceRelationshipAssessment;
  reason: string;
}

export type RuntimeMutationType =
  | "stripped_context"
  | "exaggeration"
  | "fabricated_cause"
  | "recycled_old_media"
  | "misattribution"
  | "edited_media"
  | "false_caption"
  | "selective_evidence"
  | "translation_distortion"
  | "out_of_date_information"
  | "false_quotation"
  | "context_shift";

export interface DetectedMutation {
  id: string;
  fromSourceId: string;
  toSourceId: string;
  mutationType: RuntimeMutationType;
  evidenceIds: string[];
  evidence: LineageEdgeEvidence[];
  relationship: ProvenanceRelationshipAssessment;
  beforeEvidence: LineageEdgeEvidence;
  afterEvidence: LineageEdgeEvidence;
  confidence: number;
  status: "established" | "candidate";
  reason: string;
  explanation: string;
}

export type SubmittedOccurrenceEvidenceType =
  | "supplied_url"
  | "screenshot"
  | "image"
  | "source_post"
  | "quoted_context"
  | "source_metadata";

export interface SubmittedOccurrenceSourceRelationship {
  fromSourceId: string;
  relationship: ProvenanceRelationshipType;
  status: LineageEdgeStatus;
  confidence: number;
  evidence: LineageEdgeEvidence[];
  reason: string;
}

/**
 * Request-specific occurrence evidence. A normalized claim, search query, or
 * provider result is deliberately insufficient to construct this object.
 */
export interface SubmittedOccurrence {
  id: string;
  claim: string;
  exactText: string;
  normalizedProposition: string;
  evidenceType: SubmittedOccurrenceEvidenceType;
  sourceUrl: string | null;
  sourceIdentifier: string | null;
  timestamp: string | null;
  sourceContext: string | null;
  evidenceIds: string[];
  evidence: LineageEdgeEvidence[];
  confidence: number;
  sourceRelationship: SubmittedOccurrenceSourceRelationship | null;
}

export interface TemporalFinding {
  status: InvestigationStageStatus;
  sourceId: string | null;
  date: string | null;
  dateType: EvidenceDateType;
  confidence: number | null;
  evidenceIds: string[];
  reason: string;
}

export interface OriginFacet {
  status: InvestigationStageStatus;
  sourceId: string | null;
  confidence: number | null;
  evidenceIds: string[];
  reason: string;
}

export interface OriginAssessment {
  originalEvent: OriginFacet;
  earliestRelevantSource: TemporalFinding;
  misinformationOrigin: OriginFacet;
  likelyOriginCandidate: OriginFacet;
}

export interface RuntimeLineageNode {
  id: string;
  sourceId: string;
  kind: "source" | "submitted_claim" | "submitted_occurrence";
  claim: string;
  url: string | null;
  date: string | null;
  dateConfidence: number;
  evidenceIds: string[];
}

export interface RuntimeLineageEdge {
  id: string;
  fromSourceId: string;
  toSourceId: string;
  relationship: ProvenanceRelationshipType;
  status: LineageEdgeStatus;
  mutationType: RuntimeMutationType | null;
  mutationConfidence: number | null;
  evidenceIds: string[];
  evidence: LineageEdgeEvidence[];
  beforeEvidence: LineageEdgeEvidence | null;
  afterEvidence: LineageEdgeEvidence | null;
  confidence: number;
  reason: string;
  explanation: string;
}

export interface RuntimeLineageGraph {
  status: InvestigationStageStatus;
  nodes: RuntimeLineageNode[];
  edges: RuntimeLineageEdge[];
  evidenceIds: string[];
  confidence: number | null;
  submittedOccurrenceConnected: boolean;
  establishedTransitionCount: number;
  requiredTransitionCount: number;
  reason: string;
}

export interface ProvenanceScores {
  librarySimilarity: number;
  sourceRelevance: number | null;
  provenanceConfidence: number | null;
  mutationConfidence: number | null;
  originConfidence: number | null;
  lineageCompleteness: number;
}

export interface KnownRecordMatch {
  matched: boolean;
  lineageId: string | null;
  datasetProvenance: "externally_verified" | "illustrative" | null;
  similarity: number;
  eligibleAsVerifiedFastPath: boolean;
}

export interface ImageEvidence {
  id: string;
  sha256: string;
  perceptualHash: string | null;
  width: number | null;
  height: number | null;
  mediaType: string | null;
  byteLength: number;
  originalFilename: string | null;
  extractedText: string;
  evidenceIds: string[];
  reverseImageSearchStatus: "not_implemented";
}

export interface ProvenanceInvestigation {
  liveInvestigation: boolean;
  submittedOccurrence: SubmittedOccurrence | null;
  evidenceSnapshots: PublicEvidenceSnapshot[];
  sourceVersions: SourceClaimVersion[];
  comparisons: SourceComparison[];
  mutations: DetectedMutation[];
  originAssessment: OriginAssessment;
  dynamicLineage: RuntimeLineageGraph;
  investigationStages: InvestigationStage[];
  scores: Omit<ProvenanceScores, "librarySimilarity">;
}
