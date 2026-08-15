import { createHash } from "node:crypto";
import type {
  AnalyzeResult,
  InputType,
  Lineage,
  TraceStatus,
} from "@workspace/api-zod";
import { lineageRepository } from "../domain/repository";
import {
  buildMessengerSafeExplanation,
  buildSelfCheckSteps,
} from "./correction";
import { semanticMatchingAvailable } from "./embeddings";
import { extractClaim } from "./extraction";
import {
  type LiveSearchResult,
  type LiveSearchSource,
  searchLiveWebMulti,
} from "./live-search";
import { llmAvailable } from "./llm";
import { logger } from "./logger";
import { matchClaim, TRACE_THRESHOLD } from "./matching";
import type {
  EvidenceSnapshot,
  ImageEvidence,
  InvestigationStage,
  ProvenanceInvestigation,
  SubmittedOccurrence,
} from "./provenance/types";
import { acquireTopSourceDocuments } from "./provenance/source-enrichment";
import { buildDiscoveryQueries } from "./provenance/source-ranking";
import {
  buildKnownRecordMatch,
  buildVerifiedKnownRecordScores,
  buildVerifiedKnownRecordStages,
} from "./provenance/known-record";
import { runProvenanceInvestigation } from "./provenance/investigation";
import {
  buildSubmittedOccurrence,
  type SubmittedOccurrenceInput,
} from "./provenance/submitted-occurrence";

type SearchFunction = (
  queries: readonly string[],
) => Promise<LiveSearchResult>;
type AcquisitionFunction = (
  claim: string,
  sources: readonly LiveSearchSource[],
) => Promise<EvidenceSnapshot[]>;
type InvestigationFunction = (input: {
  claim: string;
  snapshots: EvidenceSnapshot[];
  liveSearchStatus: "not_attempted" | "not_configured" | "searched" | "failed";
  liveSearchEvidenceIds: string[];
  submittedEvidenceId?: string;
  submittedOccurrence?: SubmittedOccurrence | null;
  sourceAcquisitionError?: boolean;
}) => Promise<ProvenanceInvestigation>;

export interface AnalysisDependencies {
  lineageCandidates: () => Promise<Lineage[]>;
  search: SearchFunction;
  acquire: AcquisitionFunction;
  investigate: InvestigationFunction;
}

export interface AnalysisOptions {
  imageEvidence?: ImageEvidence | null;
  occurrence?: SubmittedOccurrenceInput | null;
  /** Test seam for controlled end-to-end provenance fixtures. */
  dependencies?: Partial<AnalysisDependencies>;
}

const DEFAULT_DEPENDENCIES: AnalysisDependencies = {
  lineageCandidates: () => lineageRepository.candidates(),
  search: searchLiveWebMulti,
  acquire: (claim, sources) => acquireTopSourceDocuments(claim, sources),
  investigate: runProvenanceInvestigation,
};

function bounded(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(1, value)) * 1_000) / 1_000;
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function claimExtractionEvidenceId(
  claim: string,
  imageEvidence: ImageEvidence | null,
): string {
  if (imageEvidence) return imageEvidence.id;
  const hash = createHash("sha256").update(claim).digest("hex").slice(0, 24);
  return `submission:text:${hash}`;
}

function searchEvidenceIds(liveSearch: LiveSearchResult): string[] {
  return unique(
    liveSearch.sources.map((source) => {
      if (source.provider_result_id) {
        return `search:${liveSearch.provider}:${source.provider_result_id}`;
      }
      const hash = createHash("sha256")
        .update(source.url)
        .digest("hex")
        .slice(0, 24);
      return `search:${liveSearch.provider}:${hash}`;
    }),
  );
}

function stageById(
  stages: InvestigationStage[],
  id: InvestigationStage["id"],
): InvestigationStage | undefined {
  return stages.find((stage) => stage.id === id);
}

function nonEstablishedReason(
  stages: InvestigationStage[],
  id: InvestigationStage["id"],
): string | null {
  const stage = stageById(stages, id);
  if (!stage || stage.status === "established") return null;
  return stage.reason;
}

/**
 * Orchestrates two deliberately separate paths:
 *
 * 1. a wording match against the 17-record known-case library; and
 * 2. a live provenance investigation whose acquired documents flow through
 *    extraction, chronology, comparison, mutation, origin and graph modules.
 *
 * Search snippets are retained as discovery leads, but only successfully
 * acquired page snapshots can contribute source versions or provenance edges.
 */
export async function runAnalysis(
  rawText: string,
  inputType: InputType,
  options: AnalysisOptions = {},
): Promise<AnalyzeResult> {
  const startedAt = Date.now();
  const dependencies: AnalysisDependencies = {
    ...DEFAULT_DEPENDENCIES,
    ...options.dependencies,
  };
  const imageEvidence = options.imageEvidence ?? null;

  const extraction = await extractClaim(rawText);
  const queries = buildDiscoveryQueries(extraction.claim);
  const [lineages, liveSearch] = await Promise.all([
    dependencies.lineageCandidates(),
    dependencies.search(queries),
  ]);

  const libraryMatchPromise = matchClaim(extraction.claim, lineages);
  let snapshots: EvidenceSnapshot[] = [];
  let sourceAcquisitionError = false;

  if (liveSearch.status === "searched" && liveSearch.sources.length > 0) {
    try {
      snapshots = await dependencies.acquire(extraction.claim, liveSearch.sources);
    } catch (error) {
      sourceAcquisitionError = true;
      logger.error(
        { err: error, sourceCount: liveSearch.sources.length },
        "provenance source acquisition failed unexpectedly",
      );
    }
  }

  const libraryMatch = await libraryMatchPromise;
  const librarySimilarity = bounded(libraryMatch.confidence);
  const knownRecordMatch = buildKnownRecordMatch(
    libraryMatch.lineage,
    librarySimilarity,
    TRACE_THRESHOLD,
  );

  const knownRecordStages = buildVerifiedKnownRecordStages(
    libraryMatch.lineage,
    librarySimilarity,
    TRACE_THRESHOLD,
  );
  const knownRecordScores = buildVerifiedKnownRecordScores(
    libraryMatch.lineage,
    librarySimilarity,
    TRACE_THRESHOLD,
  );
  const knownLineageEstablished = knownRecordStages.some(
    (stage) => stage.id === "lineage" && stage.status === "established",
  );
  // The compact legacy status may summarize either path, but the evidence and
  // stage arrays remain separate. A verified known record with no complete
  // transmission path is partial, never a completed live trace.
  const knownTraceStatus: TraceStatus = !knownRecordMatch.eligibleAsVerifiedFastPath
    ? "UNTRACED"
    : knownLineageEstablished
      ? "TRACED"
      : "PARTIALLY_TRACED";
  const lineage =
    knownTraceStatus === "UNTRACED" ? null : libraryMatch.lineage;
  const knownTraced = knownTraceStatus === "TRACED" && lineage !== null;
  const submissionEvidenceId = claimExtractionEvidenceId(
    extraction.claim,
    imageEvidence,
  );
  const submittedOccurrence = buildSubmittedOccurrence({
    claim: extraction.claim,
    rawText,
    occurrence: options.occurrence,
    imageEvidence,
  });

  const provenance = await dependencies.investigate({
    claim: extraction.claim,
    snapshots,
    liveSearchStatus: liveSearch.status,
    liveSearchEvidenceIds: searchEvidenceIds(liveSearch),
    submittedEvidenceId: submissionEvidenceId,
    submittedOccurrence,
    sourceAcquisitionError,
  });

  const investigationStages = provenance.investigationStages;
  // `trace_status` remains a compact compatibility field, but it now reflects
  // a genuinely completed live path as well as the verified known-case path.
  // A candidate graph that does not reach the submitted occurrence stays
  // UNTRACED; the structured stage/graph status carries that candidate detail.
  const liveTraceStatus: TraceStatus =
    provenance.dynamicLineage.status === "established"
      ? "TRACED"
      : provenance.dynamicLineage.establishedTransitionCount > 0
        ? "PARTIALLY_TRACED"
        : "UNTRACED";
  const status: TraceStatus =
    liveTraceStatus === "TRACED" || knownTraceStatus === "TRACED"
      ? "TRACED"
      : liveTraceStatus === "PARTIALLY_TRACED" ||
          knownTraceStatus === "PARTIALLY_TRACED"
        ? "PARTIALLY_TRACED"
        : "UNTRACED";

  const acquiredCount = snapshots.filter(
    (snapshot) => snapshot.acquisitionStatus === "acquired",
  ).length;
  const partialCount = snapshots.filter(
    (snapshot) => snapshot.acquisitionStatus === "partial",
  ).length;
  const what_we_found: string[] = [];
  const what_we_did_not_find: string[] = [];
  const uncertainty_notes: string[] = [];

  if (knownTraced && lineage) {
    what_we_found.push(
      `A verified known-case record matches this wording: "${lineage.canonical_claim}".`,
      "The known-case record is a separate fast path; the live-source investigation is reported independently.",
    );
  } else if (knownTraceStatus === "PARTIALLY_TRACED" && lineage) {
    what_we_found.push(
      `A verified known-case record matches this wording: "${lineage.canonical_claim}". Its curated evidence is reported separately from the live investigation.`,
    );
    uncertainty_notes.push(
      "The curated record does not contain a complete directed transmission path and is not treated as a completed live reconstruction.",
    );
  } else if (
    knownRecordMatch.matched &&
    knownRecordMatch.datasetProvenance === "illustrative" &&
    libraryMatch.lineage
  ) {
    what_we_found.push(
      `An illustrative teaching record closely matches this wording: "${libraryMatch.lineage.canonical_claim}".`,
    );
    what_we_did_not_find.push(
      "An externally verified known-case lineage for that library match.",
    );
    uncertainty_notes.push(
      "Illustrative records can identify familiar wording, but their authored mutation chains are not established evidence and are never used as provenance.",
    );
  } else {
    what_we_did_not_find.push(
      "A sufficiently similar externally verified record in the 17-case known-record library.",
    );
    uncertainty_notes.push(
      "LINEAGE could not establish provenance from the available evidence — not that it is false. The known-record library contains two externally verified cases; absence from that small library is not evidence of falsity.",
    );
  }

  if (liveSearch.status === "searched") {
    what_we_found.push(
      `Live discovery returned ${liveSearch.sources.length} source lead${liveSearch.sources.length === 1 ? "" : "s"}; ${acquiredCount} page${acquiredCount === 1 ? " was" : "s were"} acquired and ${partialCount} partially acquired.`,
    );
  } else if (liveSearch.status === "failed") {
    what_we_did_not_find.push("A completed live-source discovery result.");
  } else {
    what_we_did_not_find.push(
      "A live-source investigation because no search provider is configured.",
    );
  }

  if (provenance.sourceVersions.length > 0) {
    what_we_found.push(
      `${provenance.sourceVersions.length} claim version${provenance.sourceVersions.length === 1 ? " was" : "s were"} extracted from acquired source passages.`,
    );
  }
  if (provenance.comparisons.length > 0) {
    what_we_found.push(
      `${provenance.comparisons.length} temporally ordered source comparison${provenance.comparisons.length === 1 ? " was" : "s were"} completed.`,
    );
  }
  if (provenance.mutations.length > 0) {
    const establishedMutations = provenance.mutations.filter(
      (mutation) => mutation.status === "established",
    ).length;
    what_we_found.push(
      `${provenance.mutations.length} evidence-backed mutation candidate${provenance.mutations.length === 1 ? " was" : "s were"} identified; ${establishedMutations} met the established threshold.`,
    );
  }
  if (provenance.dynamicLineage.status === "established") {
    what_we_found.push(
      "A fully evidence-backed live mutation path reaches the submitted occurrence.",
    );
  } else if (provenance.dynamicLineage.status === "candidate") {
    uncertainty_notes.push(provenance.dynamicLineage.reason);
  }

  const earliestReason = nonEstablishedReason(investigationStages, "earliest_source");
  const comparisonReason = nonEstablishedReason(
    investigationStages,
    "context_comparison",
  );
  const mutationReason = nonEstablishedReason(
    investigationStages,
    "mutation_detection",
  );
  const originReason = nonEstablishedReason(investigationStages, "origin_assessment");
  const lineageReason = nonEstablishedReason(investigationStages, "lineage");
  if (earliestReason) what_we_did_not_find.push(earliestReason);
  if (comparisonReason) what_we_did_not_find.push(comparisonReason);
  if (mutationReason) what_we_did_not_find.push(mutationReason);
  if (originReason) what_we_did_not_find.push(originReason);
  if (lineageReason) what_we_did_not_find.push(lineageReason);

  if (!(await semanticMatchingAvailable())) {
    uncertainty_notes.push(
      "Known-record matching used lexical similarity only. This affects wording matching, not live evidence extraction.",
    );
  }
  if (libraryMatch.reason) what_we_found.push(libraryMatch.reason);
  if (liveSearch.note) uncertainty_notes.push(liveSearch.note);
  if (sourceAcquisitionError) {
    uncertainty_notes.push(
      "Document acquisition ended unexpectedly; affected provenance stages are marked as errors rather than as missing evidence.",
    );
  }
  if (imageEvidence) {
    uncertainty_notes.push(
      "The uploaded image was retained as hashed submission evidence for this request. OCR feeds the text pipeline; reverse-image provenance is not implemented.",
    );
  }

  const result: AnalyzeResult = {
    extracted_claim: extraction.claim,
    input_type: inputType,
    trace_status: status,
    // Kept only for response compatibility. The UI labels this value as
    // known-record wording similarity; it is not a truth score.
    confidence: librarySimilarity,
    matching_strategy: libraryMatch.strategy,
    lineage,
    candidates: libraryMatch.candidates,
    live_search: liveSearch,
    knownRecordMatch,
    knownRecordStages,
    knownRecordScores,
    liveInvestigation: provenance.liveInvestigation,
    evidenceSnapshots: provenance.evidenceSnapshots,
    sourceVersions: provenance.sourceVersions,
    comparisons: provenance.comparisons,
    mutations: provenance.mutations,
    originAssessment: provenance.originAssessment,
    dynamicLineage: provenance.dynamicLineage,
    investigationStages,
    librarySimilarity,
    sourceRelevance: provenance.scores.sourceRelevance,
    provenanceConfidence: provenance.scores.provenanceConfidence,
    mutationConfidence: provenance.scores.mutationConfidence,
    originConfidence: provenance.scores.originConfidence,
    lineageCompleteness: provenance.scores.lineageCompleteness,
    imageEvidence,
    submittedOccurrence: provenance.submittedOccurrence,
    what_we_found: unique(what_we_found),
    what_we_did_not_find: unique(what_we_did_not_find),
    uncertainty_notes: unique(uncertainty_notes),
    messenger_safe_explanation:
      knownTraced && lineage ? buildMessengerSafeExplanation(lineage) : null,
    self_check_steps: buildSelfCheckSteps(lineage),
    analysis_id: null,
  };

  logger.info(
    {
      inputType,
      traceStatus: status,
      librarySimilarity,
      matchingStrategy: libraryMatch.strategy,
      knownRecordMatched: knownRecordMatch.matched,
      knownRecordFastPath: knownRecordMatch.eligibleAsVerifiedFastPath,
      extractionNormalised: extraction.normalised,
      llmAvailable: llmAvailable(),
      liveSearchStatus: liveSearch.status,
      liveSearchSourceCount: liveSearch.sources.length,
      acquiredSourceCount: acquiredCount,
      sourceVersionCount: provenance.sourceVersions.length,
      mutationCount: provenance.mutations.length,
      dynamicEdgeCount: provenance.dynamicLineage.edges.length,
      durationMs: Date.now() - startedAt,
    },
    "analysis completed",
  );

  return result;
}
